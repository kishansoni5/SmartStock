package com.smartstock.modules.inventory.service;

import com.smartstock.common.exception.InvalidStockOperationException;
import com.smartstock.common.exception.ResourceNotFoundException;
import com.smartstock.modules.inventory.dto.InventoryResponse;
import com.smartstock.modules.inventory.dto.StockAdjustmentRequest;
import com.smartstock.modules.inventory.model.Inventory;
import com.smartstock.modules.inventory.model.Product;
import com.smartstock.modules.inventory.model.Warehouse;
import com.smartstock.modules.inventory.repository.InventoryRepository;
import com.smartstock.modules.inventory.repository.ProductRepository;
import com.smartstock.modules.inventory.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class InventoryService {

    private final InventoryRepository inventoryRepository;
    private final ProductRepository productRepository;
    private final WarehouseRepository warehouseRepository;

    @Transactional(readOnly = true)
    public List<InventoryResponse> getAllInventory() {
        return inventoryRepository.findAll().stream()
                .map(this::mapToResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<InventoryResponse> getInventoryByProduct(Long productId) {
        if (!productRepository.existsById(productId)) {
            throw new ResourceNotFoundException("Product not found with ID: " + productId);
        }

        return inventoryRepository.findByProductId(productId).stream()
                .map(this::mapToResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<InventoryResponse> getInventoryByWarehouse(Long warehouseId) {
        if (!warehouseRepository.existsById(warehouseId)) {
            throw new ResourceNotFoundException("Warehouse not found with ID: " + warehouseId);
        }

        return inventoryRepository.findByWarehouseId(warehouseId).stream()
                .map(this::mapToResponse)
                .toList();
    }

    @Transactional
    public InventoryResponse adjustStock(StockAdjustmentRequest request) {
        Product product = productRepository.findById(request.getProductId())
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with ID: " + request.getProductId()));

        Warehouse warehouse = warehouseRepository.findById(request.getWarehouseId())
                .orElseThrow(() -> new ResourceNotFoundException("Warehouse not found with ID: " + request.getWarehouseId()));

        Inventory inventory = inventoryRepository.findByProductIdAndWarehouseId(product.getId(), warehouse.getId())
                .orElseGet(() -> Inventory.builder()
                        .product(product)
                        .warehouse(warehouse)
                        .onHand(0)
                        .reserved(0)
                        .build());

        int currentOnHand = inventory.getOnHand() != null ? inventory.getOnHand() : 0;
        int currentReserved = inventory.getReserved() != null ? inventory.getReserved() : 0;
        int delta = request.getAdjustmentQuantity();
        int newOnHand = currentOnHand + delta;

        if (newOnHand < 0) {
            throw new InvalidStockOperationException(
                    "Invalid stock adjustment: Resulting on-hand stock (" + newOnHand + ") cannot be negative."
            );
        }

        if (newOnHand < currentReserved) {
            throw new InvalidStockOperationException(
                    "Invalid stock adjustment: Resulting on-hand stock (" + newOnHand + 
                    ") cannot be less than reserved stock (" + currentReserved + ")."
            );
        }

        inventory.setOnHand(newOnHand);
        Inventory savedInventory = inventoryRepository.save(inventory);

        log.info("Stock adjusted for Product ID: {} at Warehouse ID: {}. Delta: {}, New onHand: {}, Reserved: {}, Available: {}. Reason: {}",
                product.getId(), warehouse.getId(), delta, savedInventory.getOnHand(), savedInventory.getReserved(),
                savedInventory.getAvailable(), request.getReason());

        return mapToResponse(savedInventory);
    }

    private InventoryResponse mapToResponse(Inventory inventory) {
        return InventoryResponse.builder()
                .id(inventory.getId())
                .productId(inventory.getProduct() != null ? inventory.getProduct().getId() : null)
                .productName(inventory.getProduct() != null ? inventory.getProduct().getName() : null)
                .productSku(inventory.getProduct() != null ? inventory.getProduct().getSku() : null)
                .warehouseId(inventory.getWarehouse() != null ? inventory.getWarehouse().getId() : null)
                .warehouseName(inventory.getWarehouse() != null ? inventory.getWarehouse().getName() : null)
                .onHand(inventory.getOnHand())
                .reserved(inventory.getReserved())
                .available(inventory.getAvailable())
                .updatedAt(inventory.getUpdatedAt())
                .build();
    }
}
