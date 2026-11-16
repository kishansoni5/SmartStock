# SmartStock – Distributed Inventory & Order Management System

SmartStock is an enterprise-grade inventory and order management system built using a **Modular Monolith** architecture with **Event-Driven Order Processing** powered by **Apache Kafka** (KRaft mode).

The system coordinates product catalog management, multi-warehouse inventory allocation, resilient asynchronous order fulfillment via the **Transactional Outbox Pattern**, and concurrency-safe order cancellation using database row locks and atomic conditional updates.

---

## Table of Contents
1. [Project Overview](#-project-overview)
2. [Key Features](#-key-features)
3. [System Architecture](#-system-architecture)
4. [Technology Stack](#-technology-stack)
5. [Project Structure](#-project-structure)
6. [Database Design](#-database-design)
7. [Order Lifecycle & Asynchronous Processing](#-order-lifecycle--asynchronous-processing)
8. [Practical Engineering Scenarios](#-practical-engineering-scenarios)
9. [REST API Reference](#-rest-api-reference)
10. [Local Development Setup](#-local-development-setup)
11. [AWS EC2 Production Deployment](#-aws-ec2-production-deployment)
12. [Testing & Verification](#-testing--verification)
13. [Environment Variables Reference](#-environment-variables-reference)
14. [Security & Concurrency Guarantees](#-security--concurrency-guarantees)
15. [Known Limitations & Future Enhancements](#-known-limitations--future-enhancements)
16. [License](#-license)

---

## 🌟 Project Overview

Modern e-commerce and supply chain platforms must handle concurrent order spikes, ensure stock consistency across multiple fulfillment centers, and prevent dual-write anomalies between databases and message brokers. 

SmartStock addresses these challenges inside a clean **Modular Monolith** boundary:
- Eliminates the operational overhead of microservices (network latency, distributed 2PC transactions, split-brain failures).
- Uses the **Transactional Outbox Pattern** to guarantee atomic state changes and reliable event publishing without distributed transactions.
- Uses **Apache Kafka** in KRaft mode for high-throughput, ordered event streaming.
- Guarantees **zero overselling** under high concurrency through conditional atomic SQL updates and pessimistic row locking (`SELECT ... FOR UPDATE`).
- Enforces strict **Role-Based Access Control (RBAC)** via Spring Security 6 and stateless HMAC-SHA256 JSON Web Tokens (JJWT).

---

## 🚀 Key Features

### 1. Identity & Access Management (Auth Module)
- **Stateless JWT Authentication:** HMAC-SHA256 signed JSON Web Tokens containing user ID, email, and role claims.
- **Role-Based Access Control (RBAC):** Strict separation between `CUSTOMER` and `ADMIN` privileges.
- **Secure Password Hashing:** BCrypt algorithm with salted rounds.
- **Self-Service Registration:** Public signup strictly assigns the `CUSTOMER` role to prevent privilege escalation.
- **Configurable Bootstrap Seeder:** Environment-driven admin bootstrapping (`ADMIN_SEED_ENABLED=true`), disabled by default in production.

### 2. Product Catalog & Warehouse Inventory Management
- **Hierarchical Catalog:** Dynamic Category and Product management with unique SKU enforcement.
- **Multi-Facility Stock Tracking:** Independent stock tracking per product-warehouse pair (e.g., Surat and Mumbai fulfillment centers).
- **Stock Integrity Safeguards:** Database check constraints (`on_hand >= 0`, `reserved >= 0`, `reserved <= on_hand`, `price >= 0`) preventing negative stock and invalid pricing.
- **Administrative Stock Adjustments:** Controlled increments/decrements with validation against active reservations.
- **Soft Deactivation:** Safe deactivation of discontinued products without breaking existing order references.

### 3. Asynchronous Order Processing & Transactional Outbox
- **Non-Blocking Order Submission:** Orders are accepted and persisted in `PENDING` status with sub-second response times.
- **Zero Dual-Write Hazard:** Order creation and event insertion into `outbox_events` share the same ACID database transaction.
- **Scheduled Outbox Publisher:** Decoupled background worker polling pending events with broker acknowledgment verification, batch processing, and configurable retries.
- **Short-Lived Status Transactions:** Outbox status updates (`PUBLISHED` or retry counter increment) execute in isolated `REQUIRES_NEW` transactions, never holding database connections open during Kafka network I/O.

### 4. Resilient Kafka Consumer & Warehouse Fulfillment
- **Smart Dual-Warehouse Strategy:** Priority-based fulfillment checking (Surat preferred; Mumbai fallback). Entire orders are fulfilled from a single warehouse (no multi-warehouse splits).
- **Atomic Stock Reservation:** High-concurrency conditional SQL updates (`WHERE (on_hand - reserved) >= :qty`) preventing race conditions and overselling.
- **Consumer Idempotency:** Event deduplication via `processed_events` table; duplicate Kafka messages are safely skipped.
- **Manual Immediate Acknowledgments:** Messages acknowledged (`AckMode.MANUAL_IMMEDIATE`) only after successful database commits.
- **Dead Letter Topic (DLT) & Poison Pill Isolation:** Invalid payloads, missing mandatory fields, or exhausted retries route safely to `order.created.v1.DLT` without stalling topic partitions.

### 5. Concurrency-Safe Order Cancellation
- **Pessimistic Locking (`PESSIMISTIC_WRITE`):** Concurrent order cancellation requests and Kafka inventory reservation workers are serialized via database row locks (`SELECT ... FOR UPDATE`).
- **Automated Stock Compensation:** Cancelling a `CONFIRMED` order transactionally releases reserved inventory; cancelling a `PENDING` order prevents future reservations.
- **Cancellation Attribution:** Tracks whether an order was cancelled by the customer or an administrator via `cancelled_by_role`.
- **IDOR Protection:** Customers can only inspect or cancel their own orders; administrators possess global management privileges.

---

## 🏛️ System Architecture

SmartStock avoids microservice antipatterns (cross-network chattiness, distributed 2PC transactions) by adopting a **Modular Monolith** with clean bounded contexts:

```mermaid
flowchart TD
    subgraph Client["Client Tier"]
        Browser["Web Browser (React 18 SPA)"]
    end

    subgraph Ingress["Ingress Tier (Port 80 HTTP)"]
        Nginx["Nginx Reverse Proxy & Web Server"]
    end

    subgraph Backend["SmartStock Backend (Spring Boot 3.3.4 - Port 8080)"]
        Gate["Spring Security & JWT Filter"]

        subgraph Modules["Domain Modules"]
            AuthMod["auth: JWT Auth & RBAC"]
            OrderMod["order: Order Lifecycle & Outbox"]
            InvMod["inventory: Catalog, Warehouses & Stock"]
            NotifMod["notification: Async Event Alerts (Stub)"]
        end

        OutboxWorker["Scheduled Outbox Publisher"]
        KafkaConsumer["Inventory Kafka Consumer"]
    end

    subgraph KafkaBroker["Apache Kafka 3.8.0 (KRaft Mode - Port 29092)"]
        MainTopic{{"Topic: order.created.v1 (3 Partitions)"}}
        DLTTopic{{"Topic: order.created.v1.DLT (3 Partitions)"}}
    end

    subgraph Database["MySQL 8.0 Relational Storage (Flyway Managed - Port 3306)"]
        Tables[("9 Normalized Tables:<br/>app_users, categories, products, warehouses,<br/>inventories, orders, order_items,<br/>outbox_events, processed_events")]
    end

    Browser -->|HTTP Requests| Nginx
    Nginx -->|Static Assets '/'| Browser
    Nginx -->|Proxy API '/api/'| Gate

    Gate --> AuthMod
    Gate --> OrderMod
    Gate --> InvMod

    OrderMod -->|1. Write Order & Outbox in 1 TX| Tables
    OutboxWorker -->|2. Poll PENDING Events| Tables
    OutboxWorker -->|3. Publish Key=orderId| MainTopic
    OutboxWorker -->|4. Mark PUBLISHED (REQUIRES_NEW)| Tables

    MainTopic -->|5. Consume (MANUAL_IMMEDIATE)| KafkaConsumer
    KafkaConsumer -->|6. Idempotency Check & Atomic Stock Reservation| Tables
    KafkaConsumer -.->|Poison Pill / Retries Exhausted| DLTTopic
```

For complete architecture details and sequence diagrams, refer to:
- [Architecture Deep Dive](docs/architecture.md)
- [Database Schema & ERD Documentation](docs/database-design.md)
- [REST API Reference](docs/api-documentation.md)
- [Deployment Guide](docs/deployment-guide.md)

---

## 🛠️ Technology Stack

| Layer | Component | Version | Description |
| :--- | :--- | :--- | :--- |
| **Backend Framework** | Java, Spring Boot | Java 17, Spring Boot 3.3.4 | Core enterprise application framework |
| **Security** | Spring Security, JJWT | Spring Security 6, JJWT 0.12.6 | Stateless JWT authentication & method security (`@PreAuthorize`) |
| **Persistence** | Spring Data JPA, Hibernate, Flyway | Hibernate 6, Flyway 10.10.0 | Relational ORM with Flyway migration management (`ddl-auto=validate`) |
| **Messaging** | Apache Kafka (KRaft), `spring-kafka` | Apache Kafka 3.8.0, Spring Kafka 3.2.4 | Event streaming without ZooKeeper dependency |
| **Database** | MySQL | MySQL 8.0 | ACID relational storage with engine-level constraints |
| **Frontend** | React, Vite, Tailwind CSS | React 18.3.1, Vite 5.4.8, Tailwind 4.3.5 | Single Page Application with Axios and React Router 6 |
| **Reverse Proxy** | Nginx | 1.27 Alpine | Ingress routing, static asset caching, and security headers |
| **Infrastructure** | Docker, Docker Compose | Compose v2 | Multi-container orchestration for local and production |
| **Testing** | JUnit 5, Mockito, Spring Boot Test, H2 | JUnit 5.10.3, Mockito 5.11.0 | Unit, integration, concurrency, and end-to-end event workflow testing |

---

## 📁 Project Structure

```
smartstock/
├── backend/                               # Spring Boot 3.3.4 modular monolith
│   ├── src/main/java/com/smartstock/
│   │   ├── common/                        # Cross-cutting concerns
│   │   │   ├── config/                    # SecurityConfig, KafkaConfig, SchedulingConfig
│   │   │   ├── event/                     # DomainEvent, OutboxPublisher, OutboxEventUpdateService
│   │   │   ├── exception/                 # GlobalExceptionHandler, Custom Exceptions
│   │   │   ├── response/                  # Unified ApiResponse<T> envelope
│   │   │   └── security/                  # JwtAuthenticationFilter, JwtService, EntryPoints
│   │   └── modules/                       # Domain bounded contexts
│   │       ├── auth/                      # Controllers, DTOs, AppUser, Seeder, Service
│   │       ├── inventory/                 # Product, Category, Warehouse, Inventory, Consumer
│   │       ├── notification/              # Async notification event handlers (Stub)
│   │       └── order/                     # Order, OrderItem, OrderService, Controllers
│   ├── src/main/resources/
│   │   ├── db/migration/                  # Flyway database migration scripts (V1, V2)
│   │   └── application.yml                # Unified Spring Boot configuration
│   ├── src/test/java/com/smartstock/      # 96 automated unit and integration tests
│   ├── Dockerfile                         # Multi-stage production build (Temurin 17 JRE)
│   ├── pom.xml                            # Maven project build descriptor
│   └── .env.example                       # Local environment variables template
├── frontend/                              # React 18 SPA + Vite
│   ├── src/
│   │   ├── api/                           # Axios instance and service modules
│   │   ├── components/                    # UI components (Admin, Customer, Layout, Common)
│   │   ├── context/                       # AuthContext and CartContext state providers
│   │   ├── pages/                         # Customer & Admin views (Dashboard, Orders, Catalog)
│   │   └── routes/                        # Protected routes and role-based route guards
│   ├── Dockerfile                         # Multi-stage production build (Node 20 -> Nginx)
│   ├── nginx.conf                         # Local container reverse proxy configuration
│   ├── package.json                       # Dependencies & build scripts
│   └── .env.example                       # Frontend environment template
├── infrastructure/                        # Deployment and orchestration configurations
│   ├── local/                             # Local development docker-compose (MySQL + Kafka + Kafka UI)
│   ├── aws/                               # AWS EC2 production docker-compose & Nginx reverse proxy
│   └── init-scripts/                      # Database startup scripts (01-init.sql)
└── docs/                                  # Detailed architectural and operational documentation
    ├── architecture.md                    # Deep-dive system architecture and sequence diagrams
    ├── database-design.md                 # Complete schema, constraints, and ERD documentation
    ├── api-documentation.md               # Detailed request/response examples for all endpoints
    └── deployment-guide.md                # AWS EC2 operations, setup, and maintenance guide
```

---

## 🗄️ Database Design

SmartStock uses MySQL 8.0 with schema migrations strictly managed by **Flyway**. Hibernate DDL auto-generation is disabled (`spring.jpa.hibernate.ddl-auto=validate`).

### Migration History
1. `V1__initial_schema.sql`: Creates initial 9 normalized tables, foreign keys, indexes, and database check constraints.
2. `V2__add_cancelled_by_role_to_orders.sql`: Adds `cancelled_by_role VARCHAR(20) NULL` column to `orders` table to track whether cancellations originate from `CUSTOMER` or `ADMIN`.

### Database Tables (9 Normalized Tables)

| Table | Module | Description | Primary Key | Key Constraints & Indexes |
| :--- | :--- | :--- | :--- | :--- |
| `app_users` | `auth` | Application accounts & credentials | `id` (BIGINT AUTO) | `UNIQUE(email)` |
| `categories` | `inventory` | Product category taxonomy | `id` (BIGINT AUTO) | `UNIQUE(name)` |
| `products` | `inventory` | Catalog items with pricing | `id` (BIGINT AUTO) | `UNIQUE(sku)`, `CHECK(price >= 0)`, `FK(category_id)` |
| `warehouses` | `inventory` | Physical fulfillment facilities | `id` (BIGINT AUTO) | Indexes on `name`, `location` |
| `inventories` | `inventory` | Stock levels per product-warehouse | `id` (BIGINT AUTO) | `UNIQUE(product_id, warehouse_id)`, `CHECK(on_hand >= 0)`, `CHECK(reserved >= 0)`, `CHECK(reserved <= on_hand)` |
| `orders` | `order` | Order state and financial totals | `id` (BIGINT AUTO) | `FK(user_id)`, `FK(warehouse_id)`, `CHECK(total_amount >= 0)` |
| `order_items` | `order` | Line items associated with orders | `id` (BIGINT AUTO) | `FK(order_id) ON DELETE CASCADE`, `FK(product_id)`, `CHECK(quantity > 0)` |
| `outbox_events` | `common` | Transactional outbox event store | `id` (BIGINT AUTO) | `UNIQUE(event_id)`, Index on `status`, `createdAt` |
| `processed_events`| `common` | Consumer event deduplication log | `id` (BIGINT AUTO) | `UNIQUE(event_id)` |

---

## 🔄 Order Lifecycle & Asynchronous Processing

The following diagram and step-by-step breakdown illustrate the complete lifecycle of an order from customer submission to warehouse confirmation or rejection:

```
[Customer Browser]
       │
       │ 1. POST /api/v1/orders (Bearer JWT)
       ▼
[OrderController / OrderService]
       │
       │ 2. Validate items & active product catalog
       │ 3. Compute running total
       │ 4. Begin ACID Database Transaction:
       │    ├── Insert `orders` record (status = PENDING, warehouse = NULL)
       │    ├── Insert `order_items` line records
       │    └── Insert `outbox_events` (status = PENDING, payload = OrderCreatedEvent JSON)
       │ 5. Commit Transaction
       │
       ▼ (Sub-second response: HTTP 201 Created)
[Customer receives OrderResponse (status: PENDING)]

---------------------------------- ASYNCHRONOUS BOUNDARY ----------------------------------

[OutboxPublisher (Scheduled Worker @ 2000ms)]
       │
       │ 6. Poll `outbox_events` WHERE status = 'PENDING' ORDER BY created_at ASC
       │ 7. Publish to Kafka topic 'order.created.v1' (Partition Key = orderId)
       │ 8. Await broker ACK (sendTimeoutSeconds: 5s)
       │ 9. Update `outbox_events` status = 'PUBLISHED' in dedicated REQUIRES_NEW transaction
       │
       ▼
[Apache Kafka (KRaft Broker)]
       │
       │ 10. Delivers record to consumer group 'smartstock-group'
       ▼
[OrderCreatedKafkaListener]
       │
       │ 11. Validate payload JSON schema
       │     ├── Malformed / Invalid -> Forward directly to 'order.created.v1.DLT' & ACK
       │     └── Valid -> Delegate to InventoryReservationService
       ▼
[InventoryReservationService (@Transactional)]
       │
       │ 12. Idempotency Check: Does eventId exist in `processed_events`?
       │     └── YES -> Acknowledge message & terminate (duplicate skipped)
       │ 13. Acquire pessimistic write lock: `orderRepository.findByIdForUpdate(orderId)`
       │     └── If status != PENDING (e.g. CANCELLED) -> Record processed event & skip
       │ 14. Priority Warehouse Evaluation:
       │     ├── Candidate 1: "Surat Warehouse"
       │     │   └── Pre-check stock: available = (on_hand - reserved) >= quantity?
       │     │   └── Atomic conditional SQL: reserveStock(productId, warehouseId, quantity)
       │     │       ├── If ALL items succeed -> Assigned!
       │     │       └── If ANY item fails -> Compensate (releaseStock) & evaluate next
       │     └── Candidate 2: "Mumbai Warehouse" (fallback)
       │         └── Evaluate all items with same atomic reservation flow
       │
       │ 15. Outcome Resolution:
       │     ├── Warehouse found:
       │     │   ├── order.status = CONFIRMED, order.warehouse = fulfilledWarehouse
       │     │   └── Record event in `processed_events`
       │     └── No warehouse can fulfill the entire order:
       │         ├── order.status = REJECTED, order.warehouse = NULL
       │         └── Record event in `processed_events`
       │ 16. Commit Database Transaction
       ▼
[Kafka Consumer Acknowledgment]
       │
       │ 17. acknowledgment.acknowledge() invoked (AckMode.MANUAL_IMMEDIATE)
       ▼
(Order lifecycle completed: Final state CONFIRMED or REJECTED)
```

### Component Responsibilities

| Component | Responsibility |
| :--- | :--- |
| `OrderService` | Validates line items, persists order in `PENDING` status, and creates the outbox record in a single database transaction. |
| `outbox_events` table | Persistent buffer ensuring zero message loss if Kafka is temporarily unavailable at order placement time. |
| `OutboxPublisher` | Background worker that decouples Kafka network transmission from HTTP requests, guaranteeing at-least-once delivery. |
| `OutboxEventUpdateService` | Executes outbox status transitions in short, isolated transactions (`REQUIRES_NEW`) to avoid long-lived database locks. |
| `Apache Kafka` | Distributes order events across partitions keyed by `orderId`, preserving strict per-order delivery sequence. |
| `OrderCreatedKafkaListener` | Ingests Kafka records, guards against poison pills, enforces manual commit semantics, and handles retries. |
| `InventoryReservationService` | Executes fulfillment logic: idempotency checks, warehouse selection priority, and conditional reservation. |
| `processed_events` table | Persistent ledger of processed event IDs ensuring exact-once processing semantics at the domain level. |

---

## ⚙️ Practical Engineering Scenarios

### 1. Order Processing Failure Scenarios
- **Kafka Broker Unavailable:** When a customer places an order while Kafka is offline, the HTTP order request **still succeeds** (201 Created). The order and outbox event are committed safely to MySQL. The `OutboxPublisher` logs the timeout, marks the attempt, and keeps status as `PENDING`. As soon as Kafka recovers, the poller automatically drains the queue.
- **Malformed Payloads (Poison Pills):** If an invalid JSON string or an event lacking required identifiers (`eventId` or `orderId`) reaches the topic, `OrderCreatedKafkaListener` catches `JsonProcessingException` or validation errors, forwards the payload synchronously to `order.created.v1.DLT`, and immediately calls `acknowledgment.acknowledge()`. This isolates the poison pill without crashing the consumer or blocking other partitions.
- **Transient Database Errors:** If an unexpected transient database failure occurs during reservation, the transaction rolls back, no Kafka acknowledgment is issued, and Spring Kafka's `DefaultErrorHandler` retries 3 times with a 1-second backoff before routing to the DLT.

### 2. Duplicate Kafka Event Handling
Kafka provides **at-least-once** delivery guarantees. Duplicate deliveries can occur during network blips or consumer group rebalances. SmartStock handles duplicates through a two-layer defense:
1. **Application-Level Pre-check:** `InventoryReservationService` queries `processed_events` table for `eventId`. If found, it skips reservation immediately and logs the occurrence.
2. **Database Unique Constraint Guard:** Under heavy concurrency where two duplicate deliveries execute simultaneously, both may pass the initial read. However, when writing to `processed_events`, the `UNIQUE(event_id)` database index throws a `DataIntegrityViolationException`. The consumer catches this, performs a clean check via `isEventProcessed(eventId)` in a fresh transaction, and acknowledges the message without throwing errors or double-reserving inventory.

### 3. Warehouse Fallback Behavior
SmartStock operates a **single-warehouse fulfillment policy** (orders are never split across multiple warehouses):
1. **Primary Warehouse:** Evaluates "Surat Warehouse" first. If Surat possesses sufficient available stock for *all* line items, stock is reserved and the order is assigned to Surat.
2. **Fallback Warehouse:** If Surat lacks stock for even a single item, any partial reservations made in Surat are rolled back, and "Mumbai Warehouse" is evaluated.
3. **Order Rejection:** If neither Surat nor Mumbai can fulfill the entire order, the order is marked `REJECTED`, and no inventory remains locked.

### 4. Insufficient Inventory Handling
When a requested product is out of stock across all fulfillment facilities:
1. The reservation loop exhausts all candidate warehouses without finding a match.
2. The order status transitions from `PENDING` to `REJECTED`.
3. The event is recorded in `processed_events` and acknowledged in Kafka.
4. The customer sees the updated `REJECTED` status in their order history with explanation.

### 5. Safe Order Cancellation & Concurrency Serialization
A classic distributed race condition occurs when a customer cancels an order at the exact millisecond the Kafka consumer attempts to fulfill it. SmartStock serializes this via pessimistic database row locking:
- Both `OrderService.cancelOrder` and `InventoryReservationService.processOrderCreated` execute:
  ```java
  Order order = orderRepository.findByIdForUpdate(orderId); // SELECT ... FOR UPDATE
  ```
- **Scenario A (Cancellation wins lock):** The order transitions to `CANCELLED`. When the Kafka worker later obtains the lock, it observes `order.getStatus() != OrderStatus.PENDING`, skips reservation, records the event in `processed_events`, and exits cleanly.
- **Scenario B (Reservation wins lock):** The order transitions to `CONFIRMED` and stock is reserved. When the cancellation later obtains the lock, it detects the `CONFIRMED` state, reads the assigned warehouse, executes `inventoryRepository.releaseStock` for each line item, decrements `reserved`, and transitions status to `CANCELLED`.
- Orders already in `REJECTED` or `CANCELLED` status throw an `IllegalStateException` preventing invalid state transitions.

### 6. Docker Container vs. Docker Volume
- **Containers are Ephemeral:** Stopping, removing, or rebuilding a container (`docker compose up -d --build`) destroys the container's writable layer. Any files written inside the container (e.g. `/tmp` or application logs) are discarded.
- **Volumes are Persistent:** SmartStock declares explicit named volumes (`mysql_prod_data`, `kafka_prod_data` in AWS prod; `mysql_data`, `kafka_data` in local). These volumes reside on the host filesystem under Docker's volume store (`/var/lib/docker/volumes`). Stopping or upgrading containers (`docker compose down`) preserves all database records, schema migrations, and Kafka topic offsets intact. Only passing `-v` (`docker compose down -v`) destroys the persistent volume data.

### 7. Production Debugging Commands
```bash
# View real-time status of all containers
docker compose ps

# View consolidated live container logs
docker compose logs -f

# Inspect specific service logs
docker compose logs -f backend
docker compose logs -f kafka
docker compose logs -f mysql
docker compose logs -f nginx

# Check backend health actuator internally
docker compose exec backend curl -f http://localhost:8080/api/v1/actuator/health

# Open MySQL shell inside running database container
docker compose exec mysql mysql -u smartstock_user -p smartstock

# Inspect Kafka topic partitions and offsets
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:29092 --describe --group smartstock-prod-group
```

---

## 🚀 REST API Reference

All backend endpoints are prefixed with `/api/v1`. All responses follow a standardized `ApiResponse<T>` envelope:
```json
{
  "success": true,
  "message": "Human-readable summary",
  "data": { ... },
  "timestamp": "2026-11-16T15:00:00"
}
```

### Authentication Endpoints (`/api/v1/auth`)

| Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Public | Register a new customer account (strictly assigns `CUSTOMER` role) |
| `POST` | `/auth/login` | Public | Authenticate credentials & retrieve 24h Bearer JWT |
| `GET` | `/auth/me` | Authenticated (`CUSTOMER`, `ADMIN`) | Fetch authenticated user profile & role |
| `GET` | `/auth/admin/ping` | `ADMIN` only | Health check for administrative credentials |

### Catalog Category Endpoints (`/api/v1/categories`)

| Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/categories` | Authenticated (`CUSTOMER`, `ADMIN`) | List all product categories |
| `GET` | `/categories/{id}` | Authenticated (`CUSTOMER`, `ADMIN`) | Retrieve category details by ID |
| `POST` | `/categories` | `ADMIN` only | Create a new product category |
| `PUT` | `/categories/{id}` | `ADMIN` only | Update an existing category name/description |
| `DELETE` | `/categories/{id}` | `ADMIN` only | Delete category (fails if active products are linked) |

### Product Catalog Endpoints (`/api/v1/products`)

| Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/products` | Authenticated (`CUSTOMER`, `ADMIN`) | List catalog products (optional `activeOnly` filter) |
| `GET` | `/products/{id}` | Authenticated (`CUSTOMER`, `ADMIN`) | Retrieve product details by ID |
| `POST` | `/products` | `ADMIN` only | Create a new product (with SKU, price, category ID) |
| `PUT` | `/products/{id}` | `ADMIN` only | Update product details |
| `DELETE` | `/products/{id}` | `ADMIN` only | Soft-deactivate a product (`active=false`) |

### Warehouse Endpoints (`/api/v1/warehouses`)

| Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/warehouses` | Authenticated (`CUSTOMER`, `ADMIN`) | List all fulfillment warehouses |
| `GET` | `/warehouses/{id}` | Authenticated (`CUSTOMER`, `ADMIN`) | Retrieve warehouse details by ID |
| `POST` | `/warehouses` | `ADMIN` only | Create a new fulfillment warehouse |
| `PUT` | `/warehouses/{id}` | `ADMIN` only | Update warehouse details |

### Inventory Endpoints (`/api/v1/inventory`)

| Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/inventory` | Authenticated (`CUSTOMER`, `ADMIN`) | List all inventory allocations across facilities |
| `GET` | `/inventory/product/{id}`| Authenticated (`CUSTOMER`, `ADMIN`)| View warehouse breakdown for a specific product |
| `GET` | `/inventory/warehouse/{id}`| Authenticated (`CUSTOMER`, `ADMIN`)| View all product stock inside a specific warehouse |
| `POST` | `/inventory/adjust` | `ADMIN` only | Manually adjust physical `on_hand` stock levels |

### Customer Order Endpoints (`/api/v1/orders`)

| Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/orders` | `CUSTOMER` only | Submit a new order (creates Outbox event; returns `PENDING`) |
| `GET` | `/orders` | `CUSTOMER` only | View authenticated customer order history |
| `GET` | `/orders/my` | `CUSTOMER` only | Alias for `/orders` customer order history |
| `GET` | `/orders/{id}` | `CUSTOMER` / `ADMIN` | Retrieve order details (IDOR ownership check enforced) |
| `POST` | `/orders/{id}/cancel` | `CUSTOMER` / `ADMIN` | Cancel order & release reserved stock (IDOR ownership checked) |

### Administrative Order Endpoints (`/api/v1/admin/orders`)

| Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/admin/orders` | `ADMIN` only | Paginated order list with optional status filtering |
| `GET` | `/admin/orders/{id}` | `ADMIN` only | View full details of any customer order |
| `POST` | `/admin/orders/{id}/cancel`| `ADMIN` only | Force cancel any order & trigger inventory compensation |

---

## 💻 Local Development Setup

The local development setup runs containerized MySQL and Kafka dependencies while executing the Spring Boot backend and React frontend directly on the developer host for rapid inner-loop productivity.

### Prerequisites
- **Java Development Kit (JDK):** Version 17
- **Apache Maven:** Version 3.8+
- **Node.js:** Version 18+ & npm 9+
- **Docker & Docker Compose:** Installed and running

### Step 1: Start Infrastructure Containers (MySQL & Kafka)
Navigate to `infrastructure/local`:
```bash
cd infrastructure/local

# Copy environment template
cp .env.example .env

# Launch MySQL 8.0, Kafka KRaft, and Kafka Web UI
docker compose up -d
```
*Note: MySQL binds to host port `3307` locally to avoid port collisions with any existing local MySQL installation.*

Verify container readiness:
```bash
docker compose ps
```
- **MySQL 8.0:** `localhost:3307`
- **Apache Kafka:** `localhost:9092`
- **Kafka Web UI:** Open [http://localhost:8085](http://localhost:8085) to view topic partitions and consumer groups.

### Step 2: Configure & Start the Backend
From the workspace root, navigate to `backend`:
```bash
cd backend

# Copy environment template
cp .env.example .env
```
Ensure `backend/.env` points to the local container ports:
```dotenv
SERVER_PORT=8081
DB_HOST=localhost
DB_PORT=3307
DB_NAME=smartstock
DB_USERNAME=smartstock_user
DB_PASSWORD=smartstock_pass
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
JWT_SECRET=404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970
ADMIN_SEED_ENABLED=true
ADMIN_NAME=Super Admin
ADMIN_EMAIL=admin@smartstock.local
ADMIN_PASSWORD=Admin@Password123
DEV_DATA_SEED_ENABLED=true
```

Compile and run the Spring Boot application:
```bash
mvn clean spring-boot:run
```
The backend initializes on **`http://localhost:8081/api/v1`**. Flyway automatically executes database migrations (`V1` and `V2`). Health status is available at `http://localhost:8081/api/v1/actuator/health`.

### Step 3: Configure & Start the Frontend
In a new terminal window, navigate to `frontend`:
```bash
cd frontend

# Copy environment template
cp .env.example .env

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser. The Vite dev server proxies `/api` calls directly to `http://localhost:8081`.

---

## ☁️ AWS EC2 Production Deployment

The production environment packages the entire stack into isolated Docker containers on an AWS EC2 instance. Nginx is the sole public-facing service, terminating HTTP traffic and routing between static frontend assets and the internal Spring Boot API.

### Target Deployment Specifications
- **Cloud Provider:** Amazon Web Services (AWS)
- **Region:** Mumbai (`ap-south-1`)
- **Operating System:** Ubuntu Linux (Ubuntu 24.04 LTS / modern Ubuntu on EC2)
- **Instance Type:** `m7i-flex.large` (2 vCPU, 8 GB RAM)
- **Storage:** 30 GB+ General Purpose SSD (`gp3`) EBS volume
- **Stack:** Docker Compose running Nginx, Spring Boot (JDK 17), MySQL 8.0, and Apache Kafka 3.8.0 (KRaft)

> [!IMPORTANT]
> **Protocol Disclaimer:** The deployed application currently runs over **plain HTTP (Port 80)**. HTTPS (Port 443) is not currently configured or active. Enabling HTTPS requires provisioning a custom domain name and configuring an SSL/TLS certificate (e.g., via Let's Encrypt / Certbot).
> 
> **Backup Disclaimer:** Automated backups (such as AWS DLM snapshot lifecycle policies or automated remote database replication) are not currently configured. Database backups are performed via manual `mysqldump` exports.

### 1. EC2 Security Group Configuration
Configure your EC2 Security Group with the following inbound rules:

| Type | Protocol | Port Range | Source | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **SSH** | TCP | `22` | `Your-Admin-IP/32` | Secure administrative shell access |
| **HTTP** | TCP | `80` | `0.0.0.0/0` | Public web traffic and API reverse proxy |
| **HTTPS** | TCP | `443` | `0.0.0.0/0` | Prepared for future SSL termination |

> [!WARNING]
> Never open ports `3306`, `3307`, `8080`, `8081`, `9092`, or `29092` to the public Internet (`0.0.0.0/0`). MySQL and Kafka operate strictly within the internal Docker bridge network (`smartstock-network`).

### 2. Connect to EC2 Host via SSH
```bash
ssh -i /path/to/your-key.pem ubuntu@<EC2-PUBLIC-IP>
```

### 3. Install Docker and Docker Compose on Ubuntu
```bash
# Update package lists and install prerequisites
sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Add Docker GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Set up repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine and Compose plugin
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable non-root docker execution
sudo usermod -aG docker $USER
newgrp docker
```

### 4. Clone Repository
```bash
git clone https://github.com/kishansoni5/SmartStock.git
cd SmartStock
```

### 5. Configure Production Secrets (`.env`)
Navigate to `infrastructure/aws`:
```bash
cd infrastructure/aws

# Create production environment file from template
cp .env.example .env

# Lock file permissions so only root/owner can read
chmod 600 .env

# Edit environment variables
nano .env
```

Supply strong, randomly generated production secrets:
```dotenv
# MySQL Database Credentials (generate via: openssl rand -hex 16)
MYSQL_ROOT_PASSWORD=replace_with_strong_random_root_password_min_24_chars
DB_NAME=smartstock
DB_USERNAME=smartstock_user
DB_PASSWORD=replace_with_strong_random_app_password_min_24_chars

# Spring Boot Security & JWT (generate via: openssl rand -base64 32)
JWT_SECRET=replace_with_openssl_rand_base64_32_secret_key_minimum_256_bits
JWT_EXPIRATION_MS=86400000

# CORS Configuration
CORS_ALLOWED_ORIGINS=*

# Initial Administrator Bootstrapping
# Set ADMIN_SEED_ENABLED=true for the very first startup only.
# Once bootstrapped, set ADMIN_SEED_ENABLED=false and restart backend.
ADMIN_SEED_ENABLED=true
ADMIN_NAME=System Administrator
ADMIN_EMAIL=admin@yourcompany.com
ADMIN_PASSWORD=replace_with_secure_initial_password

# Kafka Consumer Group
KAFKA_CONSUMER_GROUP=smartstock-prod-group
```

### 6. Build and Launch Production Stack
```bash
docker compose up -d --build
```
This builds the multi-stage Docker images for the React frontend (with Nginx) and Spring Boot backend, then starts MySQL, Kafka, Backend, and Nginx.

### 7. Health Checks and Logs
Verify that all 4 containers report `Up (healthy)`:
```bash
docker compose ps
```
Monitor startup logs:
```bash
docker compose logs -f backend
```
Test backend health internally:
```bash
docker compose exec backend curl -f http://localhost:8080/api/v1/actuator/health
```

### 8. Application Access
Open `http://<EC2-PUBLIC-IP>` in your browser. Nginx serves the React SPA on port 80 and proxies all requests starting with `/api/` to the internal Spring Boot container.

### 9. Safe Shutdown and Restart Procedures
- **Stop containers without removing them:**
  ```bash
  docker compose stop
  ```
- **Restart the entire stack:**
  ```bash
  docker compose start
  ```
- **Tear down containers while safely preserving persistent volumes:**
  ```bash
  docker compose down
  ```
- **Restart a single service (e.g. backend after config change):**
  ```bash
  docker compose restart backend
  ```
- **Rebuild and restart after pulling new code:**
  ```bash
  git pull origin main
  docker compose up -d --build
  ```

### 10. Persistent Storage Considerations
Data is stored inside named Docker volumes mapped to `/var/lib/docker/volumes`:
- `mysql_prod_data`: Preserves all relational tables, indexes, and Flyway migration state.
- `kafka_prod_data`: Preserves topic partitions, message logs, and consumer group offsets at `/var/lib/kafka/data`.

Containers can be stopped, recreated, or rebuilt without losing database records or Kafka messages. **Never run `docker compose down -v` in production**, as the `-v` flag removes named volumes.

### 11. Public IP Changes on EC2 Restart
Standard EC2 instances receive a dynamic public IPv4 address from AWS. If the EC2 instance is **stopped and started** from the AWS Management Console:
- AWS releases the previous public IPv4 address and assigns a **new public IPv4 address**.
- To prevent IP changes, allocate an **AWS Elastic IP (EIP)** and associate it with your EC2 instance, or map a custom domain name using Amazon Route 53 or an external DNS provider.

---

## 🧪 Testing & Verification

SmartStock includes a comprehensive automated test suite with **96 tests across 12 test classes** (13 test files including nested test classes), covering repository constraints, business services, outbox polling, Kafka consumer error handling, and end-to-end event workflows.

### Running Backend Tests
From the `backend` directory:
```bash
mvn clean test
```

### Verified Test Suite Breakdown (All 96 Tests Passing)

| Test Class | Verified Test Count | Scope & Verification Coverage |
| :--- | :---: | :--- |
| `AuthControllerTests` | **9** | Registration, login authentication, validation errors, token issuance, duplicate email rejections |
| `AdminAccountSeederTests` | **4** | Startup admin bootstrapping when enabled/disabled, password encoding, duplicate avoidance |
| `DevelopmentDataSeederTests` | **4** | Catalog categories, products, warehouses, and inventory seeder when enabled/disabled |
| `DatabaseLayerTests` | **4** | Flyway schema execution, unique constraints, check constraints (`price >= 0`, `reserved <= on_hand`) |
| `InventoryModuleIntegrationTests` | **15** | Product, Category, and Warehouse CRUD operations, soft deletion, and stock query methods |
| `InventoryReservationServiceIntegrationTests` | **10** | Dual-warehouse evaluation, Surat preference, Mumbai fallback, atomic reservations, rollback |
| `OrderModuleIntegrationTests` | **20** | Order submission, item validation, ownership verification, pagination, IDOR security |
| `OutboxPublisherTests` | **8** | Unit verification of publisher batch polling, status transitions, failure handling, topic resolution |
| `OutboxPublisherIntegrationTests` | **3** | Scheduled poller integration, delivery status updates, retry count tracking |
| `OutboxEventUpdateServiceTests` | **3** | Isolated transaction boundary verification (`REQUIRES_NEW`) during outbox status updates |
| `OrderCreatedKafkaListenerTests` | **9** | Kafka listener ack modes, poison pill isolation, duplicate delivery handling, DLT forwarding |
| `OrderEndToEndWorkflowIntegrationTests` | **6** | Full pipeline: Place Order ➔ Outbox ➔ Kafka ➔ Dual-Warehouse Fulfillment ➔ Stock Reservation ➔ Status |
| `SmartStockApplicationTests` | **1** | Full Spring Boot application context load verification |
| **Total** | **96** | **All 96 tests passing (0 failures, 0 errors, 0 skipped)** |

---

## 🔐 Environment Variables Reference

### Backend Configuration (`backend/.env` & `application.yml`)

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `SERVER_PORT` | `8080` (prod) / `8081` (local) | Spring Boot HTTP port |
| `DB_HOST` | `localhost` (local) / `mysql` (prod) | MySQL host address |
| `DB_PORT` | `3306` (prod) / `3307` (local host) | MySQL port |
| `DB_NAME` | `smartstock` | Database schema name |
| `DB_USERNAME` | `smartstock_user` | Application database username |
| `DB_PASSWORD` | `smartstock_pass` | Application database password |
| `JPA_DDL_AUTO` | `validate` | Hibernate DDL validation mode (strictly verified against Flyway) |
| `SHOW_SQL` | `false` | SQL query logging toggle |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` / `kafka:29092` | Apache Kafka broker bootstrap address |
| `KAFKA_CONSUMER_GROUP` | `smartstock-group` | Consumer group identifier |
| `JWT_SECRET` | *(Required)* | 256-bit cryptographically secure secret key for signing tokens |
| `JWT_EXPIRATION_MS` | `86400000` (24h) | JWT lifespan in milliseconds |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Permitted cross-origin origins (or `*` behind Nginx) |
| `OUTBOX_PUBLISHER_ENABLED` | `true` | Toggle for scheduled outbox poller |
| `OUTBOX_PUBLISHER_FIXED_DELAY_MS` | `2000` | Polling interval for pending outbox events (ms) |
| `OUTBOX_PUBLISHER_BATCH_SIZE` | `50` | Maximum outbox records fetched per polling cycle |
| `OUTBOX_PUBLISHER_TIMEOUT_SECONDS`| `5` | Kafka broker send acknowledgment timeout |
| `ADMIN_SEED_ENABLED` | `false` | Enable startup admin account bootstrapping |
| `ADMIN_NAME` | *(None)* | Initial admin account display name |
| `ADMIN_EMAIL` | *(None)* | Initial admin account email |
| `ADMIN_PASSWORD` | *(None)* | Initial admin account password |
| `DEV_DATA_SEED_ENABLED` | `false` | Populate dummy catalog, warehouse, and stock data on boot |

---

## 🔒 Security & Concurrency Guarantees

1. **Zero Secret Leakage:** No plaintext credentials or JWT signing keys are stored in source code; `.env` is git-ignored and `.env.example` contains sanitized placeholders.
2. **In-Flight Concurrency Protection:** Race conditions between client order cancellation and background Kafka stock reservation are eliminated through database-level row locking (`SELECT ... FOR UPDATE`).
3. **Atomic Inventory Reservation:** Inventory updates use atomic SQL conditional updates:
   ```sql
   UPDATE inventories
   SET reserved = reserved + :quantity,
       version = version + 1,
       updated_at = CURRENT_TIMESTAMP
   WHERE product_id = :productId
     AND warehouse_id = :warehouseId
     AND (on_hand - reserved) >= :quantity;
   ```
   This prevents overselling under heavy concurrency without holding database table locks.
4. **Idempotent Messaging:** Duplicate Kafka events caused by network retries or consumer group rebalances are caught via `processed_events` and acknowledged without duplicating inventory changes.
5. **Sanitized Exception Handling:** Generic server exceptions (500) hide stack traces and internal query details from API responses to prevent information disclosure.
6. **No Public Database or Broker Ports in Production:** In the AWS deployment, MySQL (port 3306) and Kafka (port 29092) are exposed strictly on the internal Docker network. Only Nginx (port 80) is accessible from the Internet.

---

## 📌 Known Limitations & Future Enhancements

- **HTTPS / SSL Configuration:** HTTPS is not currently enabled on the live deployment. A custom domain name and SSL certificate (via Let's Encrypt / Certbot) must be configured to terminate TLS at the Nginx reverse proxy.
- **Automated Backups:** Automated backups via AWS DLM or cron-based S3 database archiving are not currently implemented. Backups are performed via manual `mysqldump` procedures.
- **Notification Module:** The notification package (`com.smartstock.modules.notification`) is currently a stub reserved for future SMTP email and SMS delivery integrations.
- **Payment Gateway Integration:** Direct payment capture (Stripe/Razorpay webhook callbacks) can be hooked into the order confirmation state transition.
- **Multi-Warehouse Order Splitting:** Future releases can introduce split fulfillment logic when no single warehouse has sufficient inventory to satisfy an entire customer order.
- **Kafka Cluster High Availability:** The current AWS deployment runs a single KRaft broker container with `replication-factor: 1`. For mission-critical multi-AZ enterprise production, this can be transitioned to **AWS MSK (Amazon Managed Streaming for Apache Kafka)**.

---

## 📄 License

This project is open-source and available under the terms of the [MIT License](https://opensource.org/licenses/MIT).
