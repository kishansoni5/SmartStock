package com.smartstock.modules.inventory.seeder;

import com.smartstock.modules.inventory.model.Category;
import com.smartstock.modules.inventory.model.Inventory;
import com.smartstock.modules.inventory.model.Product;
import com.smartstock.modules.inventory.model.Warehouse;
import com.smartstock.modules.inventory.repository.CategoryRepository;
import com.smartstock.modules.inventory.repository.InventoryRepository;
import com.smartstock.modules.inventory.repository.ProductRepository;
import com.smartstock.modules.inventory.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

/**
 * Development-only database seeder that populates realistic sample categories,
 * products, warehouses, and initial inventory levels for development and manual testing.
 *
 * <p>Activated only when configuration property 'app.dev-data-seed.enabled=true' is present.
 * Fully idempotent: safe to execute across application restarts without duplicating records
 * or resetting existing inventory counts / prices.</p>
 */
@Slf4j
@Component
@Order(20)
@ConditionalOnProperty(prefix = "app.dev-data-seed", name = "enabled", havingValue = "true")
@RequiredArgsConstructor
public class DevelopmentDataSeeder implements CommandLineRunner {

    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final WarehouseRepository warehouseRepository;
    private final InventoryRepository inventoryRepository;

    @Override
    @Transactional
    public void run(String... args) {
        log.info("DevelopmentDataSeeder: Starting development dummy data seeding...");

        Map<String, Category> categories = seedCategories();
        Map<String, Warehouse> warehouses = seedWarehouses();
        Map<String, Product> products = seedProducts(categories);
        seedInventories(products, warehouses);

        log.info("DevelopmentDataSeeder: Development dummy data seeding completed successfully.");
    }

    private Map<String, Category> seedCategories() {
        Map<String, String> categoryDefinitions = Map.of(
                "Electronics", "Electronic devices, computers, and digital gadgets",
                "Accessories", "Computer peripherals and electronic accessories",
                "Home Appliances", "Household appliances and electronic equipment"
        );

        Map<String, Category> result = new HashMap<>();
        categoryDefinitions.forEach((name, description) -> {
            Category category = categoryRepository.findByName(name)
                    .orElseGet(() -> {
                        Category created = categoryRepository.save(Category.builder()
                                .name(name)
                                .description(description)
                                .build());
                        log.info("DevelopmentDataSeeder: Created category '{}' (ID: {})", name, created.getId());
                        return created;
                    });
            result.put(name, category);
        });
        return result;
    }

    private Map<String, Warehouse> seedWarehouses() {
        Map<String, String> warehouseDefinitions = Map.of(
                "Surat Warehouse", "Surat",
                "Mumbai Warehouse", "Mumbai"
        );

        Map<String, Warehouse> result = new HashMap<>();
        warehouseDefinitions.forEach((name, location) -> {
            Warehouse warehouse = warehouseRepository.findByName(name)
                    .orElseGet(() -> {
                        Warehouse created = warehouseRepository.save(Warehouse.builder()
                                .name(name)
                                .location(location)
                                .build());
                        log.info("DevelopmentDataSeeder: Created warehouse '{}' (ID: {}, Location: {})",
                                name, created.getId(), location);
                        return created;
                    });
            result.put(name, warehouse);
        });
        return result;
    }

    private Map<String, Product> seedProducts(Map<String, Category> categories) {
        record ProductDef(String name, String sku, BigDecimal price, String categoryName, String description) {}

        ProductDef[] definitions = {
                new ProductDef("Laptop", "LAP-001", new BigDecimal("55000.00"), "Electronics",
                        "High-performance laptop for professional and personal computing"),
                new ProductDef("Keyboard", "KEY-001", new BigDecimal("1500.00"), "Accessories",
                        "Ergonomic mechanical keyboard with durable switches"),
                new ProductDef("Mouse", "MOU-001", new BigDecimal("700.00"), "Accessories",
                        "Precision optical mouse with ergonomic grip"),
                new ProductDef("Monitor", "MON-001", new BigDecimal("12000.00"), "Electronics",
                        "27-inch Full HD LED backlit display monitor"),
                new ProductDef("Headphones", "HEAD-001", new BigDecimal("2500.00"), "Accessories",
                        "Noise-cancelling over-ear stereo headphones")
        };

        Map<String, Product> result = new HashMap<>();
        for (ProductDef def : definitions) {
            Product product = productRepository.findBySku(def.sku())
                    .orElseGet(() -> {
                        Category category = categories.get(def.categoryName());
                        if (category == null) {
                            throw new IllegalStateException("Category '" + def.categoryName() + "' not found for product: " + def.name());
                        }
                        Product created = productRepository.save(Product.builder()
                                .name(def.name())
                                .sku(def.sku())
                                .price(def.price())
                                .description(def.description())
                                .category(category)
                                .active(true)
                                .build());
                        log.info("DevelopmentDataSeeder: Created product '{}' (SKU: {}, ID: {}, Price: {})",
                                def.name(), def.sku(), created.getId(), def.price());
                        return created;
                    });
            result.put(def.sku(), product);
        }
        return result;
    }

    private void seedInventories(Map<String, Product> products, Map<String, Warehouse> warehouses) {
        Warehouse surat = warehouses.get("Surat Warehouse");
        Warehouse mumbai = warehouses.get("Mumbai Warehouse");

        record InventoryAllocation(String sku, int suratQty, int mumbaiQty) {}

        InventoryAllocation[] allocations = {
                new InventoryAllocation("LAP-001", 10, 20),
                new InventoryAllocation("KEY-001", 30, 15),
                new InventoryAllocation("MOU-001", 50, 40),
                new InventoryAllocation("MON-001", 5, 12),
                new InventoryAllocation("HEAD-001", 0, 25)
        };

        for (InventoryAllocation alloc : allocations) {
            Product product = products.get(alloc.sku());
            if (product == null) {
                log.warn("DevelopmentDataSeeder: Product with SKU '{}' not found. Skipping inventory seeding.", alloc.sku());
                continue;
            }

            seedSingleInventory(product, surat, alloc.suratQty());
            seedSingleInventory(product, mumbai, alloc.mumbaiQty());
        }
    }

    private void seedSingleInventory(Product product, Warehouse warehouse, int onHand) {
        if (warehouse == null) {
            return;
        }

        boolean exists = inventoryRepository.existsByProductIdAndWarehouseId(product.getId(), warehouse.getId());
        if (!exists) {
            Inventory inventory = Inventory.builder()
                    .product(product)
                    .warehouse(warehouse)
                    .onHand(onHand)
                    .reserved(0)
                    .version(0L)
                    .build();
            Inventory saved = inventoryRepository.save(inventory);
            log.info("DevelopmentDataSeeder: Created inventory for SKU '{}' in '{}' (onHand: {}, reserved: 0, ID: {})",
                    product.getSku(), warehouse.getName(), onHand, saved.getId());
        } else {
            log.debug("DevelopmentDataSeeder: Inventory for SKU '{}' in '{}' already exists. Skipping.",
                    product.getSku(), warehouse.getName());
        }
    }
}
