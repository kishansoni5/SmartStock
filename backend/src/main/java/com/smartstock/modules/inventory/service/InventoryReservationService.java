package com.smartstock.modules.inventory.service;

import com.smartstock.common.event.model.ProcessedEvent;
import com.smartstock.common.event.repository.ProcessedEventRepository;
import com.smartstock.common.exception.ResourceNotFoundException;
import com.smartstock.modules.inventory.model.Inventory;
import com.smartstock.modules.inventory.model.Warehouse;
import com.smartstock.modules.inventory.repository.InventoryRepository;
import com.smartstock.modules.inventory.repository.WarehouseRepository;
import com.smartstock.modules.order.event.OrderCreatedEvent;
import com.smartstock.modules.order.model.Order;
import com.smartstock.modules.order.model.OrderStatus;
import com.smartstock.modules.order.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Service orchestrating concurrency-safe inventory reservation and warehouse fulfillment
 * for OrderCreated events.
 *
 * <p>Enforces all-or-nothing reservations, idempotent event tracking, and warehouse fallback
 * (Surat preferred, Mumbai fallback) within a single ACID database transaction.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InventoryReservationService {

    public enum ReservationOutcome {
        CONFIRMED,
        REJECTED,
        SKIPPED_DUPLICATE
    }

    private final OrderRepository orderRepository;
    private final WarehouseRepository warehouseRepository;
    private final InventoryRepository inventoryRepository;
    private final ProcessedEventRepository processedEventRepository;

    /**
     * Processes an incoming OrderCreated event within a strict database transaction.
     *
     * @param event the domain event payload from Kafka
     * @return outcome of the reservation attempt
     */
    @Transactional
    public ReservationOutcome processOrderCreated(OrderCreatedEvent event) {
        if (event == null || event.getEventId() == null || event.getOrderId() == null) {
            log.warn("Skipping null or invalid OrderCreatedEvent: {}", event);
            return ReservationOutcome.SKIPPED_DUPLICATE;
        }

        String eventId = event.getEventId();
        Long orderId = event.getOrderId();

        // 1. Idempotency Check: Skip safely if eventId was already processed
        if (processedEventRepository.existsByEventId(eventId)) {
            log.info("Event ID '{}' has already been processed. Skipping duplicate.", eventId);
            return ReservationOutcome.SKIPPED_DUPLICATE;
        }

        // 2. Fetch Order with pessimistic lock to safely serialize against concurrent cancellation requests
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with ID: " + orderId));

        if (order.getStatus() != OrderStatus.PENDING) {
            log.info("Order ID {} is already in status '{}'. Recording event '{}' and skipping.",
                    orderId, order.getStatus(), eventId);
            recordProcessedEvent(event);
            return ReservationOutcome.SKIPPED_DUPLICATE;
        }

        List<OrderCreatedEvent.OrderItemPayload> items = event.getItems();
        if (items == null || items.isEmpty()) {
            log.warn("Order ID {} contains no items. Marking order as REJECTED.", orderId);
            order.setStatus(OrderStatus.REJECTED);
            order.setWarehouse(null);
            order = orderRepository.saveAndFlush(order);
            recordProcessedEvent(event);
            return ReservationOutcome.REJECTED;
        }

        // 3. Locate eligible warehouses in priority order: Surat preferred, Mumbai fallback
        List<Warehouse> candidateWarehouses = getCandidateWarehousesInPriorityOrder();
        Warehouse fulfilledWarehouse = null;

        for (Warehouse warehouse : candidateWarehouses) {
            log.debug("Evaluating warehouse '{}' (ID: {}) for order ID {}",
                    warehouse.getName(), warehouse.getId(), orderId);

            boolean success = tryReserveAllItemsInWarehouse(warehouse, items, orderId);
            if (success) {
                fulfilledWarehouse = warehouse;
                log.info("Order ID {} successfully reserved at warehouse '{}' (ID: {})",
                        orderId, warehouse.getName(), warehouse.getId());
                break;
            } else {
                log.info("Warehouse '{}' (ID: {}) cannot fulfill complete order ID {}. Trying next candidate.",
                        warehouse.getName(), warehouse.getId(), orderId);
            }
        }

        // 4. Update Order Status and Record ProcessedEvent
        if (fulfilledWarehouse != null) {
            order.setStatus(OrderStatus.CONFIRMED);
            order.setWarehouse(fulfilledWarehouse);
            order = orderRepository.saveAndFlush(order);
            log.info("Order ID {} CONFIRMED and assigned to warehouse '{}' (ID: {})",
                    orderId, fulfilledWarehouse.getName(), fulfilledWarehouse.getId());
            recordProcessedEvent(event);
            return ReservationOutcome.CONFIRMED;
        } else {
            order.setStatus(OrderStatus.REJECTED);
            order.setWarehouse(null);
            order = orderRepository.saveAndFlush(order);
            log.info("Order ID {} REJECTED. No single warehouse has sufficient inventory to fulfill the entire order.",
                    orderId);
            recordProcessedEvent(event);
            return ReservationOutcome.REJECTED;
        }
    }

    /**
     * Attempts to atomically reserve every order item in the specified warehouse.
     * If any single item reservation fails, all earlier item reservations in this warehouse
     * are immediately rolled back/released.
     *
     * @return true if ALL items were reserved; false if any item failed
     */
    private boolean tryReserveAllItemsInWarehouse(Warehouse warehouse,
                                                  List<OrderCreatedEvent.OrderItemPayload> items,
                                                  Long orderId) {
        Long warehouseId = warehouse.getId();

        // Pre-check available stock for all items
        for (OrderCreatedEvent.OrderItemPayload item : items) {
            Optional<Inventory> invOpt = inventoryRepository.findByProductIdAndWarehouseId(
                    item.getProductId(), warehouseId);

            if (invOpt.isEmpty() || invOpt.get().getAvailable() < item.getQuantity()) {
                log.debug("Pre-check failed for product ID {} at warehouse {} (available: {}, needed: {})",
                        item.getProductId(), warehouseId,
                        invOpt.map(Inventory::getAvailable).orElse(0), item.getQuantity());
                return false;
            }
        }

        // Concurrency-safe atomic conditional database update
        List<OrderCreatedEvent.OrderItemPayload> reservedItems = new ArrayList<>();
        boolean allSucceeded = true;

        for (OrderCreatedEvent.OrderItemPayload item : items) {
            int rowsUpdated = inventoryRepository.reserveStock(
                    item.getProductId(), warehouseId, item.getQuantity());

            if (rowsUpdated == 1) {
                reservedItems.add(item);
            } else {
                // Stock was claimed by a concurrent order between pre-check and reservation update
                log.warn("Atomic reservation failed for product ID {} at warehouse {} (requested qty: {}). Row count: 0",
                        item.getProductId(), warehouseId, item.getQuantity());
                allSucceeded = false;
                break;
            }
        }

        if (!allSucceeded) {
            // All-or-nothing guarantee: release all items that were reserved during this attempt
            for (OrderCreatedEvent.OrderItemPayload item : reservedItems) {
                int released = inventoryRepository.releaseStock(item.getProductId(), warehouseId, item.getQuantity());
                if (released != 1) {
                    throw new IllegalStateException(String.format(
                            "Critical stock compensation failure: failed to release reserved stock for product ID %d at warehouse ID %d (qty: %d). Expected 1 row updated, got %d. Rolling back transaction.",
                            item.getProductId(), warehouseId, item.getQuantity(), released));
                }
                log.debug("Released reservation for product ID {} at warehouse {} (qty: {}) during rollback",
                        item.getProductId(), warehouseId, item.getQuantity());
            }
            return false;
        }

        return true;
    }

    private List<Warehouse> getCandidateWarehousesInPriorityOrder() {
        List<Warehouse> candidates = new ArrayList<>();

        // Priority 1: Surat Warehouse (prefer Surat)
        findWarehouse("Surat Warehouse", "Surat").ifPresent(candidates::add);

        // Priority 2: Mumbai Warehouse (fallback to Mumbai)
        findWarehouse("Mumbai Warehouse", "Mumbai").ifPresent(candidates::add);

        return candidates;
    }

    private Optional<Warehouse> findWarehouse(String name, String location) {
        return warehouseRepository.findByName(name)
                .or(() -> warehouseRepository.findByLocation(location));
    }

    private void recordProcessedEvent(OrderCreatedEvent event) {
        ProcessedEvent processedEvent = ProcessedEvent.builder()
                .eventId(event.getEventId())
                .eventType(event.getEventType() != null ? event.getEventType() : "OrderCreated")
                .build();
        // saveAndFlush ensures the unique constraint on event_id is enforced immediately in this transaction
        processedEventRepository.saveAndFlush(processedEvent);
    }

    /**
     * Checks if an event has already been recorded in processed_events using a fresh read-only transaction.
     * Used by the Kafka consumer after a failed transaction rollback to confirm whether a DataIntegrityViolationException
     * was due to a concurrent duplicate event or an unrelated database constraint violation.
     */
    @Transactional(readOnly = true)
    public boolean isEventProcessed(String eventId) {
        if (eventId == null || eventId.isBlank()) {
            return false;
        }
        return processedEventRepository.existsByEventId(eventId);
    }
}
