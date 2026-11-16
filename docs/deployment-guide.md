# SmartStock Deployment Guide

This guide provides operational instructions for deploying and running the SmartStock application across two distinct environments using the **same shared codebase**:

1. **Local Development Environment** (Windows/macOS/Linux developer workstation)
2. **AWS EC2 Production Environment** (Isolated containerized stack with Nginx entrypoint)

---

## Architecture Overview

```text
                                [ LOCAL WORKSTATION ]
  +---------------------------------------------------------------------------------+
  | Developer Machine (Host)                                                        |
  |   - React Frontend:   http://localhost:5173  (Vite Dev Server, hot-reload)       |
  |   - Spring Boot:      http://localhost:8081  (Maven / JVM on host)              |
  |                                                                                 |
  | Docker Containers (infrastructure/local/docker-compose.yml):                    |
  |   - MySQL 8.0:        localhost:3307  (Host mapped, volume: mysql_data)         |
  |   - Apache Kafka:     localhost:9092  (Host mapped, volume: kafka_data)         |
  |   - Kafka Web UI:     http://localhost:8085 (Host mapped for debugging)         |
  +---------------------------------------------------------------------------------+

                               [ AWS EC2 PRODUCTION ]
  +---------------------------------------------------------------------------------+
  | EC2 Instance (Single Ingress: Ports 80 & 443)                                   |
  |                                                                                 |
  |   [ Internet / Clients ]                                                        |
  |              │                                                                  |
  |              ▼ (Port 80/443)                                                    |
  |   ┌────────────────────────────────────────────────────────────────────────┐    |
  |   │ Nginx (Reverse Proxy & Static Web Server)                              │    |
  |   │   ├── "/"     ──> Serves compiled React SPA assets                      │    |
  |   │   └── "/api/" ──> Proxies to http://backend:8080/api/                   │    |
  |   └──────────────────────────────────┬─────────────────────────────────────┘    |
  |                                      │ Internal Docker Network                  |
  |                     ┌────────────────┴────────────────┐                         |
  |                     ▼                                 ▼                         |
  |       ┌───────────────────────────┐     ┌───────────────────────────┐           |
  |       │   Spring Boot Backend     │     │       MySQL 8.0           │           |
  |       │   (Port 8080, internal)   │────▶│   (Port 3306, internal)   │           |
  |       └─────────────┬─────────────┘     │  Volume: mysql_prod_data  │           |
  |                     │                   └───────────────────────────┘           |
  |                     ▼                                                           |
  |       ┌───────────────────────────┐                                             |
  |       │  Apache Kafka 3.8 (KRaft) │                                             |
  |       │  (Port 29092, internal)   │                                             |
  |       │  Volume: kafka_prod_data  │                                             |
  |       └───────────────────────────┘                                             |
  |                                                                                 |
  | * Zero host ports exposed for Backend, Database, or Kafka broker.               |
  | * Kafka UI is excluded in production to prevent unauthorized topic tampering.   |
  +---------------------------------------------------------------------------------+
```

---

## Part 1: Local Development Configuration

The local development setup prioritizes fast inner-loop productivity: hot-reloading for React, interactive debugging for Spring Boot, and containerized dependencies for MySQL and Kafka.

### 1. Local Prerequisites
* **OS:** Windows 10/11, macOS, or Linux
* **Docker & Docker Compose:** Docker Desktop 4.x+ or Docker Engine with compose plugin
* **Java:** JDK 17 (Eclipse Temurin or Oracle)
* **Maven:** Apache Maven 3.8+
* **Node.js:** Node.js 18+ and npm 9+

### 2. Environment Setup
The local environment uses `MYSQL_PORT=3307` to avoid port collisions with any native MySQL service already running on the developer workstation.

1. **Infrastructure Environment:**
   ```bash
   cd infrastructure/local
   cp .env.example .env
   ```

2. **Backend Environment:**
   ```bash
   cd ../../backend
   cp .env.example .env
   ```
   *Verify that `backend/.env` contains:*
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
   ADMIN_NAME=Admin User
   ADMIN_EMAIL=admin@smartstock.local
   ADMIN_PASSWORD=Admin@123
   DEV_DATA_SEED_ENABLED=true
   ```

3. **Frontend Environment:**
   ```bash
   cd ../frontend
   cp .env.example .env
   ```
   *Verify that `frontend/.env` contains:*
   ```dotenv
   VITE_API_BASE_URL=http://localhost:8081/api/v1
   ```

### 3. Startup Commands

Start the stack across 3 terminal windows:

#### Terminal 1 — Infrastructure (MySQL, Kafka, Kafka UI)
```bash
cd infrastructure/local
docker compose up -d
```
*Note: You can also run `cd infrastructure && docker compose up -d` for backward compatibility.*

Check container health:
```bash
docker compose ps
```
Wait until `smartstock-mysql` and `smartstock-kafka` report `healthy`.

#### Terminal 2 — Backend (Spring Boot)
```bash
cd backend
mvn spring-boot:run
```
Flyway automatically executes database migrations (`V1` and `V2`) on startup. The API is reachable at `http://localhost:8081/api/v1`.

#### Terminal 3 — Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
Open your browser at [http://localhost:5173](http://localhost:5173).

### 4. Local Service Access Endpoints

| Service | Address | Description |
| :--- | :--- | :--- |
| **Frontend UI** | [http://localhost:5173](http://localhost:5173) | Vite SPA Development Server |
| **Backend REST API** | [http://localhost:8081/api/v1](http://localhost:8081/api/v1) | Spring Boot REST Endpoints |
| **Backend Health** | [http://localhost:8081/api/v1/actuator/health](http://localhost:8081/api/v1/actuator/health) | Spring Boot Actuator Health Check |
| **MySQL Database** | `localhost:3307` | User: `smartstock_user`, DB: `smartstock` |
| **Apache Kafka** | `localhost:9092` | KRaft Broker (PLAINTEXT) |
| **Kafka Web UI** | [http://localhost:8085](http://localhost:8085) | Topic, Consumer Group & Message Inspector |

### 5. Shutdown Commands

To stop local infrastructure containers:
```bash
cd infrastructure/local
docker compose down
```

To stop containers and **wipe data volumes** (for a clean database reset):
```bash
docker compose down -v
```

---

## Part 2: AWS EC2 Production Deployment

The AWS deployment packages the entire application into production-grade Docker containers orchestrated by `docker compose`. Nginx is the only public-facing container, terminating HTTP/HTTPS and routing traffic between static files and the internal backend.

### 1. EC2 Instance Sizing & Prerequisites
* **AMI:** Ubuntu Server 22.04 LTS or Amazon Linux 2023
* **Instance Type:**
  * **Recommended:** `t3.medium` (2 vCPU, 4 GB RAM)
  * **Minimum:** `t3.small` (2 vCPU, 2 GB RAM) **with an active 2 GB swapfile**.
  > [!CAUTION]
  > Do NOT deploy on `t2.micro` or `t3.micro` (1 GB RAM). Running MySQL, Kafka KRaft, Spring Boot (JVM), and Nginx concurrently requires ~1.5 GB RAM. Without sufficient memory, the Linux OOM killer will terminate the database or Kafka broker.
* **Storage:** 20 GB+ gp3 EBS volume.
* **Security Group Configuration:**
  | Type | Port | Source | Purpose |
  | :--- | :--- | :--- | :--- |
  | SSH | 22 | Your Administrator IP | Remote management |
  | HTTP | 80 | `0.0.0.0/0` | Public Web traffic / Certbot |
  | HTTPS | 443 | `0.0.0.0/0` | Public Secure Web traffic |
  > [!IMPORTANT]
  > Do **NOT** open ports 3306, 3307, 8080, 8081, 9092, or 29092 in the AWS Security Group. All inter-service communication is confined inside the Docker bridge network.

### 2. EC2 Host Preparation

SSH into your EC2 instance and install Docker and Docker Compose:

```bash
# Update package indices
sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Install Docker Engine
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow ubuntu user to execute docker commands without sudo
sudo usermod -aG docker $USER
newgrp docker

# Configure 2GB Swap (Mandatory if running t3.small)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 3. Deploying the Application

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/kishansoni5/SmartStock.git
   cd SmartStock
   ```

2. **Configure Production Environment Variables:**
   ```bash
   cd infrastructure/aws
   cp .env.example .env
   chmod 600 .env
   ```

3. **Edit `.env` with Production Secrets:**
   ```bash
   nano .env
   ```
   *Required variables:*
   * `MYSQL_ROOT_PASSWORD`: Secure root password (min 24 characters).
   * `DB_PASSWORD`: Secure application user password (min 24 characters).
   * `JWT_SECRET`: Secure 256-bit Base64 key. Generate with:
     ```bash
     openssl rand -base64 32
     ```
   * `CORS_ALLOWED_ORIGINS`: Set to your domain or EC2 public IP (e.g. `https://smartstock.example.com` or `*`).
   * `ADMIN_SEED_ENABLED`: Set to `true` on the **first deployment only** with a strong `ADMIN_PASSWORD` to bootstrap the initial admin account. After the first run, change to `false`.

4. **Build and Launch the Stack:**
   ```bash
   docker compose up -d --build
   ```

5. **Verify Service Health:**
   ```bash
   docker compose ps
   ```
   All 4 containers (`smartstock-prod-nginx`, `smartstock-prod-backend`, `smartstock-prod-mysql`, `smartstock-prod-kafka`) should show state `Up (healthy)`.

### 4. Nginx Routing Architecture

The production Nginx container (`infrastructure/aws/nginx/default.conf`) acts as the single entrypoint:
* Requests to `/api/` are forwarded internally to `http://backend:8080/api/` with real client IP headers (`X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`).
* Requests to `/` serve the static compiled React SPA bundle.
* Client-side SPA routing is handled via `try_files $uri $uri/ /index.html;`, ensuring bookmarking and deep linking function without HTTP 404 errors.
* Asset caching headers are enforced: 1-year immutable caching for fingerprinted assets (`.js`, `.css`, `.svg`) and `no-cache` for `index.html`.

### 5. Persistent Volumes

Production data is stored in named Docker volumes mapped to the EC2 host's Docker directory (`/var/lib/docker/volumes`):
* `mysql_prod_data`: Stores all MySQL transactional data, Flyway migration state, and table tablespaces.
* `kafka_prod_data`: Stores Kafka topic partition logs, consumer offsets, and transaction state logs at `/var/lib/kafka/data`.

Containers can be stopped, upgraded, or rebuilt without data loss.

### 6. Production Kafka Considerations (Single Broker vs. MSK)

> [!WARNING]
> The current AWS configuration runs an Apache Kafka 3.8.0 KRaft broker in a single container. Be aware of the following production limitations:
> 1. **No High Availability (SPOF):** If the Kafka container halts or the instance undergoes maintenance, event publishing and inventory reservation cease until restarted.
> 2. **Replication Factor = 1:** Offsets and messages are stored with 1 replica (`min.insync.replicas=1`). Producer `acks=all` guarantees acknowledgment from this single broker only.
> 3. **Production Roadmap:** For critical multi-AZ production environments with strict zero-data-loss SLAs, replace the self-hosted Kafka container with **AWS MSK (Amazon Managed Streaming for Apache Kafka)** and point `KAFKA_BOOTSTRAP_SERVERS` to the MSK bootstrap endpoint.

### 7. Enabling Domain Name & HTTPS (SSL/TLS)

To secure the deployment with a free Let's Encrypt SSL certificate:

1. Map your domain DNS `A` record (e.g. `smartstock.example.com`) to your EC2 Public IPv4.
2. Install Certbot on the EC2 host:
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   ```
3. Generate the certificate using standalone mode or DNS validation:
   ```bash
   # Temporarily stop Nginx on port 80
   docker compose stop nginx
   sudo certbot certonly --standalone -d smartstock.example.com
   docker compose start nginx
   ```
4. Mount the certificate directory into Nginx by updating `infrastructure/aws/docker-compose.yml`:
   ```yaml
   volumes:
     - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
     - /etc/letsencrypt:/etc/letsencrypt:ro
   ```
5. Uncomment the SSL server block in `infrastructure/aws/nginx/default.conf` and update `server_name` to match your domain.
6. Reload Nginx:
   ```bash
   docker compose restart nginx
   ```

### 8. Logs & Troubleshooting

View live consolidated logs:
```bash
docker compose logs -f
```

View logs for an individual service:
```bash
docker compose logs -f backend
docker compose logs -f nginx
docker compose logs -f mysql
docker compose logs -f kafka
```

Check container health status and restart counts:
```bash
docker compose ps
```

Verify backend health endpoint internally:
```bash
docker compose exec backend curl -f http://localhost:8080/api/v1/actuator/health
```

### 9. Database Backup & Disaster Recovery

#### Automated MySQL Dump:
```bash
# Create backup directory
mkdir -p ~/backups

# Export database
docker compose exec -T mysql mysqldump -u smartstock_user -p$(grep DB_PASSWORD .env | cut -d '=' -f2) smartstock > ~/backups/smartstock_$(date +%Y%m%d_%H%M%S).sql

# Compress backup
gzip ~/backups/smartstock_*.sql
```

#### Restoring from Backup:
```bash
gunzip < ~/backups/smartstock_backup.sql.gz | docker compose exec -T mysql mysql -u smartstock_user -p$(grep DB_PASSWORD .env | cut -d '=' -f2) smartstock
```

#### EBS Snapshots:
For full disaster recovery, configure an **AWS Data Lifecycle Manager (DLM)** policy to take automated daily EBS snapshots of the EC2 instance root and data volumes.
