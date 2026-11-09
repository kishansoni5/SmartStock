# SmartStock – Inventory & Order Management System

SmartStock is a production-grade inventory and order management system designed using a **Modular Monolith** architecture with **Event-Driven Order Processing** powered by **Apache Kafka**.

Built specifically to showcase modern software engineering best practices for placement interviews and real-world system design.

---

## 🚀 Technology Stack

| Domain | Technology | Details |
| :--- | :--- | :--- |
| **Backend** | Java 17 | Core programming language |
| | Spring Boot 3.3.x | Enterprise application framework |
| | Spring Data JPA (Hibernate) | Relational database mapping & queries |
| | Spring Security 6 & JWT | Stateless authentication & RBAC |
| | Apache Kafka (`spring-kafka`) | Event-driven messaging & distributed log |
| | MySQL 8.0 Driver | Database connector |
| | Lombok & Bean Validation | Boilerplate reduction & API input validation |
| **Frontend** | React 18 | Single Page Application UI library |
| | Vite 5 | Next-generation frontend build tooling |
| | React Router 6 | Client-side declarative routing |
| | Axios | HTTP client with JWT interceptor |
| **Infrastructure** | Docker & Docker Compose | Containerized local infrastructure |
| | MySQL 8.0 | Relational database engine |
| | Apache Kafka 3.8 (KRaft) | Message broker (no Zookeeper required) |
| | Kafka UI | Visual dashboard for topics and consumer groups |

---

## 📁 Repository Structure

```text
smartstock/
├── backend/                               # Spring Boot 3.x Modular Monolith
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/smartstock/
│   │   │   │   ├── common/                # Shared cross-cutting concerns
│   │   │   │   │   ├── config/            # SecurityConfig, KafkaConfig
│   │   │   │   │   ├── event/             # DomainEvent interfaces
│   │   │   │   │   ├── exception/         # GlobalExceptionHandler
│   │   │   │   │   └── response/          # Standard ApiResponse wrapper
│   │   │   │   ├── modules/               # Bounded Context Modules
│   │   │   │   │   ├── auth/              # Authentication & User Management
│   │   │   │   │   ├── inventory/         # Stock, SKUs, and Warehouse Tracking
│   │   │   │   │   ├── order/             # Order Lifecycle & Status Engine
│   │   │   │   │   └── notification/      # Async Event Consumers & Alerts
│   │   │   │   └── SmartStockApplication.java # Spring Boot Main Class
│   │   │   └── resources/
│   │   │       ├── application.yml        # Spring configuration with env mapping
│   │   │       └── application-dev.yml
│   │   └── test/                          # Unit and integration test suites
│   ├── .env.example                       # Backend environment template
│   ├── .gitignore
│   └── pom.xml                            # Maven dependencies & build configuration
├── frontend/                              # React + Vite Single Page Application
│   ├── src/
│   │   ├── api/                           # Axios client & centralized endpoint registry
│   │   │   ├── axiosClient.js
│   │   │   └── endpoints.js
│   │   ├── components/                    # Reusable UI components (Navbar, Guards)
│   │   ├── context/                       # AuthContext & state providers
│   │   ├── pages/                         # Dashboard, Inventory, Orders, Login
│   │   ├── routes/                        # AppRoutes (React Router v6)
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── .env.example                       # Frontend environment template
│   ├── .gitignore
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── infrastructure/                        # Docker & local development infrastructure
│   ├── init-scripts/
│   │   └── 01-init.sql                    # Initial database and grant scripts
│   ├── .env.example                       # Infrastructure environment template
│   ├── .gitignore
│   └── docker-compose.yml                 # MySQL 8.0, Kafka (KRaft), Kafka UI
├── docs/                                  # Comprehensive architecture documentation
│   ├── architecture.md                    # System design, EDA flows, module boundaries
│   └── database-design.md                 # ERD diagrams, schema specs, locking strategies
├── .gitignore                             # Root git ignore
└── README.md                              # Main project documentation
```

---

## 🏛️ Architectural Highlights

1. **Modular Monolith:**
   Unlike distributed microservices which introduce network latency and distributed transaction complexities (Sagas, 2PC), SmartStock keeps domain boundaries cleanly separated within a single deployable artifact.
2. **Event-Driven Processing with Kafka:**
   Order submission immediately returns an acknowledgment while stock reservation and notification dispatch occur asynchronously across Kafka topics (`order.created.v1`, `inventory.reserved.v1`).
3. **Zero Hardcoded Secrets:**
   All database credentials, JWT keys, and broker addresses are read dynamically from environment variables with safe fallback defaults.

For deep-dive architectural diagrams and schema specifications, review:
- [Architecture Deep Dive](docs/architecture.md)
- [Database Schema & ERD](docs/database-design.md)

---

## ⚙️ Getting Started

### 1. Prerequisites
Ensure you have the following installed:
- **Java 17+** (JDK 17 or higher)
- **Maven 3.8+** (or use your IDE's embedded Maven)
- **Node.js 18+** & **npm**
- **Docker** and **Docker Compose**

---

### 2. Step 1: Start Infrastructure (MySQL & Kafka)

Navigate to `infrastructure/` and configure the environment:

```bash
cd infrastructure
# Copy environment variables
cp .env.example .env

# Spin up MySQL, Kafka (KRaft), and Kafka UI
docker compose up -d
```

Verify services:
- **MySQL:** Running on port `localhost:3306`
- **Apache Kafka:** Running on port `localhost:9092`
- **Kafka Web UI:** Open [http://localhost:8085](http://localhost:8085) in your browser to view topics and messages.

---

### 3. Step 2: Run the Backend (Spring Boot)

Open a new terminal and navigate to `backend/`:

```bash
cd backend
# Optional: copy environment file if custom credentials are required
cp .env.example .env

# Build and run with Maven
mvn clean spring-boot:run
```

*(Alternatively, open the `backend` folder in IntelliJ IDEA / VS Code / Eclipse and run `SmartStockApplication.java` directly.)*

The Spring Boot backend will start on **`http://localhost:8080/api/v1`**.

---

### 4. Step 3: Run the Frontend (React + Vite)

Open a new terminal and navigate to `frontend/`:

```bash
cd frontend
# Copy environment file
cp .env.example .env

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will start on **`http://localhost:5173`**.

---

## 🔑 Environment Variables Reference

### Backend (`backend/.env`)
| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `SERVER_PORT` | `8080` | HTTP port for Spring Boot |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_NAME` | `smartstock` | Database schema name |
| `DB_USERNAME` | `smartstock_user` | MySQL username |
| `DB_PASSWORD` | `smartstock_pass` | MySQL password |
| `KAFKA_BOOTSTRAP_SERVERS`| `localhost:9092` | Kafka broker address |
| `JWT_SECRET` | *(Random 256-bit string)* | Secret key for signing JWTs |
| `JWT_EXPIRATION_MS` | `86400000` (24h) | Token lifespan in milliseconds |

### Frontend (`frontend/.env`)
| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `http://localhost:8080/api/v1` | Backend REST API endpoint base |

---

## 📋 Interview Speaking Points (Placement Prep)
- **Why Modular Monolith over Microservices?** Eliminates distributed network failures and transaction overhead while keeping codebase modular enough to extract services later if scale requires it.
- **Why Kafka over RabbitMQ?** Kafka provides a persistent, replayable, distributed event log with partitioned ordering per aggregate key (`orderId`).
- **How is high concurrency managed?** Inventory reservation uses Optimistic Locking (`@Version`) or atomic SQL decrement to prevent race conditions during high checkout spikes.
- **Transactional Outbox Pattern:** Ensures database updates and Kafka event publications succeed atomically without dual-write failures.
