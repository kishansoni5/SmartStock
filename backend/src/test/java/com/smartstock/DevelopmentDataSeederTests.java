package com.smartstock;

import com.smartstock.modules.inventory.model.Category;
import com.smartstock.modules.inventory.model.Inventory;
import com.smartstock.modules.inventory.model.Product;
import com.smartstock.modules.inventory.model.Warehouse;
import com.smartstock.modules.inventory.repository.CategoryRepository;
import com.smartstock.modules.inventory.repository.InventoryRepository;
import com.smartstock.modules.inventory.repository.ProductRepository;
import com.smartstock.modules.inventory.repository.WarehouseRepository;
import com.smartstock.modules.inventory.seeder.DevelopmentDataSeeder;
import com.smartstock.modules.order.repository.OrderRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("DevelopmentDataSeeder Tests")
class DevelopmentDataSeederTests {

    @Nested
    @SpringBootTest
    @ActiveProfiles("test")
    @TestPropertySource(properties = {
            "app.dev-data-seed.enabled=true",
            "spring.datasource.url=jdbc:h2:mem:seeder_testdb;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE"
    })
    @DisplayName("When Seeder Is Enabled")
    class WhenSeederIsEnabled {

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
        private DevelopmentDataSeeder developmentDataSeeder;

        @Test
        @DisplayName("Creates all sample categories, products, warehouses, and inventories at startup")
        void testSeedingInitialData() {
            // 1. Verify Categories (Electronics, Accessories, Home Appliances)
            assertThat(categoryRepository.findByName("Electronics")).isPresent();
            assertThat(categoryRepository.findByName("Accessories")).isPresent();
            assertThat(categoryRepository.findByName("Home Appliances")).isPresent();

            Category electronics = categoryRepository.findByName("Electronics").orElseThrow();
            Category accessories = categoryRepository.findByName("Accessories").orElseThrow();

            // 2. Verify Warehouses (Surat, Mumbai)
            Optional<Warehouse> suratOpt = warehouseRepository.findByName("Surat Warehouse");
            Optional<Warehouse> mumbaiOpt = warehouseRepository.findByName("Mumbai Warehouse");
            assertThat(suratOpt).isPresent();
            assertThat(mumbaiOpt).isPresent();
            assertThat(suratOpt.get().getLocation()).isEqualTo("Surat");
            assertThat(mumbaiOpt.get().getLocation()).isEqualTo("Mumbai");

            Warehouse surat = suratOpt.get();
            Warehouse mumbai = mumbaiOpt.get();

            // 3. Verify Products & Prices & Category Mappings
            Product laptop = productRepository.findBySku("LAP-001").orElseThrow();
            assertThat(laptop.getName()).isEqualTo("Laptop");
            assertThat(laptop.getPrice()).isEqualByComparingTo(new BigDecimal("55000.00"));
            assertThat(laptop.getCategory().getId()).isEqualTo(electronics.getId());
            assertThat(laptop.getActive()).isTrue();

            Product keyboard = productRepository.findBySku("KEY-001").orElseThrow();
            assertThat(keyboard.getName()).isEqualTo("Keyboard");
            assertThat(keyboard.getPrice()).isEqualByComparingTo(new BigDecimal("1500.00"));
            assertThat(keyboard.getCategory().getId()).isEqualTo(accessories.getId());

            Product mouse = productRepository.findBySku("MOU-001").orElseThrow();
            assertThat(mouse.getName()).isEqualTo("Mouse");
            assertThat(mouse.getPrice()).isEqualByComparingTo(new BigDecimal("700.00"));
            assertThat(mouse.getCategory().getId()).isEqualTo(accessories.getId());

            Product monitor = productRepository.findBySku("MON-001").orElseThrow();
            assertThat(monitor.getName()).isEqualTo("Monitor");
            assertThat(monitor.getPrice()).isEqualByComparingTo(new BigDecimal("12000.00"));
            assertThat(monitor.getCategory().getId()).isEqualTo(electronics.getId());

            Product headphones = productRepository.findBySku("HEAD-001").orElseThrow();
            assertThat(headphones.getName()).isEqualTo("Headphones");
            assertThat(headphones.getPrice()).isEqualByComparingTo(new BigDecimal("2500.00"));
            assertThat(headphones.getCategory().getId()).isEqualTo(accessories.getId());

            // 4. Verify Surat Warehouse Stock
            assertInventory(laptop.getId(), surat.getId(), 10, 0);
            assertInventory(keyboard.getId(), surat.getId(), 30, 0);
            assertInventory(mouse.getId(), surat.getId(), 50, 0);
            assertInventory(monitor.getId(), surat.getId(), 5, 0);
            assertInventory(headphones.getId(), surat.getId(), 0, 0);

            // 5. Verify Mumbai Warehouse Stock
            assertInventory(laptop.getId(), mumbai.getId(), 20, 0);
            assertInventory(keyboard.getId(), mumbai.getId(), 15, 0);
            assertInventory(mouse.getId(), mumbai.getId(), 40, 0);
            assertInventory(monitor.getId(), mumbai.getId(), 12, 0);
            assertInventory(headphones.getId(), mumbai.getId(), 25, 0);

            // 6. Verify Total Counts
            assertThat(categoryRepository.count()).isEqualTo(3);
            assertThat(warehouseRepository.count()).isEqualTo(2);
            assertThat(productRepository.count()).isEqualTo(5);
            assertThat(inventoryRepository.count()).isEqualTo(10);

            // 7. Verify NO orders are created by the seeder
            assertThat(orderRepository.count()).isZero();
        }

        @Test
        @DisplayName("Seeder is idempotent: re-running does not duplicate records or overwrite modified prices/quantities")
        void testIdempotencyAndNoOverwrite() {
            // Modify product price and an inventory count
            Product laptop = productRepository.findBySku("LAP-001").orElseThrow();
            laptop.setPrice(new BigDecimal("59999.00"));
            productRepository.save(laptop);

            Warehouse surat = warehouseRepository.findByName("Surat Warehouse").orElseThrow();
            Inventory laptopSuratInv = inventoryRepository.findByProductIdAndWarehouseId(laptop.getId(), surat.getId()).orElseThrow();
            laptopSuratInv.setOnHand(99);
            inventoryRepository.save(laptopSuratInv);

            long categoryCountBefore = categoryRepository.count();
            long warehouseCountBefore = warehouseRepository.count();
            long productCountBefore = productRepository.count();
            long inventoryCountBefore = inventoryRepository.count();

            // Re-run seeder (simulating application restart)
            developmentDataSeeder.run();

            // Counts must remain identical
            assertThat(categoryRepository.count()).isEqualTo(categoryCountBefore);
            assertThat(warehouseRepository.count()).isEqualTo(warehouseCountBefore);
            assertThat(productRepository.count()).isEqualTo(productCountBefore);
            assertThat(inventoryRepository.count()).isEqualTo(inventoryCountBefore);

            // Modified values must NOT be overwritten
            Product reloadedLaptop = productRepository.findBySku("LAP-001").orElseThrow();
            assertThat(reloadedLaptop.getPrice()).isEqualByComparingTo(new BigDecimal("59999.00"));

            Inventory reloadedInv = inventoryRepository.findByProductIdAndWarehouseId(laptop.getId(), surat.getId()).orElseThrow();
            assertThat(reloadedInv.getOnHand()).isEqualTo(99);
        }

        private void assertInventory(Long productId, Long warehouseId, int expectedOnHand, int expectedReserved) {
            Optional<Inventory> invOpt = inventoryRepository.findByProductIdAndWarehouseId(productId, warehouseId);
            assertThat(invOpt).as("Inventory for product %d in warehouse %d", productId, warehouseId).isPresent();
            Inventory inv = invOpt.get();
            assertThat(inv.getOnHand()).isEqualTo(expectedOnHand);
            assertThat(inv.getReserved()).isEqualTo(expectedReserved);
            assertThat(inv.getAvailable()).isEqualTo(expectedOnHand - expectedReserved);
        }
    }

    @Nested
    @SpringBootTest
    @ActiveProfiles("test")
    @Transactional
    @TestPropertySource(properties = {
            "app.dev-data-seed.enabled=false"
    })
    @DisplayName("When Seeder Is Disabled")
    class WhenSeederIsDisabled {

        @Autowired
        private ApplicationContext applicationContext;

        @Autowired
        private ProductRepository productRepository;

        @Test
        @DisplayName("Seeder bean is not registered in Spring Context when disabled")
        void testSeederBeanNotRegisteredWhenDisabled() {
            boolean beanExists = applicationContext.containsBean("developmentDataSeeder");
            assertThat(beanExists).isFalse();
        }

        @Test
        @DisplayName("No sample products exist when disabled")
        void testNoSampleDataCreatedWhenDisabled() {
            assertThat(productRepository.findBySku("LAP-001")).isEmpty();
        }
    }
}
