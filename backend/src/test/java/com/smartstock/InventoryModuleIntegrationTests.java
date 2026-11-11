package com.smartstock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartstock.common.security.JwtService;
import com.smartstock.modules.auth.model.AppUser;
import com.smartstock.modules.auth.model.UserRole;
import com.smartstock.modules.auth.repository.AppUserRepository;
import com.smartstock.modules.inventory.dto.*;
import com.smartstock.modules.inventory.model.Category;
import com.smartstock.modules.inventory.model.Inventory;
import com.smartstock.modules.inventory.model.Product;
import com.smartstock.modules.inventory.model.Warehouse;
import com.smartstock.modules.inventory.repository.CategoryRepository;
import com.smartstock.modules.inventory.repository.InventoryRepository;
import com.smartstock.modules.inventory.repository.ProductRepository;
import com.smartstock.modules.inventory.repository.WarehouseRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class InventoryModuleIntegrationTests {

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

    private String adminToken;
    private String customerToken;

    @BeforeEach
    void setUp() {
        inventoryRepository.deleteAll();
        productRepository.deleteAll();
        categoryRepository.deleteAll();
        warehouseRepository.deleteAll();
        userRepository.deleteAll();

        AppUser admin = userRepository.save(AppUser.builder()
                .name("Admin User")
                .email("admin@smartstock.local")
                .password("adminSecret")
                .role(UserRole.ADMIN)
                .build());

        AppUser customer = userRepository.save(AppUser.builder()
                .name("Customer User")
                .email("customer@smartstock.local")
                .password("customerSecret")
                .role(UserRole.CUSTOMER)
                .build());

        adminToken = jwtService.generateToken(admin.getId(), admin.getEmail(), admin.getRole().name());
        customerToken = jwtService.generateToken(customer.getId(), customer.getEmail(), customer.getRole().name());
    }

    // =========================================================================
    // 1. Category API Tests
    // =========================================================================

    @Test
    @DisplayName("Category: ADMIN can create category successfully")
    void testAdminCreateCategorySuccess() throws Exception {
        CategoryRequest request = CategoryRequest.builder()
                .name("Electronics")
                .description("Electronic gadgets and devices")
                .build();

        mockMvc.perform(post("/categories")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.id", notNullValue()))
                .andExpect(jsonPath("$.data.name", is("Electronics")))
                .andExpect(jsonPath("$.data.description", is("Electronic gadgets and devices")));
    }

    @Test
    @DisplayName("Category: CUSTOMER cannot create category (403 Forbidden)")
    void testCustomerCannotCreateCategory() throws Exception {
        CategoryRequest request = CategoryRequest.builder()
                .name("Books")
                .description("Printed books and magazines")
                .build();

        mockMvc.perform(post("/categories")
                        .header("Authorization", "Bearer " + customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsStringIgnoringCase("Access denied")));
    }

    @Test
    @DisplayName("Category: Rejects duplicate category name with 409 Conflict")
    void testDuplicateCategoryNameRejected() throws Exception {
        categoryRepository.save(Category.builder().name("Apparel").description("Clothing").build());

        CategoryRequest request = CategoryRequest.builder()
                .name("Apparel")
                .description("Another clothing description")
                .build();

        mockMvc.perform(post("/categories")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsString("already exists")));
    }

    @Test
    @DisplayName("Category: CUSTOMER can list categories and view category by ID")
    void testCustomerCanReadCategories() throws Exception {
        Category category = categoryRepository.save(Category.builder()
                .name("Home & Kitchen")
                .description("Appliances and tools")
                .build());

        mockMvc.perform(get("/categories")
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].name", is("Home & Kitchen")));

        mockMvc.perform(get("/categories/" + category.getId())
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.id", is(category.getId().intValue())))
                .andExpect(jsonPath("$.data.name", is("Home & Kitchen")));
    }

    @Test
    @DisplayName("Category: Deletion fails if category has associated products")
    void testDeleteCategoryWithProductsFails() throws Exception {
        Category category = categoryRepository.save(Category.builder()
                .name("Hardware")
                .description("Tools and hardware")
                .build());

        productRepository.save(Product.builder()
                .name("Hammer")
                .sku("HAM-001")
                .description("Heavy claw hammer")
                .price(new BigDecimal("19.99"))
                .category(category)
                .active(true)
                .build());

        mockMvc.perform(delete("/categories/" + category.getId())
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsString("contains associated products")));
    }

    // =========================================================================
    // 2. Product API Tests
    // =========================================================================

    @Test
    @DisplayName("Product: ADMIN can create product successfully")
    void testAdminCreateProductSuccess() throws Exception {
        Category category = categoryRepository.save(Category.builder()
                .name("Smartphones")
                .description("Mobile phones")
                .build());

        ProductCreateRequest request = ProductCreateRequest.builder()
                .name("iPhone 15 Pro")
                .sku("IPHONE-15-PRO")
                .description("Apple flagship phone")
                .price(new BigDecimal("999.99"))
                .categoryId(category.getId())
                .active(true)
                .build();

        mockMvc.perform(post("/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.id", notNullValue()))
                .andExpect(jsonPath("$.data.sku", is("IPHONE-15-PRO")))
                .andExpect(jsonPath("$.data.price", is(999.99)))
                .andExpect(jsonPath("$.data.categoryName", is("Smartphones")))
                .andExpect(jsonPath("$.data.active", is(true)));
    }

    @Test
    @DisplayName("Product: CUSTOMER cannot create product (403 Forbidden)")
    void testCustomerCannotCreateProduct() throws Exception {
        Category category = categoryRepository.save(Category.builder().name("Sports").build());

        ProductCreateRequest request = ProductCreateRequest.builder()
                .name("Football")
                .sku("BALL-001")
                .price(new BigDecimal("29.99"))
                .categoryId(category.getId())
                .build();

        mockMvc.perform(post("/products")
                        .header("Authorization", "Bearer " + customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsStringIgnoringCase("Access denied")));
    }

    @Test
    @DisplayName("Product: Rejects duplicate SKU with 409 Conflict")
    void testDuplicateSkuRejected() throws Exception {
        Category category = categoryRepository.save(Category.builder().name("Accessories").build());
        productRepository.save(Product.builder()
                .name("USB-C Cable")
                .sku("CABLE-USBC-1M")
                .price(new BigDecimal("9.99"))
                .category(category)
                .active(true)
                .build());

        ProductCreateRequest request = ProductCreateRequest.builder()
                .name("Another USB Cable")
                .sku("CABLE-USBC-1M")
                .price(new BigDecimal("12.99"))
                .categoryId(category.getId())
                .build();

        mockMvc.perform(post("/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsString("already exists")));
    }

    @Test
    @DisplayName("Product: Customer can only view active products (inactive hidden)")
    void testCustomerOnlyViewsActiveProducts() throws Exception {
        Category category = categoryRepository.save(Category.builder().name("Audio").build());

        Product activeProduct = productRepository.save(Product.builder()
                .name("Wireless Earbuds")
                .sku("AUDIO-001")
                .price(new BigDecimal("49.99"))
                .category(category)
                .active(true)
                .build());

        Product inactiveProduct = productRepository.save(Product.builder()
                .name("Discontinued Headphones")
                .sku("AUDIO-002")
                .price(new BigDecimal("89.99"))
                .category(category)
                .active(false)
                .build());

        // CUSTOMER list: only 1 active product
        mockMvc.perform(get("/products")
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].sku", is("AUDIO-001")));

        // CUSTOMER get inactive product by ID -> 404
        mockMvc.perform(get("/products/" + inactiveProduct.getId())
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success", is(false)));

        // ADMIN get inactive product by ID -> 200 OK
        mockMvc.perform(get("/products/" + inactiveProduct.getId())
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.sku", is("AUDIO-002")))
                .andExpect(jsonPath("$.data.active", is(false)));
    }

    @Test
    @DisplayName("Product: ADMIN can deactivate product (soft delete)")
    void testAdminDeactivateProduct() throws Exception {
        Category category = categoryRepository.save(Category.builder().name("Office").build());
        Product product = productRepository.save(Product.builder()
                .name("Desk Chair")
                .sku("CHAIR-001")
                .price(new BigDecimal("150.00"))
                .category(category)
                .active(true)
                .build());

        mockMvc.perform(delete("/products/" + product.getId())
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.active", is(false)))
                .andExpect(jsonPath("$.message", containsString("deactivated")));
    }

    // =========================================================================
    // 3. Warehouse API Tests
    // =========================================================================

    @Test
    @DisplayName("Warehouse: ADMIN can create and update warehouse")
    void testWarehouseAdminCrud() throws Exception {
        WarehouseRequest createRequest = WarehouseRequest.builder()
                .name("Central Distribution Center")
                .location("Chicago, IL")
                .build();

        mockMvc.perform(post("/warehouses")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.name", is("Central Distribution Center")))
                .andExpect(jsonPath("$.data.location", is("Chicago, IL")));

        Warehouse warehouse = warehouseRepository.findByName("Central Distribution Center").orElseThrow();

        WarehouseRequest updateRequest = WarehouseRequest.builder()
                .name("Central Hub West")
                .location("Aurora, IL")
                .build();

        mockMvc.perform(put("/warehouses/" + warehouse.getId())
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.name", is("Central Hub West")))
                .andExpect(jsonPath("$.data.location", is("Aurora, IL")));
    }

    // =========================================================================
    // 4. Inventory & Stock Adjustment API Tests
    // =========================================================================

    @Test
    @DisplayName("Inventory: ADMIN can adjust stock and view updated onHand and available counts")
    void testStockAdjustmentPositive() throws Exception {
        Category category = categoryRepository.save(Category.builder().name("Gadgets").build());
        Product product = productRepository.save(Product.builder()
                .name("Smartwatch V2")
                .sku("WATCH-002")
                .price(new BigDecimal("199.99"))
                .category(category)
                .active(true)
                .build());

        Warehouse warehouse = warehouseRepository.save(Warehouse.builder()
                .name("Main Facility")
                .location("Dallas, TX")
                .build());

        StockAdjustmentRequest adjustmentRequest = StockAdjustmentRequest.builder()
                .productId(product.getId())
                .warehouseId(warehouse.getId())
                .adjustmentQuantity(100)
                .reason("Initial inventory intake")
                .build();

        mockMvc.perform(post("/inventory/adjust")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(adjustmentRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data.productId", is(product.getId().intValue())))
                .andExpect(jsonPath("$.data.warehouseId", is(warehouse.getId().intValue())))
                .andExpect(jsonPath("$.data.onHand", is(100)))
                .andExpect(jsonPath("$.data.reserved", is(0)))
                .andExpect(jsonPath("$.data.available", is(100)));

        // Read inventory by product
        mockMvc.perform(get("/inventory/product/" + product.getId())
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success", is(true)))
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].onHand", is(100)))
                .andExpect(jsonPath("$.data[0].available", is(100)));
    }

    @Test
    @DisplayName("Inventory: Rejects stock adjustment that results in negative stock (400 Bad Request)")
    void testNegativeStockAdjustmentRejected() throws Exception {
        Category category = categoryRepository.save(Category.builder().name("Tools").build());
        Product product = productRepository.save(Product.builder()
                .name("Wrench")
                .sku("WRENCH-01")
                .price(new BigDecimal("15.00"))
                .category(category)
                .active(true)
                .build());

        Warehouse warehouse = warehouseRepository.save(Warehouse.builder()
                .name("East Coast Depot")
                .location("Boston, MA")
                .build());

        StockAdjustmentRequest invalidAdjustment = StockAdjustmentRequest.builder()
                .productId(product.getId())
                .warehouseId(warehouse.getId())
                .adjustmentQuantity(-10) // Cannot reduce below 0
                .reason("Invalid manual deduction")
                .build();

        mockMvc.perform(post("/inventory/adjust")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalidAdjustment)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsString("cannot be negative")));
    }

    @Test
    @DisplayName("Inventory: Rejects stock adjustment below reserved quantity (400 Bad Request)")
    void testAdjustmentBelowReservedStockRejected() throws Exception {
        Category category = categoryRepository.save(Category.builder().name("Storage").build());
        Product product = productRepository.save(Product.builder()
                .name("SSD 1TB")
                .sku("SSD-1TB")
                .price(new BigDecimal("79.99"))
                .category(category)
                .active(true)
                .build());

        Warehouse warehouse = warehouseRepository.save(Warehouse.builder()
                .name("West Coast Depot")
                .location("Seattle, WA")
                .build());

        // Existing inventory: onHand = 50, reserved = 20 (available = 30)
        inventoryRepository.save(Inventory.builder()
                .product(product)
                .warehouse(warehouse)
                .onHand(50)
                .reserved(20)
                .build());

        // Attempting to adjust by -35 would leave onHand = 15, which is < reserved (20)
        StockAdjustmentRequest invalidDeduction = StockAdjustmentRequest.builder()
                .productId(product.getId())
                .warehouseId(warehouse.getId())
                .adjustmentQuantity(-35)
                .reason("Oversold stock reduction")
                .build();

        mockMvc.perform(post("/inventory/adjust")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalidDeduction)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsString("cannot be less than reserved stock")));
    }

    @Test
    @DisplayName("Inventory: CUSTOMER cannot adjust stock (403 Forbidden)")
    void testCustomerCannotAdjustStock() throws Exception {
        StockAdjustmentRequest request = StockAdjustmentRequest.builder()
                .productId(1L)
                .warehouseId(1L)
                .adjustmentQuantity(50)
                .build();

        mockMvc.perform(post("/inventory/adjust")
                        .header("Authorization", "Bearer " + customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success", is(false)))
                .andExpect(jsonPath("$.message", containsStringIgnoringCase("Access denied")));
    }
}
