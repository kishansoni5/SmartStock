package com.smartstock;

import com.smartstock.common.event.model.ProcessedEvent;
import com.smartstock.common.event.repository.ProcessedEventRepository;
import com.smartstock.modules.auth.model.AppUser;
import com.smartstock.modules.auth.model.UserRole;
import com.smartstock.modules.auth.repository.AppUserRepository;
import com.smartstock.modules.inventory.model.Category;
import com.smartstock.modules.inventory.model.Inventory;
import com.smartstock.modules.inventory.model.Product;
import com.smartstock.modules.inventory.model.Warehouse;
import com.smartstock.modules.inventory.repository.CategoryRepository;
import com.smartstock.modules.inventory.repository.InventoryRepository;
import com.smartstock.modules.inventory.repository.ProductRepository;
import com.smartstock.modules.inventory.repository.WarehouseRepository;
import com.smartstock.modules.inventory.service.InventoryReservationService;
import com.smartstock.modules.inventory.service.InventoryReservationService.ReservationOutcome;
import com.smartstock.modules.order.event.OrderCreatedEvent;
import com.smartstock.modules.order.model.Order;
import com.smartstock.modules.order.model.OrderItem;
import com.smartstock.modules.order.model.OrderStatus;
import com.smartstock.modules.order.repository.OrderItemRepository;
import com.smartstock.modules.order.repository.OrderRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.DefaultTransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.reset;

@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:inventory_consumer_testdb;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE"
})
@DisplayName("InventoryReservationService Integration Tests")
class InventoryReservationServiceIntegrationTests {

    @Autowired
    private InventoryReservationService reservationService;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private OrderItemRepository orderItemRepository;

    @SpyBean
    private InventoryRepository inventoryRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private WarehouseRepository warehouseRepository;

    @Autowired
    private ProcessedEventRepository processedEventRepository;

    @Autowired
    private AppUserRepository userRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private AppUser customer;
    private Warehouse suratWarehouse;
    private Warehouse mumbaiWarehouse;
    private Product laptopProduct;
    private Product keyboardProduct;
    private Product mouseProduct;

    @BeforeEach
    void setUp() {
        reset(inventoryRepository);
        processedEventRepository.deleteAll();
        orderItemRepository.deleteAll();
        orderRepository.deleteAll();
        inventoryRepository.deleteAll();
        productRepository.deleteAll();
        categoryRepository.deleteAll();
        warehouseRepository.deleteAll();
        userRepository.deleteAll();

        // 1. Setup User
        customer = userRepository.save(AppUser.builder()
                .name("John Buyer")
                .email("john.buyer@smartstock.local")
                .password("hashSecret")
                .role(UserRole.CUSTOMER)
                .build());

        // 2. Setup Warehouses (Surat and Mumbai)
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
                .description("Digital gadgets")
                .build());

        laptopProduct = productRepository.save(Product.builder()
                .name("Laptop")
                .sku("LAP-001")
                .price(new BigDecimal("55000.00"))
                .category(electronics)
                .active(true)
                .build());

        keyboardProduct = productRepository.save(Product.builder()
                .name("Keyboard")
                .sku("KEY-001")
                .price(new BigDecimal("1500.00"))
                .category(electronics)
                .active(true)
                .build());

        mouseProduct = productRepository.save(Product.builder()
                .name("Mouse")
                .sku("MOU-001")
                .price(new BigDecimal("700.00"))
                .category(electronics)
                .active(true)
                .build());
    }

    private Inventory setupStock(Product product, Warehouse warehouse, int onHand, int reserved) {
        return inventoryRepository.save(Inventory.builder()
                .product(product)
                .warehouse(warehouse)
                .onHand(onHand)
                .reserved(reserved)
                .version(0L)
                .build());
    }

    private Order createPendingOrder(List<OrderItemInput> items) {
        Order order = Order.builder()
                .user(customer)
                .status(OrderStatus.PENDING)
                .warehouse(null)
                .totalAmount(BigDecimal.ZERO)
                .build();

        BigDecimal total = BigDecimal.ZERO;
        for (OrderItemInput itemInput : items) {
            BigDecimal subtotal = itemInput.product.getPrice().multiply(BigDecimal.valueOf(itemInput.qty));
            total = total.add(subtotal);
            order.addItem(OrderItem.builder()
                    .product(itemInput.product)
                    .quantity(itemInput.qty)
                    .unitPrice(itemInput.product.getPrice())
                    .build());
        }
        order.setTotalAmount(total);
        return orderRepository.save(order);
    }

    private OrderCreatedEvent buildEvent(Order order) {
        List<OrderCreatedEvent.OrderItemPayload> itemPayloads = order.getItems().stream()
                .map(i -> OrderCreatedEvent.OrderItemPayload.builder()
                        .productId(i.getProduct().getId())
                        .quantity(i.getQuantity())
                        .unitPrice(i.getUnitPrice())
                        .build())
                .toList();

        return OrderCreatedEvent.builder()
                .eventId(UUID.randomUUID().toString())
                .orderId(order.getId())
                .customerId(customer.getId())
                .totalAmount(order.getTotalAmount())
                .items(itemPayloads)
                .createdAt(Instant.now())
                .occurredAt(Instant.now())
                .build();
    }

    record OrderItemInput(Product product, int qty) {}

    // =========================================================================
    // 1. Successful reservation from Surat
    // =========================================================================
    @Test
    @DisplayName("Requirement 1: Successful reservation from preferred Surat warehouse")
    void testSuccessfulReservationFromSurat() {
        // Surat has 10 Laptops, Mumbai has 20 Laptops
        setupStock(laptopProduct, suratWarehouse, 10, 0);
        setupStock(laptopProduct, mumbaiWarehouse, 20, 0);

        // Order 2 Laptops
        Order order = createPendingOrder(List.of(new OrderItemInput(laptopProduct, 2)));
        OrderCreatedEvent event = buildEvent(order);

        ReservationOutcome outcome = reservationService.processOrderCreated(event);

        assertThat(outcome).isEqualTo(ReservationOutcome.CONFIRMED);

        // Verify Order is CONFIRMED and assigned to Surat
        Order updatedOrder = orderRepository.findById(order.getId()).orElseThrow();
        assertThat(updatedOrder.getStatus()).isEqualTo(OrderStatus.CONFIRMED);
        assertThat(updatedOrder.getWarehouse().getId()).isEqualTo(suratWarehouse.getId());

        // Verify Surat stock reserved = 2, Mumbai untouched
        Inventory suratInv = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).orElseThrow();
        Inventory mumbaiInv = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), mumbaiWarehouse.getId()).orElseThrow();
        assertThat(suratInv.getReserved()).isEqualTo(2);
        assertThat(suratInv.getAvailable()).isEqualTo(8);
        assertThat(mumbaiInv.getReserved()).isZero();

        // Verify ProcessedEvent recorded
        assertThat(processedEventRepository.existsByEventId(event.getEventId())).isTrue();
    }

    // =========================================================================
    // 2. Surat insufficient, successful reservation from Mumbai
    // =========================================================================
    @Test
    @DisplayName("Requirement 2: Surat insufficient, successful fallback reservation from Mumbai")
    void testSuratInsufficientFallbackToMumbai() {
        // Surat has only 10, Mumbai has 20
        setupStock(laptopProduct, suratWarehouse, 10, 0);
        setupStock(laptopProduct, mumbaiWarehouse, 20, 0);

        // Order 15 Laptops (Surat cannot fulfill 15, Mumbai can)
        Order order = createPendingOrder(List.of(new OrderItemInput(laptopProduct, 15)));
        OrderCreatedEvent event = buildEvent(order);

        ReservationOutcome outcome = reservationService.processOrderCreated(event);

        assertThat(outcome).isEqualTo(ReservationOutcome.CONFIRMED);

        // Verify Order is CONFIRMED and assigned to Mumbai
        Order updatedOrder = orderRepository.findById(order.getId()).orElseThrow();
        assertThat(updatedOrder.getStatus()).isEqualTo(OrderStatus.CONFIRMED);
        assertThat(updatedOrder.getWarehouse().getId()).isEqualTo(mumbaiWarehouse.getId());

        // Verify Surat reserved remains 0, Mumbai reserved becomes 15
        Inventory suratInv = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).orElseThrow();
        Inventory mumbaiInv = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), mumbaiWarehouse.getId()).orElseThrow();
        assertThat(suratInv.getReserved()).isZero();
        assertThat(mumbaiInv.getReserved()).isEqualTo(15);
        assertThat(mumbaiInv.getAvailable()).isEqualTo(5);

        assertThat(processedEventRepository.existsByEventId(event.getEventId())).isTrue();
    }

    // =========================================================================
    // 3. Neither warehouse has enough stock: order REJECTED
    // =========================================================================
    @Test
    @DisplayName("Requirement 3: Neither warehouse has enough stock: order REJECTED and no stock reserved")
    void testNeitherWarehouseSufficientRejectsOrder() {
        // Surat has 10, Mumbai has 20
        setupStock(laptopProduct, suratWarehouse, 10, 0);
        setupStock(laptopProduct, mumbaiWarehouse, 20, 0);

        // Order 50 Laptops
        Order order = createPendingOrder(List.of(new OrderItemInput(laptopProduct, 50)));
        OrderCreatedEvent event = buildEvent(order);

        ReservationOutcome outcome = reservationService.processOrderCreated(event);

        assertThat(outcome).isEqualTo(ReservationOutcome.REJECTED);

        Order updatedOrder = orderRepository.findById(order.getId()).orElseThrow();
        assertThat(updatedOrder.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(updatedOrder.getWarehouse()).isNull();

        // Verify zero stock was reserved in either warehouse
        Inventory suratInv = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).orElseThrow();
        Inventory mumbaiInv = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), mumbaiWarehouse.getId()).orElseThrow();
        assertThat(suratInv.getReserved()).isZero();
        assertThat(mumbaiInv.getReserved()).isZero();

        // ProcessedEvent must still be recorded to prevent duplicate re-evaluations
        assertThat(processedEventRepository.existsByEventId(event.getEventId())).isTrue();
    }

    // =========================================================================
    // 4. Multi-item order: all items reserved successfully
    // =========================================================================
    @Test
    @DisplayName("Requirement 4: Multi-item order: all items reserved successfully in preferred warehouse")
    void testMultiItemOrderAllReservedSuccessfully() {
        setupStock(laptopProduct, suratWarehouse, 10, 0);
        setupStock(keyboardProduct, suratWarehouse, 30, 0);
        setupStock(mouseProduct, suratWarehouse, 50, 0);

        setupStock(laptopProduct, mumbaiWarehouse, 20, 0);
        setupStock(keyboardProduct, mumbaiWarehouse, 15, 0);
        setupStock(mouseProduct, mumbaiWarehouse, 40, 0);

        Order order = createPendingOrder(List.of(
                new OrderItemInput(laptopProduct, 2),
                new OrderItemInput(keyboardProduct, 5),
                new OrderItemInput(mouseProduct, 10)
        ));
        OrderCreatedEvent event = buildEvent(order);

        ReservationOutcome outcome = reservationService.processOrderCreated(event);

        assertThat(outcome).isEqualTo(ReservationOutcome.CONFIRMED);

        Order updatedOrder = orderRepository.findById(order.getId()).orElseThrow();
        assertThat(updatedOrder.getStatus()).isEqualTo(OrderStatus.CONFIRMED);
        assertThat(updatedOrder.getWarehouse().getId()).isEqualTo(suratWarehouse.getId());

        // Verify all 3 items reserved in Surat
        assertThat(inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).get().getReserved()).isEqualTo(2);
        assertThat(inventoryRepository.findByProductIdAndWarehouseId(keyboardProduct.getId(), suratWarehouse.getId()).get().getReserved()).isEqualTo(5);
        assertThat(inventoryRepository.findByProductIdAndWarehouseId(mouseProduct.getId(), suratWarehouse.getId()).get().getReserved()).isEqualTo(10);

        // Mumbai untouched
        assertThat(inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), mumbaiWarehouse.getId()).get().getReserved()).isZero();
    }

    // =========================================================================
    // 5. One item fails: all earlier reservations roll back
    // =========================================================================
    @Test
    @DisplayName("Requirement 5: One item fails: earlier reservations roll back (no partial reservation)")
    void testOneItemFailsAllEarlierReservationsRollBack() {
        // Surat has 10 Laptops but only 5 Keyboards
        setupStock(laptopProduct, suratWarehouse, 10, 0);
        setupStock(keyboardProduct, suratWarehouse, 5, 0);

        // Mumbai has only 2 Laptops and 100 Keyboards
        setupStock(laptopProduct, mumbaiWarehouse, 2, 0);
        setupStock(keyboardProduct, mumbaiWarehouse, 100, 0);

        // Order requires 5 Laptops AND 20 Keyboards
        // Surat has Laptops (10 >= 5), but lacks Keyboards (5 < 20)
        // Mumbai has Keyboards (100 >= 20), but lacks Laptops (2 < 5)
        Order order = createPendingOrder(List.of(
                new OrderItemInput(laptopProduct, 5),
                new OrderItemInput(keyboardProduct, 20)
        ));
        OrderCreatedEvent event = buildEvent(order);

        ReservationOutcome outcome = reservationService.processOrderCreated(event);

        assertThat(outcome).isEqualTo(ReservationOutcome.REJECTED);

        Order updatedOrder = orderRepository.findById(order.getId()).orElseThrow();
        assertThat(updatedOrder.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(updatedOrder.getWarehouse()).isNull();

        // Surat Laptop must be rolled back to 0!
        Inventory suratLaptopInv = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).orElseThrow();
        assertThat(suratLaptopInv.getReserved()).as("Surat Laptop reservation must be rolled back to 0").isZero();

        Inventory suratKeyInv = inventoryRepository.findByProductIdAndWarehouseId(keyboardProduct.getId(), suratWarehouse.getId()).orElseThrow();
        assertThat(suratKeyInv.getReserved()).isZero();

        // Mumbai must be untouched
        Inventory mumbaiLaptopInv = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), mumbaiWarehouse.getId()).orElseThrow();
        assertThat(mumbaiLaptopInv.getReserved()).isZero();
    }

    // =========================================================================
    // 6. Duplicate event: inventory is not reserved twice
    // =========================================================================
    @Test
    @DisplayName("Requirement 6: Duplicate event: inventory is not reserved twice")
    void testDuplicateEventDoesNotReserveTwice() {
        setupStock(laptopProduct, suratWarehouse, 10, 0);
        Order order = createPendingOrder(List.of(new OrderItemInput(laptopProduct, 3)));
        OrderCreatedEvent event = buildEvent(order);

        // First delivery: successful reservation
        ReservationOutcome outcome1 = reservationService.processOrderCreated(event);
        assertThat(outcome1).isEqualTo(ReservationOutcome.CONFIRMED);

        Inventory invAfterFirst = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).orElseThrow();
        assertThat(invAfterFirst.getReserved()).isEqualTo(3);

        // Second delivery (redelivery simulation)
        ReservationOutcome outcome2 = reservationService.processOrderCreated(event);
        assertThat(outcome2).isEqualTo(ReservationOutcome.SKIPPED_DUPLICATE);

        // Inventory must NOT be reserved again (remains 3, not 6)
        Inventory invAfterSecond = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).orElseThrow();
        assertThat(invAfterSecond.getReserved()).isEqualTo(3);
        assertThat(invAfterSecond.getAvailable()).isEqualTo(7);
    }

    // =========================================================================
    // 7. Concurrent reservations: stock must never become negative or oversold
    // =========================================================================
    @Test
    @DisplayName("Requirement 7: Concurrent reservations: stock must never become negative or oversold")
    void testConcurrentReservationsNeverOversell() throws Exception {
        // Surat has onHand = 10, reserved = 0. Available = 10.
        setupStock(laptopProduct, suratWarehouse, 10, 0);

        int threads = 10;
        int qtyPerRequest = 3; // 10 threads * 3 qty = 30 requested against 10 available
        ExecutorService executor = Executors.newFixedThreadPool(threads);
        CountDownLatch latch = new CountDownLatch(1);
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failCount = new AtomicInteger(0);

        TransactionTemplate txTemplate = new TransactionTemplate(transactionManager);
        txTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        List<Future<?>> futures = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            futures.add(executor.submit(() -> {
                try {
                    latch.await();
                    // Each thread executes the atomic conditional database update query inside its own transaction
                    Integer updated = txTemplate.execute(status -> inventoryRepository.reserveStock(
                            laptopProduct.getId(), suratWarehouse.getId(), qtyPerRequest));
                    if (updated != null && updated == 1) {
                        successCount.incrementAndGet();
                    } else {
                        failCount.incrementAndGet();
                    }
                } catch (Exception e) {
                    failCount.incrementAndGet();
                }
            }));
        }

        // Fire all threads simultaneously
        latch.countDown();

        for (Future<?> f : futures) {
            f.get(10, TimeUnit.SECONDS);
        }
        executor.shutdown();

        // Exactly 3 reservations can succeed (3 * 3 = 9 <= 10). 7 must fail.
        assertThat(successCount.get()).isEqualTo(3);
        assertThat(failCount.get()).isEqualTo(7);

        Inventory finalInv = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).orElseThrow();
        assertThat(finalInv.getReserved()).isEqualTo(9);
        assertThat(finalInv.getOnHand()).isEqualTo(10);
        assertThat(finalInv.getAvailable()).isEqualTo(1);
        assertThat(finalInv.getAvailable()).isNotNegative();
    }

    // =========================================================================
    // 8. Technical failure: transaction rolls back and event can be retried
    // =========================================================================
    @Test
    @DisplayName("Requirement 8: Technical failure rolls back transaction and allows retry")
    void testTechnicalFailureRollsBackTransaction() {
        setupStock(laptopProduct, suratWarehouse, 10, 0);
        Order order = createPendingOrder(List.of(new OrderItemInput(laptopProduct, 4)));
        OrderCreatedEvent event = buildEvent(order);

        // Execute inside a TransactionTemplate that simulates a mid-transaction crash
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        try {
            template.execute(status -> {
                // Reserve stock directly
                int updated = inventoryRepository.reserveStock(laptopProduct.getId(), suratWarehouse.getId(), 4);
                assertThat(updated).isEqualTo(1);

                // Simulate unexpected technical crash before commit
                throw new RuntimeException("Simulated Database Network Crash!");
            });
        } catch (RuntimeException expected) {
            assertThat(expected.getMessage()).contains("Simulated Database Network Crash!");
        }

        // Verify that the transaction rolled back: reserved count is 0, NOT 4!
        Inventory invAfterRollback = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).orElseThrow();
        assertThat(invAfterRollback.getReserved()).as("Reserved count must roll back to 0 on failure").isZero();
        assertThat(processedEventRepository.existsByEventId(event.getEventId())).isFalse();

        // Event can now be successfully retried
        ReservationOutcome retryOutcome = reservationService.processOrderCreated(event);
        assertThat(retryOutcome).isEqualTo(ReservationOutcome.CONFIRMED);

        Inventory invAfterRetry = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), suratWarehouse.getId()).orElseThrow();
        assertThat(invAfterRetry.getReserved()).isEqualTo(4);
        assertThat(processedEventRepository.existsByEventId(event.getEventId())).isTrue();
    }

    // =========================================================================
    // 9. Failed stock compensation: rolls back transaction, does NOT continue to Mumbai
    // =========================================================================
    @Test
    @DisplayName("Requirement 9: Failed stock compensation throws exception and rolls back entire transaction")
    void testFailedStockCompensationRollsBackTransaction() {
        // Surat has 10 Laptops and 10 Keyboards in precheck
        setupStock(laptopProduct, suratWarehouse, 10, 0);
        setupStock(keyboardProduct, suratWarehouse, 10, 0);

        // Mumbai has 50 of each (would easily fulfill if reached)
        setupStock(laptopProduct, mumbaiWarehouse, 50, 0);
        setupStock(keyboardProduct, mumbaiWarehouse, 50, 0);

        Order order = createPendingOrder(List.of(
                new OrderItemInput(laptopProduct, 3),
                new OrderItemInput(keyboardProduct, 3)
        ));
        OrderCreatedEvent event = buildEvent(order);

        // Simulate concurrent conflict during keyboard reservation at Surat: reserveStock returns 0
        doReturn(0).when(inventoryRepository).reserveStock(eq(keyboardProduct.getId()), eq(suratWarehouse.getId()), eq(3));

        // Simulate critical releaseStock failure during compensation of Laptop at Surat: releaseStock returns 0
        doReturn(0).when(inventoryRepository).releaseStock(eq(laptopProduct.getId()), eq(suratWarehouse.getId()), eq(3));

        // When processing the order, compensation failure must throw IllegalStateException
        assertThatThrownBy(() -> reservationService.processOrderCreated(event))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Critical stock compensation failure");

        // Entire transaction rolled back:
        // 1. Order status is NOT CONFIRMED for Mumbai; it remains in pre-transaction state PENDING
        Order uncommittedOrder = orderRepository.findById(order.getId()).orElseThrow();
        assertThat(uncommittedOrder.getStatus()).isEqualTo(OrderStatus.PENDING);
        assertThat(uncommittedOrder.getWarehouse()).isNull();

        // 2. Event is NOT recorded in processed_events
        assertThat(processedEventRepository.existsByEventId(event.getEventId())).isFalse();

        // 3. Mumbai warehouse was NEVER touched
        Inventory mumbaiInv = inventoryRepository.findByProductIdAndWarehouseId(laptopProduct.getId(), mumbaiWarehouse.getId()).orElseThrow();
        assertThat(mumbaiInv.getReserved()).isZero();
    }

    // =========================================================================
    // 10. isEventProcessed method verification
    // =========================================================================
    @Test
    @DisplayName("Requirement 10: isEventProcessed accurately checks processed_events table")
    void testIsEventProcessed() {
        assertThat(reservationService.isEventProcessed(null)).isFalse();
        assertThat(reservationService.isEventProcessed("")).isFalse();
        assertThat(reservationService.isEventProcessed("non-existent-event-id")).isFalse();

        ProcessedEvent pe = ProcessedEvent.builder()
                .eventId("test-event-uuid-12345")
                .eventType("OrderCreated")
                .build();
        processedEventRepository.saveAndFlush(pe);

        assertThat(reservationService.isEventProcessed("test-event-uuid-12345")).isTrue();
    }
}
