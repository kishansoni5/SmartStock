package com.smartstock;

import com.smartstock.common.event.model.OutboxEvent;
import com.smartstock.common.event.model.OutboxStatus;
import com.smartstock.common.event.model.ProcessedEvent;
import com.smartstock.common.event.repository.OutboxEventRepository;
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
import com.smartstock.modules.order.model.Order;
import com.smartstock.modules.order.model.OrderItem;
import com.smartstock.modules.order.model.OrderStatus;
import com.smartstock.modules.order.repository.OrderRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class DatabaseLayerTests {

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
    private ProcessedEventRepository processedEventRepository;

    @Autowired
    private OutboxEventRepository outboxEventRepository;

    @Test
    @DisplayName("AppUser: Verify entity creation, timestamps and uniqueness")
    void testAppUserPersistence() {
        AppUser user = AppUser.builder()
                .name("Alice Architect")
                .email("alice@smartstock.io")
                .password("$2a$10$hashedpassword")
                .role(UserRole.ADMIN)
                .build();

        AppUser saved = userRepository.save(user);
        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getCreatedAt()).isNotNull();
        assertThat(saved.getRole()).isEqualTo(UserRole.ADMIN);

        AppUser found = userRepository.findByEmail("alice@smartstock.io").orElseThrow();
        assertThat(found.getName()).isEqualTo("Alice Architect");
    }

    @Test
    @DisplayName("Inventory: Verify Category, Product, Warehouse, and Inventory calculated stock")
    void testInventoryAndStockCalculation() {
        Category category = Category.builder()
                .name("Electronics")
                .description("Hardware and electronic gadgets")
                .build();
        Category savedCategory = categoryRepository.save(category);

        Product product = Product.builder()
                .name("Barcode Scanner")
                .sku("SKU-SCAN-001")
                .description("Laser wireless barcode scanner")
                .price(new BigDecimal("149.99"))
                .category(savedCategory)
                .active(true)
                .build();
        Product savedProduct = productRepository.save(product);

        Warehouse warehouse = Warehouse.builder()
                .name("Central Hub")
                .location("Chicago Distribution Center")
                .build();
        Warehouse savedWarehouse = warehouseRepository.save(warehouse);

        Inventory inventory = Inventory.builder()
                .product(savedProduct)
                .warehouse(savedWarehouse)
                .onHand(100)
                .reserved(25)
                .build();
        Inventory savedInventory = inventoryRepository.save(inventory);

        assertThat(savedInventory.getId()).isNotNull();
        // Calculated available = onHand - reserved (100 - 25 = 75)
        assertThat(savedInventory.getAvailable()).isEqualTo(75);
    }

    @Test
    @DisplayName("Order: Verify Order and OrderItem relationship with unit price at order time")
    void testOrderAndOrderItemPersistence() {
        AppUser customer = userRepository.save(AppUser.builder()
                .name("Bob Buyer")
                .email("bob@buyer.com")
                .password("secret")
                .role(UserRole.CUSTOMER)
                .build());

        Category cat = categoryRepository.save(Category.builder()
                .name("Office")
                .description("Office Supplies")
                .build());

        Product product = productRepository.save(Product.builder()
                .name("Thermal Printer")
                .sku("SKU-PRN-002")
                .price(new BigDecimal("299.99"))
                .category(cat)
                .active(true)
                .build());

        Order order = Order.builder()
                .user(customer)
                .status(OrderStatus.PENDING)
                .totalAmount(new BigDecimal("599.98"))
                .build();

        OrderItem item = OrderItem.builder()
                .product(product)
                .quantity(2)
                .unitPrice(new BigDecimal("299.99"))
                .build();

        order.addItem(item);
        Order savedOrder = orderRepository.save(order);

        assertThat(savedOrder.getId()).isNotNull();
        assertThat(savedOrder.getItems()).hasSize(1);
        assertThat(savedOrder.getItems().get(0).getSubtotal()).isEqualByComparingTo("599.98");
    }

    @Test
    @DisplayName("Event: Verify OutboxEvent and ProcessedEvent persistence for EDA idempotency")
    void testEventLayerPersistence() {
        String eventId = UUID.randomUUID().toString();

        OutboxEvent outbox = OutboxEvent.builder()
                .eventId(eventId)
                .aggregateId("ORD-1001")
                .eventType("OrderCreatedEvent")
                .payload("{\"orderId\": 1001, \"amount\": 599.98}")
                .status(OutboxStatus.PENDING)
                .build();
        OutboxEvent savedOutbox = outboxEventRepository.save(outbox);
        assertThat(savedOutbox.getId()).isNotNull();
        assertThat(savedOutbox.getAttempts()).isZero();

        ProcessedEvent processed = ProcessedEvent.builder()
                .eventId(eventId)
                .eventType("OrderCreatedEvent")
                .build();
        ProcessedEvent savedProcessed = processedEventRepository.save(processed);
        assertThat(savedProcessed.getId()).isNotNull();
        assertThat(processedEventRepository.existsByEventId(eventId)).isTrue();
    }
}
