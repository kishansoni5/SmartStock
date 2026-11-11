# SmartStock REST API Reference

Base URL: `http://localhost:8080/api/v1`

All responses follow the unified envelope:
```json
{
  "success": true,
  "message": "Human readable summary",
  "data": { ... },
  "timestamp": "2026-11-11T17:00:00"
}
```

---

## 1. Authentication Module (`/auth`)

### 1.1 Register Customer
- **Method:** `POST`
- **URL:** `/auth/register` (also `/api/v1/auth/register`)
- **Auth:** Public
- **Request Body:**
```json
{
  "name": "Jane Buyer",
  "email": "jane.buyer@example.com",
  "password": "SecurePassword123"
}
```
- **Response (201 Created):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiJ9...",
    "tokenType": "Bearer",
    "expiresInMs": 86400000,
    "user": {
      "id": 1,
      "name": "Jane Buyer",
      "email": "jane.buyer@example.com",
      "role": "CUSTOMER"
    }
  }
}
```
- **Errors:** `400 Bad Request` (Validation errors), `409 Conflict` (Email already registered).

### 1.2 Login
- **Method:** `POST`
- **URL:** `/auth/login` (also `/api/v1/auth/login`)
- **Auth:** Public
- **Request Body:**
```json
{
  "email": "jane.buyer@example.com",
  "password": "SecurePassword123"
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiJ9...",
    "tokenType": "Bearer",
    "expiresInMs": 86400000,
    "user": {
      "id": 1,
      "name": "Jane Buyer",
      "email": "jane.buyer@example.com",
      "role": "CUSTOMER"
    }
  }
}
```
- **Errors:** `401 Unauthorized` ("Invalid email or password").

---

## 2. Customer Order Module (`/orders`)

All endpoints require `Authorization: Bearer <JWT_TOKEN>`.

### 2.1 Place Order
- **Method:** `POST`
- **URL:** `/orders` (also `/api/v1/orders`)
- **Required Role:** `CUSTOMER`
- **Request Body:**
```json
{
  "items": [
    {
      "productId": 1,
      "quantity": 2
    },
    {
      "productId": 2,
      "quantity": 1
    }
  ]
}
```
- **Response (201 Created):**
```json
{
  "success": true,
  "message": "Order placed successfully",
  "data": {
    "id": 101,
    "userId": 1,
    "customerName": "Jane Buyer",
    "customerEmail": "jane.buyer@example.com",
    "status": "PENDING",
    "totalAmount": 3100.00,
    "warehouseId": null,
    "warehouseName": null,
    "items": [
      {
        "id": 201,
        "productId": 1,
        "productName": "Dell XPS 15",
        "productSku": "DELL-XPS-001",
        "quantity": 2,
        "unitPrice": 1500.00,
        "subtotal": 3000.00
      },
      {
        "id": 202,
        "productId": 2,
        "productName": "Keychron K2",
        "productSku": "KEY-K2-001",
        "quantity": 1,
        "unitPrice": 100.00,
        "subtotal": 100.00
      }
    ],
    "createdAt": "2026-11-11T17:10:00"
  }
}
```
- **Errors:** `400 Bad Request` (Empty items, invalid quantity, duplicate product IDs, inactive product), `404 Not Found` (Product not found).

### 2.2 Get My Order History
- **Method:** `GET`
- **URL:** `/orders` or `/orders/my` (also `/api/v1/orders`, `/api/v1/orders/my`)
- **Required Role:** `CUSTOMER`
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Order history retrieved successfully",
  "data": [
    {
      "id": 101,
      "status": "CONFIRMED",
      "totalAmount": 3100.00,
      "warehouseId": 1,
      "warehouseName": "Surat Warehouse",
      "items": [ ... ]
    }
  ]
}
```

### 2.3 Get Order Details by ID
- **Method:** `GET`
- **URL:** `/orders/{id}`
- **Required Role:** `CUSTOMER` (Own orders only) or `ADMIN` (Any order)
- **Response (200 OK):** Returns detailed `OrderResponse` envelope.
- **Errors:** `403 Forbidden` (Customer attempting to view another customer's order), `404 Not Found` (Order ID not found).

### 2.4 Cancel Order
- **Method:** `POST`
- **URL:** `/orders/{id}/cancel`
- **Required Role:** `CUSTOMER` (Own orders only) or `ADMIN`
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Order cancelled successfully",
  "data": {
    "id": 101,
    "status": "CANCELLED",
    "totalAmount": 3100.00,
    "items": [ ... ]
  }
}
```
- **Errors:** `400 Bad Request` (Cannot cancel order in status `REJECTED` or already `CANCELLED`), `403 Forbidden` (Not order owner).

---

## 3. Administrator Order Module (`/admin/orders`)

All endpoints require `Authorization: Bearer <ADMIN_JWT_TOKEN>`.

### 3.1 List All Orders (Paginated & Filterable)
- **Method:** `GET`
- **URL:** `/admin/orders` (also `/api/v1/admin/orders`)
- **Query Parameters:**
  - `status` (Optional): `PENDING | CONFIRMED | REJECTED | CANCELLED`
  - `page` (Optional, default 0): Zero-based page number
  - `size` (Optional, default 10): Page size
  - `sort` (Optional, default `createdAt,desc`): Property and direction
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Orders retrieved successfully",
  "data": {
    "content": [ ... ],
    "pageable": { ... },
    "totalElements": 42,
    "totalPages": 5,
    "size": 10,
    "number": 0
  }
}
```
- **Errors:** `403 Forbidden` (Customer attempting access).

### 3.2 Get Any Order Details
- **Method:** `GET`
- **URL:** `/admin/orders/{id}`
- **Response (200 OK):** Full order details.

### 3.3 Cancel Any Order
- **Method:** `POST`
- **URL:** `/admin/orders/{id}/cancel`
- **Response (200 OK):** Cancelled order response with transactionally released stock.

---

## 4. Catalog & Inventory Modules

### 4.1 Categories (`/categories`)
- `GET /categories` — List all categories (`CUSTOMER`, `ADMIN`).
- `GET /categories/{id}` — Get category by ID (`CUSTOMER`, `ADMIN`).
- `POST /categories` — Create category (`ADMIN` only).
- `PUT /categories/{id}` — Update category (`ADMIN` only).
- `DELETE /categories/{id}` — Delete category (`ADMIN` only).

### 4.2 Products (`/products`)
- `GET /products` — List active products (`CUSTOMER`, `ADMIN`).
- `GET /products/{id}` — Get product by ID (`CUSTOMER`, `ADMIN`).
- `POST /products` — Create product (`ADMIN` only).
- `PUT /products/{id}` — Update product (`ADMIN` only).
- `DELETE /products/{id}` — Soft-deactivate product (`ADMIN` only).

### 4.3 Warehouses (`/warehouses`)
- `GET /warehouses` — List warehouses (`CUSTOMER`, `ADMIN`).
- `GET /warehouses/{id}` — Get warehouse by ID (`ADMIN`).
- `POST /warehouses` — Create warehouse (`ADMIN` only).
- `PUT /warehouses/{id}` — Update warehouse (`ADMIN` only).

### 4.4 Inventories (`/inventories`)
- `GET /inventories` — View all inventory items across warehouses (`ADMIN` only).
- `GET /inventories/product/{productId}` — View stock distribution for a product (`ADMIN`).
- `GET /inventories/warehouse/{warehouseId}` — View all stock inside a warehouse (`ADMIN`).
- `POST /inventories/adjust` — Adjust physical on-hand stock (`ADMIN` only).
  - Body: `{ "productId": 1, "warehouseId": 1, "quantityChange": 50 }`
