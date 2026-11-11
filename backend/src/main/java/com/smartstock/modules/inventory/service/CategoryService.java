package com.smartstock.modules.inventory.service;

import com.smartstock.common.exception.DuplicateResourceException;
import com.smartstock.common.exception.ResourceNotFoundException;
import com.smartstock.modules.inventory.dto.CategoryRequest;
import com.smartstock.modules.inventory.dto.CategoryResponse;
import com.smartstock.modules.inventory.model.Category;
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
public class CategoryService {

    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;

    @Transactional
    public CategoryResponse createCategory(CategoryRequest request) {
        String trimmedName = request.getName().trim();
        if (categoryRepository.existsByName(trimmedName)) {
            throw new DuplicateResourceException("Category already exists with name: " + trimmedName);
        }

        Category category = Category.builder()
                .name(trimmedName)
                .description(request.getDescription())
                .build();

        Category savedCategory = categoryRepository.save(category);
        log.info("Created category with ID: {} and name: {}", savedCategory.getId(), savedCategory.getName());
        return mapToResponse(savedCategory);
    }

    @Transactional
    public CategoryResponse updateCategory(Long id, CategoryRequest request) {
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found with ID: " + id));

        String trimmedName = request.getName().trim();
        if (categoryRepository.existsByNameAndIdNot(trimmedName, id)) {
            throw new DuplicateResourceException("Category already exists with name: " + trimmedName);
        }

        category.setName(trimmedName);
        category.setDescription(request.getDescription());

        Category updatedCategory = categoryRepository.save(category);
        log.info("Updated category with ID: {}", updatedCategory.getId());
        return mapToResponse(updatedCategory);
    }

    @Transactional(readOnly = true)
    public CategoryResponse getCategoryById(Long id) {
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found with ID: " + id));
        return mapToResponse(category);
    }

    @Transactional(readOnly = true)
    public List<CategoryResponse> getAllCategories() {
        return categoryRepository.findAll().stream()
                .map(this::mapToResponse)
                .toList();
    }

    @Transactional
    public void deleteCategory(Long id) {
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found with ID: " + id));

        if (productRepository.existsByCategoryId(id)) {
            throw new IllegalStateException("Cannot delete category with ID: " + id + " because it contains associated products");
        }

        categoryRepository.delete(category);
        log.info("Deleted category with ID: {}", id);
    }

    private CategoryResponse mapToResponse(Category category) {
        return CategoryResponse.builder()
                .id(category.getId())
                .name(category.getName())
                .description(category.getDescription())
                .createdAt(category.getCreatedAt())
                .build();
    }
}
