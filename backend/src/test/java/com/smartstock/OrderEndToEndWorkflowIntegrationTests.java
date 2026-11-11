package com.smartstock;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartstock.common.event.model.OutboxEvent;
import com.smartstock.common.event.model.OutboxStatus;
import com.smartstock.common.event.publisher.OutboxPublisher;
import com.smartstock.common.event.repository.OutboxEventRepository;
import com.smartstock.common.event.repository.ProcessedEventRepository;
import com.smartstock.common.security.JwtService;
import com.smartstock.modules.auth.model.AppUser;
import com.smartstock.modules.auth.model.UserRole;
import com.smartstock.modules.auth.repository.AppUserRepository;
import com.smartstock.modules.inventory.consumer.OrderCreatedKafkaListener;
import com.smartstock.modules.inventory.model.Category;
import com.smartstock.modules.inventory.model.Inventory;
import com.smartstock.modules.inventory.model.Product;
import com.smartstock.modules.inventory.model.Warehouse;
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
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.clients.producer.RecordMetadata;
import org.apache.kafka.common.TopicPartition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.kafka.support.SendResult;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:e2e_workflow_testdb;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
        "smartstock.outbox.publisher.enabled=true"
})
@DisplayName("Order End-to-End Workflow Integration Tests")
class OrderEndToEndWorkflowIntegrationTests {

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
    private WarehouseRepository warehouseRepository;

    @Autowired
    private InventoryRepository inventoryRepository;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private OrderItemRepository orderItemRepository;

    @Autowired
    private OutboxEventRepository outboxEventRepository;

    @Autowired
    private ProcessedEventRepository processedEventRepository;

    @Autowired
    private OutboxPublisher outboxPublisher;

    @Autowired
    private OrderCreatedKafkaListener kafkaListener;

    @MockBean
    private KafkaTemplate<String, String> kafkaTemplate;

    private AppUser customer;
    private String customerToken;
    private Warehouse suratWarehouse;
    private Warehouse mumbaiWarehouse;
    private Product laptopProduct;
    private Product keyboardProduct;

    @BeforeEach
    void setUp() {
        processedEventRepository.deleteAll();
        outboxEventRepository.deleteAll();
        orderItemRepository.deleteAll();
        orderRepository.deleteAll();
        inventoryRepository.deleteAll();
        productRepository.deleteAll();
        categoryRepository.deleteAll();
        warehouseRepository.deleteAll();
        userRepository.deleteAll();

        // 1. Setup Customer
        customer = userRepository.save(AppUser.builder()
                .name("Alice Workflow")
                .email("alice.workflow@smartstock.local")
                .password("password123")
                .role(UserRole.CUSTOMER)
                .build());

        customerToken = jwtService.generateToken(customer.getId(), customer.getEmail(), customer.getRole().name());

        // 2. Setup Warehouses
        suratWarehouse = warehouseRepository.save(Warehouse.builder()
                .name("Surat Warehouse")
                .location("Surat")
                .build());

        mumbaiWarehouse = warehouseRepository.save(Warehouse.builder()
                .name("Mumbai Warehouse")
                .location("Mumbai")
                .build());

        // 3. Setup Catalog
        Category electronics = categoryRepository.save(Category.builder()
                .name("Electronics")
                .description("Hardware and Accessories")
                .build());

        laptopProduct = productRepository.save(Product.builder()
                .name("Dell XPS 15")
                .sku("DELL-XPS-001")
                .description("Laptop")
                .price(new BigDecimal("1500.00"))
                .category(electronics)
                .active(true)
                .build());

        keyboardProduct = productRepository.save(Product.builder()
                .name("Keychron K2")
                .sku("KEY-K2-001")
                .description("Mechanical Keyboard")
                .price(new BigDecimal("100.00"))
                .category(electronics)
                .active(true)
                .build());

        // Configure mock KafkaTemplate to return successful future with valid RecordMetadata
        RecordMetadata metadata = new RecordMetadata(new TopicPartition("order.created.v1", 0), 0, 0, System.currentTimeMillis(), 0, 0);
        SendResult<String, String> sendResult = new SendResult<>(new ProducerRecord<>("order.created.v1", "key", "payload"), metadata);
        when(kafkaTemplate.send(anyString(), anyString(), anyString())).thenReturn(CompletableFuture.completedFuture(sendResult));
    }

    private void setupInventory(Product product, Warehouse warehouse, int onHand, int reserved) {
        inventoryRepository.save(Inventory.builder()
                .product(product)
                .warehouse(warehouse)
                .onHand(onHand)
                .reserved(reserved)
                .build());
    }

    @Test
    @DisplayName("Complete Workflow: Order placed -> Outbox published -> Consumer reserves stock -> Order CONFIRMED at Surat")
    void testCompleteSuccessfulWorkflowSuratPreference() throws Exception {
        // Surat has 10 Laptops; Mumbai has 20 Laptops
        setupInventory(laptopProduct, suratWarehouse, 10, 0);
        setupInventory(laptopProduct, mumbaiWarehouse, 20, 0);

        // 1. Customer places order for 2 Laptops
        CreateOrderRequest request = CreateOrderRequest.builder()
                .items(List.of(CreateOrderItemRequest.builder()
                        .productId(laptopProduct.getId())
                        .quantity(2)
                        .build()))
                .build();

        MvcResult createResult = mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", "Bearer " + customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.status", is("PENDING")))
                .andReturn();

        JsonNode responseNode = objectMapper.readTree(createResult.getResponse().getContentAsString());
        long orderId = responseNode.path("data").path("id").asLong();

        // 2. Verify OutboxEvent was created in PENDING state
        List<OutboxEvent> pendingEvents = outboxEventRepository.findByStatusOrderByCreatedAtAsc(OutboxStatus.PENDING);
        assertThat(pendingEvents).hasSize(1);
        OutboxEvent outboxEvent = pendingEvents.get(0);
        assertThat(outboxEvent.getAggregateId()).isEqualTo(String.valueOf(orderId));

        // 3. Trigger Outbox Publisher
        outboxPublisher.publishPendingEvents();

        // Verify outbox event is now marked PUBLISHED
        OutboxEvent publishedEvent = outboxEventRepository.findById(outboxEvent.getId()).orElseThrow();
        assertThat(publishedEvent.getStatus()).isEqualTo(OutboxStatus.PUBLISHED);

        // 4. Consumer receives the published JSON payload
        Acknowledgment ack = mock(Acknowledgment.class);
        kafkaListener.onOrderCreated(publishedEvent.getPayload(), "order.created.v1", String.valueOf(orderId), ack);
        verify(ack).acknowledge();

        // 5. Customer fetches order status via REST: order must be CONFIRMED and assigned to Surat Warehouse
        mockMvc.perform(get("/api/v1/orders/" + orderId)
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.status", is("CONFIRMED")))
                .andExpect(jsonPath("$.data.warehouseId", is(suratWarehouse.getId().intValue())))
                .andExpect(jsonPath("$.data.warehouseName", is(suratWarehouse.getName())));

        // 6. Verify inventory reserved at Surat (reserved = 2, available = 8)
        Inventory suratInv = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).orElseThrow();
        assertThat(suratInv.getReserved()).isEqualTo(2);
        assertThat(suratInv.getAvailable()).isEqualTo(8);

        // Mumbai remains untouched
        Inventory mumbaiInv = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), mumbaiWarehouse.getId()).orElseThrow();
        assertThat(mumbaiInv.getReserved()).isZero();

        // ProcessedEvent recorded
        assertThat(processedEventRepository.existsByEventId(publishedEvent.getEventId())).isTrue();
    }

    @Test
    @DisplayName("Complete Workflow: Surat lacks stock -> Fallback to Mumbai succeeds -> Order CONFIRMED at Mumbai")
    void testCompleteWorkflowFallbackToMumbai() throws Exception {
        // Surat has only 1 Laptop (needs 4); Mumbai has 10 Laptops
        setupInventory(laptopProduct, suratWarehouse, 1, 0);
        setupInventory(laptopProduct, mumbaiWarehouse, 10, 0);

        CreateOrderRequest request = CreateOrderRequest.builder()
                .items(List.of(CreateOrderItemRequest.builder()
                        .productId(laptopProduct.getId())
                        .quantity(4)
                        .build()))
                .build();

        MvcResult result = mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", "Bearer " + customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();

        long orderId = objectMapper.readTree(result.getResponse().getContentAsString()).path("data").path("id").asLong();

        // Publish outbox event
        outboxPublisher.publishPendingEvents();
        OutboxEvent event = outboxEventRepository.findByStatusOrderByCreatedAtAsc(OutboxStatus.PUBLISHED).get(0);

        // Consumer processes event
        Acknowledgment ack = mock(Acknowledgment.class);
        kafkaListener.onOrderCreated(event.getPayload(), "order.created.v1", String.valueOf(orderId), ack);
        verify(ack).acknowledge();

        // Order confirmed at Mumbai Warehouse
        mockMvc.perform(get("/api/v1/orders/" + orderId)
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status", is("CONFIRMED")))
                .andExpect(jsonPath("$.data.warehouseId", is(mumbaiWarehouse.getId().intValue())))
                .andExpect(jsonPath("$.data.warehouseName", is(mumbaiWarehouse.getName())));

        // Surat stock was NOT reserved
        Inventory suratInv = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).orElseThrow();
        assertThat(suratInv.getReserved()).isZero();

        // Mumbai stock reserved
        Inventory mumbaiInv = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), mumbaiWarehouse.getId()).orElseThrow();
        assertThat(mumbaiInv.getReserved()).isEqualTo(4);
    }

    @Test
    @DisplayName("Complete Workflow: Insufficient stock at all warehouses -> Order REJECTED, warehouse null")
    void testCompleteWorkflowInsufficientStockRejection() throws Exception {
        // Surat has 1; Mumbai has 2 (Total available is 3, order requires 10)
        setupInventory(laptopProduct, suratWarehouse, 1, 0);
        setupInventory(laptopProduct, mumbaiWarehouse, 2, 0);

        CreateOrderRequest request = CreateOrderRequest.builder()
                .items(List.of(CreateOrderItemRequest.builder()
                        .productId(laptopProduct.getId())
                        .quantity(10)
                        .build()))
                .build();

        MvcResult result = mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", "Bearer " + customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();

        long orderId = objectMapper.readTree(result.getResponse().getContentAsString()).path("data").path("id").asLong();

        outboxPublisher.publishPendingEvents();
        OutboxEvent event = outboxEventRepository.findByStatusOrderByCreatedAtAsc(OutboxStatus.PUBLISHED).get(0);

        Acknowledgment ack = mock(Acknowledgment.class);
        kafkaListener.onOrderCreated(event.getPayload(), "order.created.v1", String.valueOf(orderId), ack);
        verify(ack).acknowledge();

        // Order marked REJECTED and warehouse is null
        mockMvc.perform(get("/api/v1/orders/" + orderId)
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status", is("REJECTED")))
                .andExpect(jsonPath("$.data.warehouseId").doesNotExist());

        // Stock in both warehouses untouched
        assertThat(inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).orElseThrow().getReserved()).isZero();
        assertThat(inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), mumbaiWarehouse.getId()).orElseThrow().getReserved()).isZero();
    }

    @Test
    @DisplayName("Complete Workflow: Duplicate event delivery is skipped safely without reserving duplicate stock")
    void testCompleteWorkflowDuplicateEventDelivery() throws Exception {
        setupInventory(laptopProduct, suratWarehouse, 10, 0);

        CreateOrderRequest request = CreateOrderRequest.builder()
                .items(List.of(CreateOrderItemRequest.builder()
                        .productId(laptopProduct.getId())
                        .quantity(3)
                        .build()))
                .build();

        MvcResult result = mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", "Bearer " + customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();

        long orderId = objectMapper.readTree(result.getResponse().getContentAsString()).path("data").path("id").asLong();
        outboxPublisher.publishPendingEvents();
        OutboxEvent event = outboxEventRepository.findByStatusOrderByCreatedAtAsc(OutboxStatus.PUBLISHED).get(0);

        // First delivery
        Acknowledgment ack1 = mock(Acknowledgment.class);
        kafkaListener.onOrderCreated(event.getPayload(), "order.created.v1", String.valueOf(orderId), ack1);
        verify(ack1).acknowledge();

        Inventory invAfterFirst = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).orElseThrow();
        assertThat(invAfterFirst.getReserved()).isEqualTo(3);

        // Second duplicate delivery
        Acknowledgment ack2 = mock(Acknowledgment.class);
        kafkaListener.onOrderCreated(event.getPayload(), "order.created.v1", String.valueOf(orderId), ack2);
        verify(ack2).acknowledge();

        // Stock remains 3, not 6!
        Inventory invAfterDuplicate = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).orElseThrow();
        assertThat(invAfterDuplicate.getReserved()).isEqualTo(3);
    }

    @Test
    @DisplayName("Complete Workflow: Safe order cancellation of CONFIRMED order releases reserved stock")
    void testCompleteWorkflowCancellationOfConfirmedOrder() throws Exception {
        setupInventory(laptopProduct, suratWarehouse, 10, 0);

        CreateOrderRequest request = CreateOrderRequest.builder()
                .items(List.of(CreateOrderItemRequest.builder()
                        .productId(laptopProduct.getId())
                        .quantity(5)
                        .build()))
                .build();

        MvcResult result = mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", "Bearer " + customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();

        long orderId = objectMapper.readTree(result.getResponse().getContentAsString()).path("data").path("id").asLong();
        outboxPublisher.publishPendingEvents();
        OutboxEvent event = outboxEventRepository.findByStatusOrderByCreatedAtAsc(OutboxStatus.PUBLISHED).get(0);

        Acknowledgment ack = mock(Acknowledgment.class);
        kafkaListener.onOrderCreated(event.getPayload(), "order.created.v1", String.valueOf(orderId), ack);

        // Stock is reserved (5)
        Inventory invReserved = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).orElseThrow();
        assertThat(invReserved.getReserved()).isEqualTo(5);

        // Customer cancels the CONFIRMED order
        mockMvc.perform(post("/api/v1/orders/" + orderId + "/cancel")
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.status", is("CANCELLED")));

        // Stock is released back to 0
        Inventory invAfterCancel = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).orElseThrow();
        assertThat(invAfterCancel.getReserved()).isZero();
        assertThat(invAfterCancel.getAvailable()).isEqualTo(10);
    }

    @Test
    @DisplayName("Complete Workflow: Multi-item all-or-nothing: split inventory across warehouses results in REJECTED")
    void testCompleteWorkflowMultiItemAllOrNothingRejection() throws Exception {
        // Surat has 10 Laptops but 0 Keyboards
        setupInventory(laptopProduct, suratWarehouse, 10, 0);
        setupInventory(keyboardProduct, suratWarehouse, 0, 0);

        // Mumbai has 0 Laptops but 10 Keyboards
        setupInventory(laptopProduct, mumbaiWarehouse, 0, 0);
        setupInventory(keyboardProduct, mumbaiWarehouse, 10, 0);

        // Order requires 2 Laptops AND 2 Keyboards (neither warehouse can fulfill completely)
        CreateOrderRequest request = CreateOrderRequest.builder()
                .items(List.of(
                        CreateOrderItemRequest.builder().productId(laptopProduct.getId()).quantity(2).build(),
                        CreateOrderItemRequest.builder().productId(keyboardProduct.getId()).quantity(2).build()
                ))
                .build();

        MvcResult result = mockMvc.perform(post("/api/v1/orders")
                        .header("Authorization", "Bearer " + customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();

        long orderId = objectMapper.readTree(result.getResponse().getContentAsString()).path("data").path("id").asLong();
        outboxPublisher.publishPendingEvents();
        OutboxEvent event = outboxEventRepository.findByStatusOrderByCreatedAtAsc(OutboxStatus.PUBLISHED).get(0);

        Acknowledgment ack = mock(Acknowledgment.class);
        kafkaListener.onOrderCreated(event.getPayload(), "order.created.v1", String.valueOf(orderId), ack);
        verify(ack).acknowledge();

        // Customer retrieves order: status must be REJECTED, warehouse null
        mockMvc.perform(get("/api/v1/orders/" + orderId)
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status", is("REJECTED")))
                .andExpect(jsonPath("$.data.warehouseId").doesNotExist());

        // Verify zero partial stock left reserved in either warehouse
        assertThat(inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).orElseThrow().getReserved()).isZero();
        assertThat(inventoryRepository.findByProductIdAndWarehouseId(keyboardProduct.getId(), suratWarehouse.getId()).orElseThrow().getReserved()).isZero();
        assertThat(inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), mumbaiWarehouse.getId()).orElseThrow().getReserved()).isZero();
        assertThat(inventoryRepository.findByProductIdAndWarehouseId(keyboardProduct.getId(), mumbaiWarehouse.getId()).orElseThrow().getReserved()).isZero();
    }
}
