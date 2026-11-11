package com.smartstock.modules.inventory.service;

import com.smartstock.common.exception.DuplicateResourceException;
import com.smartstock.common.exception.ResourceNotFoundException;
import com.smartstock.modules.inventory.dto.ProductCreateRequest;
import com.smartstock.modules.inventory.dto.ProductResponse;
import com.smartstock.modules.inventory.dto.ProductUpdateRequest;
import com.smartstock.modules.inventory.model.Category;
import com.smartstock.modules.inventory.model.Product;
import com.smartstock.modules.inventory.repository.CategoryRepository;
import com.smartstock.modules.inventory.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;

    @Transactional
    public ProductResponse createProduct(ProductCreateRequest request) {
        String trimmedSku = request.getSku().trim().toUpperCase();
        if (productRepository.existsBySku(trimmedSku)) {
            throw new DuplicateResourceException("Product with SKU '" + trimmedSku + "' already exists");
        }

        Category category = categoryRepository.findById(request.getCategoryId())
                .orElseThrow(() -> new ResourceNotFoundException("Category not found with ID: " + request.getCategoryId()));

        Product product = Product.builder()
                .name(request.getName().trim())
                .sku(trimmedSku)
                .description(request.getDescription())
                .price(request.getPrice())
                .category(category)
                .active(request.getActive() != null ? request.getActive() : true)
                .build();

        Product savedProduct = productRepository.save(product);
        log.info("Created product with ID: {}, SKU: {}", savedProduct.getId(), savedProduct.getSku());
        return mapToResponse(savedProduct);
    }

    @Transactional
    public ProductResponse updateProduct(Long id, ProductUpdateRequest request) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with ID: " + id));

        Category category = categoryRepository.findById(request.getCategoryId())
                .orElseThrow(() -> new ResourceNotFoundException("Category not found with ID: " + request.getCategoryId()));

        product.setName(request.getName().trim());
        product.setDescription(request.getDescription());
        product.setPrice(request.getPrice());
        product.setCategory(category);
        if (request.getActive() != null) {
            product.setActive(request.getActive());
        }

        Product updatedProduct = productRepository.save(product);
        log.info("Updated product with ID: {}", updatedProduct.getId());
        return mapToResponse(updatedProduct);
    }

    @Transactional(readOnly = true)
    public ProductResponse getProductById(Long id, boolean isAdmin) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with ID: " + id));

        if (!isAdmin && !Boolean.TRUE.equals(product.getActive())) {
            throw new ResourceNotFoundException("Product not found with ID: " + id);
        }

        return mapToResponse(product);
    }

    @Transactional(readOnly = true)
    public List<ProductResponse> getAllProducts(Boolean activeOnly, boolean isAdmin) {
        List<Product> products;
        if (!isAdmin || Boolean.TRUE.equals(activeOnly)) {
            products = productRepository.findByActiveTrue();
        } else {
            products = productRepository.findAll();
        }

        return products.stream()
                .map(this::mapToResponse)
                .toList();
    }

    @Transactional
    public ProductResponse deactivateProduct(Long id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with ID: " + id));

        product.setActive(false);
        Product updatedProduct = productRepository.save(product);
        log.info("Deactivated product with ID: {}", id);
        return mapToResponse(updatedProduct);
    }

    private ProductResponse mapToResponse(Product product) {
        return ProductResponse.builder()
                .id(product.getId())
                .name(product.getName())
                .sku(product.getSku())
                .description(product.getDescription())
                .price(product.getPrice())
                .categoryId(product.getCategory() != null ? product.getCategory().getId() : null)
                .categoryName(product.getCategory() != null ? product.getCategory().getName() : null)
                .active(product.getActive())
                .createdAt(product.getCreatedAt())
                .updatedAt(product.getUpdatedAt())
                .build();
    }
}
