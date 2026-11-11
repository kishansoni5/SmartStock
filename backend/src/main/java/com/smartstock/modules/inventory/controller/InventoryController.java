package com.smartstock.modules.inventory.controller;

import com.smartstock.common.response.ApiResponse;
import com.smartstock.modules.inventory.dto.InventoryResponse;
import com.smartstock.modules.inventory.dto.StockAdjustmentRequest;
import com.smartstock.modules.inventory.service.InventoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping({"/api/v1/inventory", "/inventory"})
@RequiredArgsConstructor
public class InventoryController {

    private final InventoryService inventoryService;

    @GetMapping
    @PreAuthorize("hasAnyRole('CUSTOMER', 'ADMIN')")
    public ResponseEntity<ApiResponse<List<InventoryResponse>>> getAllInventory() {
        List<InventoryResponse> inventoryList = inventoryService.getAllInventory();
        return ResponseEntity.ok(ApiResponse.ok(inventoryList, "Inventory records retrieved successfully"));
    }

    @GetMapping("/product/{productId}")
    @PreAuthorize("hasAnyRole('CUSTOMER', 'ADMIN')")
    public ResponseEntity<ApiResponse<List<InventoryResponse>>> getInventoryByProduct(@PathVariable Long productId) {
        List<InventoryResponse> inventoryList = inventoryService.getInventoryByProduct(productId);
        return ResponseEntity.ok(ApiResponse.ok(inventoryList, "Product inventory retrieved successfully"));
    }

    @GetMapping("/warehouse/{warehouseId}")
    @PreAuthorize("hasAnyRole('CUSTOMER', 'ADMIN')")
    public ResponseEntity<ApiResponse<List<InventoryResponse>>> getInventoryByWarehouse(@PathVariable Long warehouseId) {
        List<InventoryResponse> inventoryList = inventoryService.getInventoryByWarehouse(warehouseId);
        return ResponseEntity.ok(ApiResponse.ok(inventoryList, "Warehouse inventory retrieved successfully"));
    }

    @PostMapping("/adjust")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<InventoryResponse>> adjustStock(
            @Valid @RequestBody StockAdjustmentRequest request) {
        InventoryResponse response = inventoryService.adjustStock(request);
        return ResponseEntity.ok(ApiResponse.ok(response, "Stock adjusted successfully"));
    }
}
