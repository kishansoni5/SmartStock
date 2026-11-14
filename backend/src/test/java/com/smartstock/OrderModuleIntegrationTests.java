package com.smartstock;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartstock.common.event.model.OutboxEvent;
import com.smartstock.common.event.model.OutboxStatus;
import com.smartstock.common.event.repository.OutboxEventRepository;
import com.smartstock.common.security.JwtService;
import com.smartstock.modules.auth.model.AppUser;
import com.smartstock.modules.auth.model.UserRole;
import com.smartstock.modules.auth.repository.AppUserRepository;
import com.smartstock.modules.inventory.model.Category;
import com.smartstock.modules.inventory.model.Product;
import com.smartstock.modules.inventory.repository.CategoryRepository;
import com.smartstock.modules.inventory.repository.InventoryRepository;
import com.smartstock.modules.inventory.repository.ProductRepository;
import com.smartstock.modules.inventory.repository.WarehouseRepository;
import com.smartstock.modules.order.dto.CreateOrderItemRequest;
import com.smartstock.modules.order.dto.CreateOrderRequest;
import com.smartstock.modules.order.model.Order;
import com.smartstock.modules.order.model.OrderStatus;
import com.smartstock.modules.order.repository.OrderItemRepository;
import com.smartstock.modules.order.repository.OrderRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class OrderModuleIntegrationTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private AppUserRepository userRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private InventoryRepository inventoryRepository;

    @Autowired
    private WarehouseRepository warehouseRepository;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private OrderItemRepository orderItemRepository;

    @Autowired
    private OutboxEventRepository outboxEventRepository;

    private AppUser customer1;
    private AppUser customer2;
    private AppUser admin;

    private String customer1Token;
    private String customer2Token;
    private String adminToken;

    private Product laptopProduct;
    private Product mouseProduct;
    private Product inactiveProduct;

    @BeforeEach
    void setUp() {
        outboxEventRepository.deleteAll();
        orderItemRepository.deleteAll();
        orderRepository.deleteAll();
        inventoryRepository.deleteAll();
        productRepository.deleteAll();
        categoryRepository.deleteAll();
        warehouseRepository.deleteAll();
        userRepository.deleteAll();

        // 1. Setup Users
        customer1 = userRepository.save(AppUser.builder()
                .name("Alice Customer")
                .email("alice.order@smartstock.local")
                .password("aliceSecret")
                .role(UserRole.CUSTOMER)
                .build());

        customer2 = userRepository.save(AppUser.builder()
                .name("Bob Buyer")
                .email("bob.order@smartstock.local")
                .password("bobSecret")
                .role(UserRole.CUSTOMER)
                .build());

        admin = userRepository.save(AppUser.builder()
                .name("Admin Supervisor")
                .email("admin.order@smartstock.local")
                .password("adminSecret")
                .role(UserRole.ADMIN)
                .build());

        customer1Token = jwtService.generateToken(customer1.getId(), customer1.getEmail(), customer1.getRole().name());
        customer2Token = jwtService.generateToken(customer2.getId(), customer2.getEmail(), customer2.getRole().name());
        adminToken = jwtService.generateToken(admin.getId(), admin.getEmail(), admin.getRole().name());

        // 2. Setup Catalog
        Category electronics = categoryRepository.save(Category.builder()
                .name("Electronics")
                .description("Gadgets and Hardware")
                .build());

        laptopProduct = productRepository.save(Product.builder()
                .name("ThinkPad X1 Carbon")
                .sku("LAP-X1-001")
                .description("Ultrabook")
                .price(new BigDecimal("1200.00"))
                .category(electronics)
                .active(true)
                .build());

        mouseProduct = productRepository.save(Product.builder()
                .name("Logitech MX Master 3S")
                .sku("MOU-MX-001")
                .description("Ergonomic mouse")
                .price(new BigDecimal("99.50"))
                .category(electronics)
                .active(true)
                .build());

        inactiveProduct = productRepository.save(Product.builder()
                .name("Floppy Drive 3.5")
                .sku("DRV-FLP-001")
                .description("Legacy storage")
                .price(new BigDecimal("19.99"))
                .category(electronics)
                .active(false)
                .build());
    }

    // =========================================================================
    // 1. Order Creation Tests
    // =========================================================================

    @Test
    @DisplayName("Order: Customer successfully places order with single item and outbox event is created")
    void testSuccessfulOrderCreationSingleItem() throws Exception {
        CreateOrderRequest request = CreateOrderRequest.builder()
                .items(List.of(
                        CreateOrderItemRequest.builder()
                                .productId(laptopProduct.getId())
                                .quantity(2)
                                .build()
                ))
                .build();

        MvcResult result = mockMvc.perform(post("/orders")
                        .header("Authorization", "Bearer " + customer1Token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.message", containsString("Order placed successfully")))
                .andExpect(jsonPath("$.data.id", notNullValue()))
                .andExpect(jsonPath("$.data.userId", is(customer1.getId().intValue())))
                .andExpect(jsonPath("$.data.customerEmail", is(customer1.getEmail())))
                .andExpect(jsonPath("$.data.status", is("PENDING")))
                .andExpect(jsonPath("$.data.warehouseId", nullValue()))
                .andExpect(jsonPath("$.data.totalAmount", is(2400.00)))
                .andExpect(jsonPath("$.data.items", hasSize(1)))
                .andExpect(jsonPath("$.data.items[0].productId", is(laptopProduct.getId().intValue())))
                .andExpect(jsonPath("$.data.items[0].quantity", is(2)))
                .andExpect(jsonPath("$.data.items[0].unitPrice", is(1200.00)))
                .andExpect(jsonPath("$.data.items[0].subtotal", is(2400.00)))
                .andReturn();

        JsonNode responseJson = objectMapper.readTree(result.getResponse().getContentAsString());
        long orderId = responseJson.path("data").path("id").asLong();

        // Verify Order persisted in database
        Order persistedOrder = orderRepository.findById(orderId).orElseThrow();
        assertThat(persistedOrder.getStatus()).isEqualTo(OrderStatus.PENDING);
        assertThat(persistedOrder.getWarehouse()).isNull();
        assertThat(persistedOrder.getTotalAmount()).isEqualByComparingTo("2400.00");
        assertThat(persistedOrder.getItems()).hasSize(1);

        // Verify OutboxEvent persisted within the same transaction
        List<OutboxEvent> outboxEvents = outboxEventRepository.findAll();
        assertThat(outboxEvents).hasSize(1);

        OutboxEvent outboxEvent = outboxEvents.get(0);
        assertThat(outboxEvent.getAggregateId()).isEqualTo(String.valueOf(orderId));
        assertThat(outboxEvent.getEventType()).isEqualTo("OrderCreated");
        assertThat(outboxEvent.getStatus()).isEqualTo(OutboxStatus.PENDING);
        assertThat(outboxEvent.getEventId()).isNotBlank();

        // Parse and verify Outbox payload
        JsonNode payloadJson = objectMapper.readTree(outboxEvent.getPayload());
        assertThat(payloadJson.path("orderId").asLong()).isEqualTo(orderId);
        assertThat(payloadJson.path("customerId").asLong()).isEqualTo(customer1.getId());
        assertThat(payloadJson.path("totalAmount").asDouble()).isEqualTo(2400.00);
        assertThat(payloadJson.path("items")).hasSize(1);
        assertThat(payloadJson.path("items").get(0).path("productId").asLong()).isEqualTo(laptopProduct.getId());
        assertThat(payloadJson.path("items").get(0).path("quantity").asInt()).isEqualTo(2);
        assertThat(payloadJson.path("items").get(0).path("unitPrice").asDouble()).isEqualTo(1200.00);
    }

    @Test
    @DisplayName("Order: Multiple items calculated accurately and prices snapshot from database")
    void testMultipleItemsOrderTotalCalculation() throws Exception {
        // Laptop: 1 * 1200.00 = 1200.00
        // Mouse: 3 * 99.50 = 298.50
        // Total = 1498.50
        CreateOrderRequest request = CreateOrderRequest.builder()
                .items(List.of(
                        CreateOrderItemRequest.builder()
                                .productId(laptopProduct.getId())
                                .quantity(1)
                                .build(),
                        CreateOrderItemRequest.builder()
                                .productId(mouseProduct.getId())
                                .quantity(3)
                                .build()
                ))
                .build();

        mockMvc.perform(post("/orders")
                        .header("Authorization", "Bearer " + customer1Token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.items", hasSize(2)))
                .andExpect(jsonPath("$.data.totalAmount", is(1498.50)));
    }

    @Test
    @DisplayName("Order: Rejects nonexistent product with 404 Not Found")
    void testRejectsNonexistentProduct() throws Exception {
        CreateOrderRequest request = CreateOrderRequest.builder()
                .items(List.of(
                        CreateOrderItemRequest.builder()
                                .productId(999999L)
                                .quantity(1)
                                .build()
                ))
                .build();

        mockMvc.perform(post("/orders")
                        .header("Authorization", "Bearer " + customer1Token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsString("Product not found with ID: 999999")));

        // Transaction rollback: no order or outbox event persisted
        assertThat(orderRepository.count()).isZero();
        assertThat(outboxEventRepository.count()).isZero();
    }

    @Test
    @DisplayName("Order: Rejects inactive product with 400 Bad Request")
    void testRejectsInactiveProduct() throws Exception {
        CreateOrderRequest request = CreateOrderRequest.builder()
                .items(List.of(
                        CreateOrderItemRequest.builder()
                                .productId(inactiveProduct.getId())
                                .quantity(1)
                                .build()
                ))
                .build();

        mockMvc.perform(post("/orders")
                        .header("Authorization", "Bearer " + customer1Token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsString("inactive and cannot be ordered")));

        assertThat(orderRepository.count()).isZero();
        assertThat(outboxEventRepository.count()).isZero();
    }

    @Test
    @DisplayName("Order: Rejects invalid quantities (<= 0) with 400 Bad Request")
    void testRejectsInvalidQuantity() throws Exception {
        CreateOrderRequest request = CreateOrderRequest.builder()
                .items(List.of(
                        CreateOrderItemRequest.builder()
                                .productId(laptopProduct.getId())
                                .quantity(0) // Invalid
                                .build()
                ))
                .build();

        mockMvc.perform(post("/orders")
                        .header("Authorization", "Bearer " + customer1Token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", is("Validation failed")));

        assertThat(orderRepository.count()).isZero();
    }

    @Test
    @DisplayName("Order: Rejects empty items list with 400 Bad Request")
    void testRejectsEmptyItems() throws Exception {
        CreateOrderRequest request = CreateOrderRequest.builder()
                .items(Collections.emptyList())
                .build();

        mockMvc.perform(post("/orders")
                        .header("Authorization", "Bearer " + customer1Token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", is("Validation failed")));
    }

    @Test
    @DisplayName("Order: Rejects duplicate products in the same order")
    void testRejectsDuplicateProductInSingleOrder() throws Exception {
        CreateOrderRequest request = CreateOrderRequest.builder()
                .items(List.of(
                        CreateOrderItemRequest.builder()
                                .productId(laptopProduct.getId())
                                .quantity(1)
                                .build(),
                        CreateOrderItemRequest.builder()
                                .productId(laptopProduct.getId())
                                .quantity(2)
                                .build()
                ))
                .build();

        mockMvc.perform(post("/orders")
                        .header("Authorization", "Bearer " + customer1Token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsString("Duplicate product ID found in order items")));
    }

    // =========================================================================
    // 2. Order Access & RBAC Tests
    // =========================================================================

    @Test
    @DisplayName("RBAC: Customer can view their own order by ID")
    void testCustomerCanViewTheirOwnOrder() throws Exception {
        Order order = createTestOrder(customer1, laptopProduct, 1);

        mockMvc.perform(get("/orders/" + order.getId())
                        .header("Authorization", "Bearer " + customer1Token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.id", is(order.getId().intValue())))
                .andExpect(jsonPath("$.data.customerEmail", is(customer1.getEmail())));
    }

    @Test
    @DisplayName("RBAC: Customer CANNOT access another customer's order (403 Forbidden)")
    void testCustomerCannotAccessAnotherCustomerOrder() throws Exception {
        // Order belongs to Customer 1
        Order order = createTestOrder(customer1, laptopProduct, 1);

        // Customer 2 attempts to view it
        mockMvc.perform(get("/orders/" + order.getId())
                        .header("Authorization", "Bearer " + customer2Token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsStringIgnoringCase("Access denied")));
    }

    @Test
    @DisplayName("RBAC: Admin CAN view any customer's order by ID")
    void testAdminCanViewAnyCustomerOrder() throws Exception {
        Order order = createTestOrder(customer1, laptopProduct, 1);

        mockMvc.perform(get("/orders/" + order.getId())
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.id", is(order.getId().intValue())))
                .andExpect(jsonPath("$.data.customerEmail", is(customer1.getEmail())));
    }

    @Test
    @DisplayName("Order: Customer can view their own order history")
    void testCustomerCanViewOrderHistory() throws Exception {
        createTestOrder(customer1, laptopProduct, 1);
        createTestOrder(customer1, mouseProduct, 2);
        createTestOrder(customer2, mouseProduct, 1); // Belongs to customer 2

        mockMvc.perform(get("/orders/my")
                        .header("Authorization", "Bearer " + customer1Token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data", hasSize(2)))
                .andExpect(jsonPath("$.data[0].customerEmail", is(customer1.getEmail())))
                .andExpect(jsonPath("$.data[1].customerEmail", is(customer1.getEmail())));
    }

    @Test
    @DisplayName("RBAC: Admin can view all orders across all customers via /admin/orders")
    void testAdminCanViewAllOrders() throws Exception {
        createTestOrder(customer1, laptopProduct, 1);
        createTestOrder(customer2, mouseProduct, 1);

        mockMvc.perform(get("/admin/orders")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.totalElements", is(2)));
    }

    @Test
    @DisplayName("RBAC: Customer CANNOT access admin all-orders endpoint (403 Forbidden)")
    void testCustomerCannotAccessAdminAllOrders() throws Exception {
        mockMvc.perform(get("/admin/orders")
                        .header("Authorization", "Bearer " + customer1Token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsStringIgnoringCase("Access denied")));
    }

    @Test
    @DisplayName("Customer API: GET /orders returns authenticated customer's own order history")
    void testCustomerGetOrdersReturnsOwnHistory() throws Exception {
        createTestOrder(customer1, laptopProduct, 1);
        createTestOrder(customer1, mouseProduct, 2);
        createTestOrder(customer2, mouseProduct, 1); // Belongs to customer 2

        // Customer 1 only sees their 2 orders
        mockMvc.perform(get("/orders")
                        .header("Authorization", "Bearer " + customer1Token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data", hasSize(2)))
                .andExpect(jsonPath("$.data[0].customerEmail", is(customer1.getEmail())))
                .andExpect(jsonPath("$.data[1].customerEmail", is(customer1.getEmail())));

        // Customer 2 only sees their 1 order
        mockMvc.perform(get("/orders")
                        .header("Authorization", "Bearer " + customer2Token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].customerEmail", is(customer2.getEmail())));
    }

    @Test
    @DisplayName("Order Cancellation: Customer can cancel their own CONFIRMED order, releasing stock")
    void testCustomerCanCancelOwnConfirmedOrder() throws Exception {
        // Setup warehouse and inventory
        com.smartstock.modules.inventory.model.Warehouse warehouse = warehouseRepository.save(
                com.smartstock.modules.inventory.model.Warehouse.builder()
                        .name("Surat Hub")
                        .location("Surat")
                        .build());

        inventoryRepository.save(com.smartstock.modules.inventory.model.Inventory.builder()
                .product(laptopProduct)
                .warehouse(warehouse)
                .onHand(10)
                .reserved(2)
                .build());

        Order order = createTestOrder(customer1, laptopProduct, 2);
        order.setStatus(OrderStatus.CONFIRMED);
        order.setWarehouse(warehouse);
        order = orderRepository.save(order);

        mockMvc.perform(post("/orders/" + order.getId() + "/cancel")
                        .header("Authorization", "Bearer " + customer1Token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.status", is("CANCELLED")))
                .andExpect(jsonPath("$.data.cancelledByRole", is("CUSTOMER")));

        // Verify order in database is CANCELLED and attributed to CUSTOMER
        Order cancelledOrder = orderRepository.findById(order.getId()).orElseThrow();
        assertThat(cancelledOrder.getStatus()).isEqualTo(OrderStatus.CANCELLED);
        assertThat(cancelledOrder.getCancelledByRole()).isEqualTo(UserRole.CUSTOMER);

        // Verify stock was released in database (reserved went from 2 to 0)
        com.smartstock.modules.inventory.model.Inventory inv = inventoryRepository
                .findByProductIdAndWarehouseId(laptopProduct.getId(), warehouse.getId()).orElseThrow();
        assertThat(inv.getReserved()).isZero();
    }

    @Test
    @DisplayName("Order Cancellation: Customer CANNOT cancel another customer's order (403 Forbidden)")
    void testCustomerCannotCancelAnotherCustomerOrder() throws Exception {
        Order order = createTestOrder(customer1, laptopProduct, 1);

        mockMvc.perform(post("/orders/" + order.getId() + "/cancel")
                        .header("Authorization", "Bearer " + customer2Token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsStringIgnoringCase("Access denied")));
    }

    @Test
    @DisplayName("Order Cancellation: Cannot cancel already REJECTED or CANCELLED order (400 Bad Request)")
    void testCannotCancelAlreadyRejectedOrCancelledOrder() throws Exception {
        Order order = createTestOrder(customer1, laptopProduct, 1);
        order.setStatus(OrderStatus.REJECTED);
        orderRepository.save(order);

        mockMvc.perform(post("/orders/" + order.getId() + "/cancel")
                        .header("Authorization", "Bearer " + customer1Token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsString("already REJECTED")));
    }

    @Test
    @DisplayName("Admin Order: Admin can view any order details via /admin/orders/{id}")
    void testAdminCanViewAnyOrderViaAdminEndpoint() throws Exception {
        Order order = createTestOrder(customer1, laptopProduct, 1);

        mockMvc.perform(get("/admin/orders/" + order.getId())
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.id", is(order.getId().intValue())));
    }

    @Test
    @DisplayName("Admin Order: Admin can cancel any order via /admin/orders/{id}/cancel")
    void testAdminCanCancelAnyOrderViaAdminEndpoint() throws Exception {
        Order order = createTestOrder(customer1, laptopProduct, 1);

        mockMvc.perform(post("/admin/orders/" + order.getId() + "/cancel")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.status", is("CANCELLED")))
                .andExpect(jsonPath("$.data.cancelledByRole", is("ADMIN")));

        Order cancelledOrder = orderRepository.findById(order.getId()).orElseThrow();
        assertThat(cancelledOrder.getStatus()).isEqualTo(OrderStatus.CANCELLED);
        assertThat(cancelledOrder.getCancelledByRole()).isEqualTo(UserRole.ADMIN);
    }

    @Test
    @DisplayName("Security: Unauthenticated requests are rejected with 401 Unauthorized")
    void testUnauthenticatedRequestsRejected() throws Exception {
        mockMvc.perform(get("/orders/my"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success", is(false)));

        mockMvc.perform(post("/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[]}"))
                .andExpect(status().isUnauthorized());
    }

    // =========================================================================
    // Helper Methods
    // =========================================================================

    private Order createTestOrder(AppUser customer, Product product, int quantity) {
        BigDecimal unitPrice = product.getPrice();
        BigDecimal total = unitPrice.multiply(BigDecimal.valueOf(quantity));

        Order order = Order.builder()
                .user(customer)
                .status(OrderStatus.PENDING)
                .totalAmount(total)
                .build();

        order.addItem(com.smartstock.modules.order.model.OrderItem.builder()
                .product(product)
                .quantity(quantity)
                .unitPrice(unitPrice)
                .build());

        return orderRepository.save(order);
    }
}
