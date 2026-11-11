# SmartStock System Architecture

## 1. Architectural Philosophy: The Modular Monolith

SmartStock is architected as an **Event-Driven Modular Monolith**.

### Why Modular Monolith instead of Microservices?
In production software engineering and technical interviews, an essential principle is avoiding premature distributed systems complexity. Decomposing into microservices too early introduces:
- Distributed transactions (2PC / Saga overhead) and cross-network latency.
- High operational surface area (service discovery, distributed tracing, network failure modes).
- Data fragmentation across distinct databases.

The **Modular Monolith** provides the optimal balance:
1. **Strict Domain Boundaries:** Each domain feature module (`auth`, `inventory`, `order`, `notification`) encapsulates its own entities, DTOs, business rules, and repository contracts.
2. **ACID Transaction Guarantees:** Modules operate within a unified relational database, enabling bulletproof patterns like the **Transactional Outbox**.
3. **Decoupled Asynchronous Processing:** High-contention operations (e.g. order reservation) are processed asynchronously via Apache Kafka.
4. **Clean Extraction Path:** Because modules have zero hidden coupling, any module can be separated into an independent microservice when business scale warrants it.

---

## 2. System Architecture & Module Map

```mermaid
flowchart TD
    subgraph Client["Frontend Client (React + Vite)"]
        UI["SPA Interface (React Router + Axios)"]
        State["Auth Context & JWT Store"]
    end

    subgraph Monolith["SmartStock Backend (Spring Boot 3.3.4 Modular Monolith)"]
        Gate["Spring Security & JWT Filter"]
        
        subgraph AuthModule["Auth Module"]
            AuthCtrl["AuthController"]
            AuthSvc["AuthService"]
            UserRepo["AppUserRepository"]
        end

        subgraph OrderModule["Order Module"]
            OrderCtrl["OrderController & AdminOrderController"]
            OrderSvc["OrderService"]
            OrderRepo["OrderRepository"]
            OutboxTable[("outbox_events Table")]
            OutboxPub["Scheduled OutboxPublisher"]
        end

        subgraph InventoryModule["Inventory Module"]
            InvCtrl["Category / Product / Warehouse / Inventory Controllers"]
            InvSvc["InventoryService & InventoryReservationService"]
            InvRepo["InventoryRepository & WarehouseRepository"]
            InvConsumer["OrderCreatedKafkaListener"]
            ProcEvents[("processed_events Table")]
        end

        subgraph NotificationModule["Notification Module (Reserved)"]
            NotifSvc["Email / In-App Notification Service"]
        end
    end

    subgraph Broker["Apache Kafka Infrastructure"]
        OrderTopic{{"Topic: order.created.v1 (3 Partitions)"}}
        DLTTopic{{"Topic: order.created.v1.DLT (3 Partitions)"}}
    end

    subgraph Database["MySQL 8.0 Relational Storage (Flyway Managed)"]
        MySQL[("app_users, categories, products, warehouses, inventories, orders, order_items, outbox_events, processed_events")]
    end

    UI -->|REST + Bearer JWT| Gate
    Gate --> AuthCtrl
    Gate --> OrderCtrl
    Gate --> InvCtrl

    AuthSvc --> UserRepo --> MySQL
    OrderSvc --> OrderRepo --> MySQL
    OrderSvc --> OutboxTable --> MySQL
    InvSvc --> InvRepo --> MySQL

    OutboxPub -->|1. Poll PENDING events| OutboxTable
    OutboxPub -->|2. Publish key=orderId| OrderTopic
    OutboxPub -->|3. Mark PUBLISHED| OutboxTable

    OrderTopic -->|Consume MANUAL_IMMEDIATE| InvConsumer
    InvConsumer -->|Delegate Transactional Reservation| InvSvc
    InvConsumer -.->|Poison Pill / Retries Exhausted| DLTTopic
    InvSvc -->|Idempotency Check & Record| ProcEvents
    InvSvc -->|Atomic Conditional Update| InvRepo
    InvSvc -->|Status CONFIRMED / REJECTED| OrderRepo
```

---

## 3. End-to-End Order Processing Flow

The core workflow employs the **Transactional Outbox Pattern** to achieve guaranteed event publishing without distributed transactions:

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer (Client)
    participant OrderCtrl as OrderController
    participant OrderSvc as OrderService
    participant DB as MySQL Database
    participant Publisher as OutboxPublisher (Scheduled)
    participant Kafka as Kafka (order.created.v1)
    participant Listener as OrderCreatedKafkaListener
    participant ResSvc as InventoryReservationService
    participant DLT as Kafka DLT (order.created.v1.DLT)

    Customer->>OrderCtrl: POST /api/v1/orders
    OrderCtrl->>OrderSvc: createOrder(request, customerEmail)
    activate OrderSvc
    Note over OrderSvc,DB: Single DB Transaction (@Transactional)
    OrderSvc->>DB: 1. Validate items & calculate total amount
    OrderSvc->>DB: 2. Insert orders (status: PENDING, warehouse: null)
    OrderSvc->>DB: 3. Insert order_items (unitPrice snapshot)
    OrderSvc->>DB: 4. Insert outbox_events (status: PENDING, payload: JSON)
    OrderSvc-->>OrderCtrl: 201 Created (OrderResponse, status: PENDING)
    deactivate OrderSvc
    OrderCtrl-->>Customer: Order Response (PENDING)

    loop Every 2000ms
        Publisher->>DB: Poll PENDING outbox_events (batch size: 50)
        Publisher->>Kafka: send(order.created.v1, key=orderId, payload)
        Kafka-->>Publisher: Broker ACK (metadata: partition, offset)
        Publisher->>DB: Update outbox_events status -> PUBLISHED
    end

    Kafka->>Listener: onOrderCreated(payload, key, Acknowledgment)
    activate Listener
    alt Malformed JSON Payload
        Listener->>DLT: sendToDlt(key, payload) (waits up to 5s)
        DLT-->>Listener: DLT ACK
        Listener->>Kafka: acknowledgment.acknowledge()
    else Valid OrderCreatedEvent
        Listener->>ResSvc: processOrderCreated(event)
        activate ResSvc
        Note over ResSvc,DB: Single DB Transaction (@Transactional)
        ResSvc->>DB: Check processed_events by eventId
        alt Already Processed (Duplicate)
            ResSvc-->>Listener: SKIPPED_DUPLICATE
            Listener->>Kafka: acknowledgment.acknowledge()
        else Fresh Event
            ResSvc->>DB: Lock Order (findByIdForUpdate)
            alt Order not in PENDING status (e.g. CANCELLED)
                ResSvc->>DB: Record processed_event & skip
            else Order is PENDING
                ResSvc->>DB: Evaluate Surat Warehouse (Priority 1)
                alt Surat has sufficient stock for all items
                    ResSvc->>DB: Atomic update: reserveStock(on_hand - reserved >= qty)
                    ResSvc->>DB: Update orders -> CONFIRMED, warehouse -> Surat
                    ResSvc->>DB: Insert processed_events
                else Surat lacks stock -> Fallback to Mumbai (Priority 2)
                    ResSvc->>DB: Evaluate Mumbai Warehouse
                    alt Mumbai has sufficient stock
                        ResSvc->>DB: Atomic update: reserveStock(...)
                        ResSvc->>DB: Update orders -> CONFIRMED, warehouse -> Mumbai
                        ResSvc->>DB: Insert processed_events
                    else Neither warehouse can fulfill complete order
                        ResSvc->>DB: Update orders -> REJECTED, warehouse -> null
                        ResSvc->>DB: Insert processed_events
                    end
                end
            end
            ResSvc-->>Listener: CONFIRMED or REJECTED
            deactivate ResSvc
            Listener->>Kafka: acknowledgment.acknowledge() (Offset committed)
        end
    end
    deactivate Listener
```

---

## 4. Key Architectural Deep Dives

### 4.1. Concurrency Safety: Atomic Conditional SQL Updates
To prevent inventory overselling under high concurrency, SmartStock does not rely on application-level locks. Instead, it utilizes database row-level locking via atomic conditional updates:

```sql
UPDATE inventories
SET reserved = reserved + :quantity,
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE product_id = :productId
  AND warehouse_id = :warehouseId
  AND (on_hand - reserved) >= :quantity;
```

- If `(on_hand - reserved) >= :quantity` evaluates to true, exactly **1 row** is updated.
- If concurrent transactions consume stock, the row count is **0**, indicating the stock was claimed.
- No phantom reads, negative stock, or overselling is possible.

### 4.2. All-or-Nothing Multi-Item Reservation
An order is never split across warehouses.
1. When evaluating a candidate warehouse, each item is reserved sequentially.
2. If item 1 succeeds but item 2 fails:
   - All earlier reserved items at that warehouse are released via `releaseStock()` before evaluating the next warehouse.
   - If compensation fails (`released != 1`), an `IllegalStateException` is thrown immediately, rolling back the database transaction and aborting evaluation of subsequent warehouses.

### 4.3. Safe Order Cancellation
SmartStock allows customers and administrators to cancel orders safely:
```mermaid
flowchart TD
    Req["Customer / Admin calls POST /api/v1/orders/{id}/cancel"] --> Lock["Acquire Pessimistic Write Lock: findByIdForUpdate(orderId)"]
    Lock --> Check{"Check Order Status"}
    Check -->|Already CANCELLED| Err1["Throw 400 Bad Request (Already cancelled)"]
    Check -->|Already REJECTED| Err2["Throw 400 Bad Request (Cannot cancel rejected order)"]
    Check -->|Status is PENDING| CancelPending["Update status -> CANCELLED\n(Kafka consumer will read CANCELLED and skip reservation)"]
    Check -->|Status is CONFIRMED| ReleaseStock["Iterate items -> releaseStock(warehouseId, qty)\nUpdate status -> CANCELLED"]
    CancelPending --> Commit["Commit Transaction & Return OrderResponse"]
    ReleaseStock --> Commit
```

### 4.4. Kafka Reliability, Retries & Dead Letter Topic (DLT)
- **Container Acknowledgment Mode:** `AckMode.MANUAL_IMMEDIATE`. Offsets are committed **only after** the database transaction completes.
- **Error Handling:** `DefaultErrorHandler` configured with `FixedBackOff(1000L, 3L)` (3 retries).
- **Poison Pill Isolation:** Malformed JSON and deserialization errors are classified as non-retryable and routed directly to `order.created.v1.DLT` via synchronous publication (`future.get(5, TimeUnit.SECONDS)`) before acknowledging the offset, preventing partition blocking.
- **Duplicate Delivery Absorption:** If duplicate messages race concurrently, the unique constraint on `processed_events.event_id` raises a `DataIntegrityViolationException`. The listener verifies event presence via `isEventProcessed(eventId)` in a fresh read-only transaction and acknowledges the duplicate cleanly.

---

## 5. Security & RBAC Architecture

- **Stateless JWT:** Bearer token authentication via JJWT (HMAC-SHA256 with 256-bit+ secret).
- **Password Hashing:** BCrypt with default strength (10 rounds).
- **Role-Based Access Control:**
  - `CUSTOMER`: Can place orders, view their own order history (`GET /api/v1/orders`), view their own order details (`GET /api/v1/orders/{id}`), and cancel their own orders.
  - `ADMIN`: Full administrative control, including paginated order exploration (`GET /api/v1/admin/orders`), catalog management, warehouse setup, and inventory adjustments.
- **IDOR Protection:** Ownership validation ensures customers can never inspect or cancel another customer's orders.
- **Data Protection:** Generic internal exception messages are sanitized to prevent database error or stack trace leakage in 500 responses.
