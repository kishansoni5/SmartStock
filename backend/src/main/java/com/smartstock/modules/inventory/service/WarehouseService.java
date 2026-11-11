package com.smartstock.modules.inventory.service;

import com.smartstock.common.exception.DuplicateResourceException;
import com.smartstock.common.exception.ResourceNotFoundException;
import com.smartstock.modules.inventory.dto.WarehouseRequest;
import com.smartstock.modules.inventory.dto.WarehouseResponse;
import com.smartstock.modules.inventory.model.Warehouse;
import com.smartstock.modules.inventory.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class WarehouseService {

    private final WarehouseRepository warehouseRepository;

    @Transactional
    public WarehouseResponse createWarehouse(WarehouseRequest request) {
        String trimmedName = request.getName().trim();
        if (warehouseRepository.existsByName(trimmedName)) {
            throw new DuplicateResourceException("Warehouse already exists with name: " + trimmedName);
        }

        Warehouse warehouse = Warehouse.builder()
                .name(trimmedName)
                .location(request.getLocation().trim())
                .build();

        Warehouse savedWarehouse = warehouseRepository.save(warehouse);
        log.info("Created warehouse with ID: {}, name: {}", savedWarehouse.getId(), savedWarehouse.getName());
        return mapToResponse(savedWarehouse);
    }

    @Transactional
    public WarehouseResponse updateWarehouse(Long id, WarehouseRequest request) {
        Warehouse warehouse = warehouseRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Warehouse not found with ID: " + id));

        String trimmedName = request.getName().trim();
        if (warehouseRepository.existsByNameAndIdNot(trimmedName, id)) {
            throw new DuplicateResourceException("Warehouse already exists with name: " + trimmedName);
        }

        warehouse.setName(trimmedName);
        warehouse.setLocation(request.getLocation().trim());

        Warehouse updatedWarehouse = warehouseRepository.save(warehouse);
        log.info("Updated warehouse with ID: {}", updatedWarehouse.getId());
        return mapToResponse(updatedWarehouse);
    }

    @Transactional(readOnly = true)
    public WarehouseResponse getWarehouseById(Long id) {
        Warehouse warehouse = warehouseRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Warehouse not found with ID: " + id));
        return mapToResponse(warehouse);
    }

    @Transactional(readOnly = true)
    public List<WarehouseResponse> getAllWarehouses() {
        return warehouseRepository.findAll().stream()
                .map(this::mapToResponse)
                .toList();
    }

    private WarehouseResponse mapToResponse(Warehouse warehouse) {
        return WarehouseResponse.builder()
                .id(warehouse.getId())
                .name(warehouse.getName())
                .location(warehouse.getLocation())
                .createdAt(warehouse.getCreatedAt())
                .build();
    }
}
