# SmartStock – Distributed Inventory & Order Management System

SmartStock is an enterprise-grade inventory and order management system built using a **Modular Monolith** architecture with **Event-Driven Order Processing** powered by **Apache Kafka**.

Designed to demonstrate modern software engineering practices, distributed systems patterns, database concurrency control, and zero-trust security suitable for production environments and technical interviews.

---

## 🌟 Key Features

### 1. Identity & Access Management (Auth Module)
- **Stateless JWT Authentication:** HMAC-SHA256 signed JSON Web Tokens containing user ID, email, and role claims.
- **Role-Based Access Control (RBAC):** Strict authorization separation between `CUSTOMER` and `ADMIN` roles.
- **Secure Password Hashing:** BCrypt algorithm with salted rounds.
- **Self-Service Registration:** Customer signup defaults strictly to `CUSTOMER` role (tamper-proof against privilege escalation).
- **Automated Dev Seeder:** Environment-driven admin bootstrapping (`ADMIN_SEED_ENABLED=true`), fully disabled by default in production.

### 2. Product Catalog & Warehouse Inventory Management
- **Hierarchical Catalog:** Dynamic Category and Product management with unique SKU enforcement.
- **Multi-Warehouse Topology:** Multi-facility stock tracking (e.g., Surat and Mumbai fulfillment centers).
- **Strict Data Validation:** Positive stock quantities, `BigDecimal` monetary representations, and soft product deactivation.
- **Stock Adjustment Auditing:** Admin endpoints for controlled stock increments/decrements with negative-stock prevention.

### 3. Asynchronous Order Processing & Transactional Outbox
- **Non-Blocking Order Submission:** Orders are accepted and persisted in `PENDING` state with near-zero latency, avoiding dual-write hazards.
- **Transactional Outbox Pattern:** Order creation and event insertion into `outbox_events` share the same database transaction.
- **Scheduled Outbox Publisher:** Reliable background worker publishing events with broker acknowledgment verification, batch processing, and configurable retries.

### 4. Resilient Kafka Consumer & Warehouse Fulfillment
- **Smart Dual-Warehouse Strategy:** Priority-based fulfillment checking (Surat preferred; Mumbai fallback). Entire orders are fulfilled from a single warehouse (no multi-warehouse splits).
- **Atomic Stock Reservation:** High-concurrency conditional SQL updates (`WHERE on_hand - reserved >= :qty`) preventing race conditions and overselling.
- **Consumer Idempotency:** Event deduplication via `processed_events` table; duplicate Kafka messages are safely skipped.
- **Manual Immediate Acknowledgments:** Messages acknowledged (`AckMode.MANUAL_IMMEDIATE`) only after successful database commits.
- **Dead Letter Topic (DLT) & Poison Pill Isolation:** Invalid payloads, non-retryable failures, or max-retry exhaustion route synchronously to `order.created.v1.DLT` without stalling topic partitions.

### 5. Concurrency-Safe Order Cancellation
- **Pessimistic Locking (`PESSIMISTIC_WRITE`):** Concurrent order cancellation and Kafka inventory reservation are serialized via database row locks.
- **Automated Stock Release:** Cancelling a `CONFIRMED` order transactionally restores reserved inventory; cancelling a `PENDING` order prevents future reservations.
- **IDOR Protection:** Customers can only cancel or inspect their own orders; administrators possess global management privileges.

---

## 🏛️ System Architecture

SmartStock avoids microservice antipatterns (cross-network chattiness, distributed 2PC transactions) by adopting a **Modular Monolith** with clean bounded contexts:

```mermaid
flowchart TD
    subgraph Client["Frontend Client (React 18 + Vite)"]
        UI["SPA Interface (React Router + Axios)"]
    end

    subgraph Backend["SmartStock Backend (Spring Boot 3.3.4)"]
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

    subgraph KafkaBroker["Apache Kafka (KRaft Mode)"]
        MainTopic{{"Topic: order.created.v1 (3 Partitions)"}}
        DLTTopic{{"Topic: order.created.v1.DLT (3 Partitions)"}}
    end

    subgraph Database["MySQL 8.0 Relational Storage (Flyway Managed)"]
        Tables[("9 Normalized Tables:<br/>app_users, categories, products, warehouses,<br/>inventories, orders, order_items,<br/>outbox_events, processed_events")]
    end

    UI -->|REST with Bearer JWT| Gate
    Gate --> AuthMod
    Gate --> OrderMod
    Gate --> InvMod

    OrderMod -->|1. Write Order & Outbox in 1 TX| Tables
    OutboxWorker -->|2. Poll PENDING Events| Tables
    OutboxWorker -->|3. Publish Key=orderId| MainTopic
    OutboxWorker -->|4. Mark PUBLISHED| Tables

    MainTopic -->|5. Consume (MANUAL_IMMEDIATE)| KafkaConsumer
    KafkaConsumer -->|6. Idempotency Check & Atomic Stock Reservation| Tables
    KafkaConsumer -.->|Poison Pill / Retries Exhausted| DLTTopic
```

For complete architecture details and sequence diagrams, refer to:
- [Architecture Deep Dive](docs/architecture.md)
- [Database Schema & ERD Documentation](docs/database-design.md)
- [REST API Reference](docs/api-documentation.md)

---

## 🚀 REST API Reference

All endpoints are prefixed with `/api/v1`.

| Module | Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | `POST` | `/auth/register` | Public | Register a new customer account |
| | `POST` | `/auth/login` | Public | Authenticate credentials & retrieve JWT |
| | `GET` | `/auth/me` | Authenticated | Fetch current user identity & role |
| **Categories** | `GET` | `/categories` | Public | List all categories |
| | `GET` | `/categories/{id}` | Public | Get category by ID |
| | `POST` | `/categories` | `ADMIN` | Create a new product category |
| | `PUT` | `/categories/{id}` | `ADMIN` | Update an existing category |
| | `DELETE` | `/categories/{id}` | `ADMIN` | Delete a category (checks for active products) |
| **Products** | `GET` | `/products` | Public | List all active catalog products |
| | `GET` | `/products/{id}` | Public | Get product details by ID |
| | `POST` | `/products` | `ADMIN` | Create a new product (with SKU & Price) |
| | `PUT` | `/products/{id}` | `ADMIN` | Update product details |
| | `DELETE` | `/products/{id}` | `ADMIN` | Soft deactivate a product |
| **Warehouses** | `GET` | `/warehouses` | `ADMIN` | List all warehouses |
| | `GET` | `/warehouses/{id}` | `ADMIN` | Get warehouse by ID |
| | `POST` | `/warehouses` | `ADMIN` | Create a warehouse (Surat, Mumbai, etc.) |
| | `PUT` | `/warehouses/{id}` | `ADMIN` | Update warehouse details |
| **Inventory** | `GET` | `/inventory` | `ADMIN` | View aggregate stock levels across facilities |
| | `GET` | `/inventory/product/{id}`| `ADMIN` | View stock breakdown for a specific product |
| | `GET` | `/inventory/warehouse/{id}`| `ADMIN`| View all stock located at a warehouse |
| | `POST` | `/inventory/adjust` | `ADMIN` | Manually adjust `on_hand` stock levels |
| **Orders** | `POST` | `/orders` | `CUSTOMER` | Submit a new order (creates Outbox event) |
| | `GET` | `/orders` | `CUSTOMER` | View authenticated customer order history |
| | `GET` | `/orders/{id}` | `CUSTOMER` / `ADMIN` | Get order details (ownership IDOR protected) |
| | `POST` | `/orders/{id}/cancel` | `CUSTOMER` / `ADMIN` | Safe order cancellation & stock release |
| **Admin Orders**| `GET` | `/admin/orders` | `ADMIN` | Paginated order list with status filtering |
| | `GET` | `/admin/orders/{id}` | `ADMIN` | View full details of any customer order |
| | `POST` | `/admin/orders/{id}/cancel`| `ADMIN` | Administrative order cancellation |

---

## 🛠️ Technology Stack

| Layer | Component | Description |
| :--- | :--- | :--- |
| **Backend Framework** | Java 17, Spring Boot 3.3.4 | Core enterprise application framework |
| **Security** | Spring Security 6, JJWT 0.12.6 | Stateless JWT authentication & RBAC |
| **Persistence** | Spring Data JPA, Hibernate, Flyway | ORM with strict Flyway migrations (`ddl-auto=validate`) |
| **Messaging** | Apache Kafka 3.8 (KRaft), `spring-kafka` | Event-driven decoupled processing |
| **Database** | MySQL 8.0 | Normalized relational database |
| **Frontend** | React 18, Vite 5, React Router 6, Axios | Modern Single Page Application UI |
| **Infrastructure** | Docker, Docker Compose | Containerized local dependencies |
| **Testing** | JUnit 5, Mockito, Spring Boot Test, H2 | Comprehensive automated unit & integration testing |

---

## ⚙️ Getting Started & Setup Guide

### 1. Prerequisites
- **Java Development Kit (JDK):** Version 17 or higher
- **Apache Maven:** Version 3.8+
- **Node.js:** Version 18+ & npm
- **Docker & Docker Compose:** Installed and running

---

### 2. Step 1: Start Infrastructure (MySQL & Kafka)

Navigate to the `infrastructure/` directory:

```bash
cd infrastructure

# Copy the environment file
cp .env.example .env

# Start MySQL, Kafka (KRaft mode), and Kafka UI
docker compose up -d
```

Verify services:
- **MySQL 8.0:** Listening on port `3306` (or `3307` depending on `.env`)
- **Apache Kafka (KRaft):** Listening on port `9092`
- **Kafka Web UI:** Open [http://localhost:8085](http://localhost:8085) to view topics and partition offsets.

---

### 3. Step 2: Configure & Run the Backend

Navigate to `backend/`:

```bash
cd ../backend

# Copy backend environment template
cp .env.example .env
```

Review or edit `backend/.env` as needed:
```dotenv
SERVER_PORT=8080
DB_HOST=localhost
DB_PORT=3306
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

The backend starts at **`http://localhost:8080/api/v1`**. Flyway automatically executes database migrations on startup.

---

### 4. Step 3: Run the Frontend (React + Vite)

Navigate to `frontend/`:

```bash
cd ../frontend

# Copy frontend environment template
cp .env.example .env

# Install dependencies
npm install

# Start Vite development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Comprehensive Testing Guide

The project includes an exhaustive automated test suite with **96 tests across 11 test classes** covering every layer from repository constraints to end-to-end event flows.

### Running All Tests
From the `backend/` directory:

```bash
mvn clean test
```

### Test Suite Breakdown
| Test Suite | Tests | Scope |
| :--- | :---: | :--- |
| `AuthControllerTests` | 13 | Registration, login, validation, token generation, duplicate email rejection |
| `AdminAccountSeederTests` | 4 | Conditional bootstrapping, password encryption, duplicate prevention |
| `DevelopmentDataSeederTests` | 2 | Catalog & multi-warehouse inventory initialization |
| `InventoryModuleIntegrationTests` | 20 | Category, product, warehouse, inventory CRUD, negative stock guards |
| `OrderModuleIntegrationTests` | 18 | Order placement, DTO conversion, ownership check, pagination, cancel |
| `DatabaseLayerTests` | 8 | Flyway schema validation, database constraints, optimistic locking |
| `OutboxPublisherTests` | 8 | Unit verification of publisher batch polling, status transitions, failure handling |
| `OutboxPublisherIntegrationTests` | 3 | Scheduled poller integration, delivery status updates, retry tracking |
| `OutboxEventUpdateServiceTests` | 3 | Transaction isolation (`REQUIRES_NEW`) during status updates |
| `OrderCreatedKafkaListenerTests` | 11 | Ack mode verification, DLT routing, poison pill isolation, duplicate handling |
| `OrderEndToEndWorkflowIntegrationTests` | 6 | Full pipeline: Place Order ➔ Outbox ➔ Kafka ➔ Dual-Warehouse Fulfillment ➔ Stock Decrement ➔ Status Update |
| **Total** | **96** | **All passing with 0 failures, 0 errors, 0 skipped** |

---

## 🔐 Environment Variables Reference

### Backend (`backend/.env` & `application.yml`)
| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `SERVER_PORT` | `8080` | Spring Boot server port |
| `DB_HOST` | `localhost` | MySQL hostname |
| `DB_PORT` | `3306` | MySQL port |
| `DB_NAME` | `smartstock` | Database schema name |
| `DB_USERNAME` | `smartstock_user` | Database username |
| `DB_PASSWORD` | `smartstock_pass` | Database password |
| `JPA_DDL_AUTO` | `validate` | Hibernate DDL strategy (strictly validated against Flyway) |
| `SHOW_SQL` | `false` | SQL query logging toggle |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` | Apache Kafka broker address |
| `KAFKA_CONSUMER_GROUP` | `smartstock-group` | Kafka consumer group identifier |
| `JWT_SECRET` | *(Required in prod)* | 256-bit secret key used for signing JWTs |
| `JWT_EXPIRATION_MS` | `86400000` (24h) | JWT lifespan in milliseconds |
| `OUTBOX_PUBLISHER_ENABLED` | `true` | Toggle scheduled outbox polling |
| `OUTBOX_PUBLISHER_FIXED_DELAY_MS` | `2000` | Outbox polling frequency (milliseconds) |
| `OUTBOX_PUBLISHER_BATCH_SIZE` | `50` | Maximum outbox events fetched per batch |
| `OUTBOX_PUBLISHER_TIMEOUT_SECONDS` | `5` | Kafka broker send acknowledgment timeout |
| `ADMIN_SEED_ENABLED` | `false` | Enable startup admin account bootstrapping |
| `ADMIN_NAME` | `Super Admin` | Initial admin account name |
| `ADMIN_EMAIL` | `admin@smartstock.local` | Initial admin email address |
| `ADMIN_PASSWORD` | *(None)* | Initial admin BCrypt-hashed password |
| `DEV_DATA_SEED_ENABLED` | `false` | Enable catalog, warehouse, and stock dummy seeder |

### Infrastructure (`infrastructure/.env`)
| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `MYSQL_PORT` | `3306` | Host port exposed for MySQL |
| `MYSQL_ROOT_PASSWORD` | `root_secret` | MySQL root administrative password |
| `MYSQL_DATABASE` | `smartstock` | Initial MySQL database created by container |
| `MYSQL_USER` | `smartstock_user` | Non-root application database username |
| `MYSQL_PASSWORD` | `smartstock_pass` | Non-root application database password |
| `KAFKA_PORT` | `9092` | Host port exposed for Apache Kafka |
| `KAFKA_UI_PORT` | `8085` | Web port for Kafka management dashboard |

---

## 🔒 Security & Concurrency Guarantees

1. **Zero Secret Leakage:** No plaintext credentials or JWT signing keys are stored in source code; `.env` is git-ignored and `.env.example` contains sanitized placeholders.
2. **In-Flight Concurrency Protection:** Race conditions between client order cancellation and background Kafka stock reservation are eliminated through database-level row locking (`SELECT ... FOR UPDATE`).
3. **Atomic Inventory Decrements:** Inventory updates use atomic SQL conditional updates (`UPDATE inventories SET reserved = reserved + :qty WHERE id = :id AND (on_hand - reserved) >= :qty`) preventing race conditions without heavy table locking.
4. **Idempotent Messaging:** Duplicate Kafka events caused by network retries or rebalances are caught via `processed_events` and acknowledged without duplicating inventory changes.
5. **Sanitized Exception Handling:** Generic server exceptions (500) hide stack traces and internal query details from API responses to prevent information disclosure.

---

## 📌 Known Limitations & Future Enhancements

- **Notification Module:** The notification package (`com.smartstock.modules.notification`) is designed as a stub ready for SMTP email and SMS delivery.
- **Payment Gateway Integration:** Direct payment capture (Stripe/Razorpay webhook callbacks) can be hooked into the order confirmation state transition.
- **Distributed Observability:** Adding Spring Boot Actuator, Micrometer, and Prometheus/Grafana with Zipkin/OpenTelemetry distributed tracing for Kafka message flows.
- **Multi-Warehouse Order Splitting:** Future enterprise versions can introduce split shipment logic when no single warehouse has sufficient stock to fulfill an entire order.

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).
