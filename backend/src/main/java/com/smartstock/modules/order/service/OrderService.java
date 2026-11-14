package com.smartstock.modules.order.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartstock.common.event.model.OutboxEvent;
import com.smartstock.common.event.model.OutboxStatus;
import com.smartstock.common.event.repository.OutboxEventRepository;
import com.smartstock.common.exception.ResourceNotFoundException;
import com.smartstock.modules.auth.model.AppUser;
import com.smartstock.modules.auth.model.UserRole;
import com.smartstock.modules.auth.repository.AppUserRepository;
import com.smartstock.modules.inventory.model.Product;
import com.smartstock.modules.inventory.model.Warehouse;
import com.smartstock.modules.inventory.repository.InventoryRepository;
import com.smartstock.modules.inventory.repository.ProductRepository;
import com.smartstock.modules.order.dto.CreateOrderItemRequest;
import com.smartstock.modules.order.dto.CreateOrderRequest;
import com.smartstock.modules.order.dto.OrderItemResponse;
import com.smartstock.modules.order.dto.OrderResponse;
import com.smartstock.modules.order.event.OrderCreatedEvent;
import com.smartstock.modules.order.model.Order;
import com.smartstock.modules.order.model.OrderItem;
import com.smartstock.modules.order.model.OrderStatus;
import com.smartstock.modules.order.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final InventoryRepository inventoryRepository;
    private final AppUserRepository userRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public OrderResponse createOrder(CreateOrderRequest request, String customerEmail) {
        AppUser customer = userRepository.findByEmail(customerEmail)
                .orElseThrow(() -> new ResourceNotFoundException("Customer not found with email: " + customerEmail));

        if (request.getItems() == null || request.getItems().isEmpty()) {
            throw new IllegalArgumentException("Order must contain at least one item");
        }

        // Validate uniqueness of products within the single order request
        Set<Long> seenProductIds = new HashSet<>();
        for (CreateOrderItemRequest itemRequest : request.getItems()) {
            if (!seenProductIds.add(itemRequest.getProductId())) {
                throw new IllegalArgumentException("Duplicate product ID found in order items: " + itemRequest.getProductId());
            }
        }

        Order order = Order.builder()
                .user(customer)
                .status(OrderStatus.PENDING)
                .warehouse(null) // Warehouse will be assigned asynchronously by EDA consumer
                .totalAmount(BigDecimal.ZERO)
                .build();

        BigDecimal runningTotal = BigDecimal.ZERO;

        for (CreateOrderItemRequest itemRequest : request.getItems()) {
            if (itemRequest.getQuantity() == null || itemRequest.getQuantity() <= 0) {
                throw new IllegalArgumentException("Quantity must be at least 1 for product ID: " + itemRequest.getProductId());
            }

            Product product = productRepository.findById(itemRequest.getProductId())
                    .orElseThrow(() -> new ResourceNotFoundException("Product not found with ID: " + itemRequest.getProductId()));

            if (!Boolean.TRUE.equals(product.getActive())) {
                throw new IllegalStateException("Product '" + product.getName() + "' (SKU: " + product.getSku() + ") is inactive and cannot be ordered");
            }

            BigDecimal unitPrice = product.getPrice();
            BigDecimal subtotal = unitPrice.multiply(BigDecimal.valueOf(itemRequest.getQuantity()));
            runningTotal = runningTotal.add(subtotal);

            OrderItem orderItem = OrderItem.builder()
                    .product(product)
                    .quantity(itemRequest.getQuantity())
                    .unitPrice(unitPrice)
                    .build();

            order.addItem(orderItem);
        }

        order.setTotalAmount(runningTotal);

        // 1. Save Order and cascading OrderItems within the current transaction
        Order savedOrder = orderRepository.save(order);
        log.info("Persisted order ID: {} for customer: {} with total: {}",
                savedOrder.getId(), customer.getEmail(), savedOrder.getTotalAmount());

        // 2. Build OrderCreated event payload
        String eventId = UUID.randomUUID().toString();
        Instant now = Instant.now();

        List<OrderCreatedEvent.OrderItemPayload> eventItems = savedOrder.getItems().stream()
                .map(i -> OrderCreatedEvent.OrderItemPayload.builder()
                        .productId(i.getProduct().getId())
                        .quantity(i.getQuantity())
                        .unitPrice(i.getUnitPrice())
                        .build())
                .toList();

        OrderCreatedEvent event = OrderCreatedEvent.builder()
                .eventId(eventId)
                .orderId(savedOrder.getId())
                .customerId(customer.getId())
                .totalAmount(savedOrder.getTotalAmount())
                .items(eventItems)
                .createdAt(now)
                .occurredAt(now)
                .build();

        String payloadJson;
        try {
            payloadJson = objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize OrderCreatedEvent to JSON", e);
            throw new IllegalStateException("Failed to serialize order event payload", e);
        }

        // 3. Persist OutboxEvent in the SAME database transaction
        OutboxEvent outboxEvent = OutboxEvent.builder()
                .eventId(eventId)
                .aggregateId(savedOrder.getId().toString())
                .eventType("OrderCreated")
                .payload(payloadJson)
                .status(OutboxStatus.PENDING)
                .build();

        outboxEventRepository.save(outboxEvent);
        log.info("Persisted outbox event ID: {} for order ID: {}", eventId, savedOrder.getId());

        return mapToResponse(savedOrder);
    }

    @Transactional(readOnly = true)
    public List<OrderResponse> getMyOrders(String customerEmail) {
        AppUser customer = userRepository.findByEmail(customerEmail)
                .orElseThrow(() -> new ResourceNotFoundException("Customer not found with email: " + customerEmail));

        return orderRepository.findByUserIdWithDetails(customer.getId()).stream()
                .map(this::mapToResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public OrderResponse getOrderById(Long orderId, String userEmail, boolean isAdmin) {
        Order order = orderRepository.findByIdWithDetails(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with ID: " + orderId));

        if (!isAdmin && !order.getUser().getEmail().equalsIgnoreCase(userEmail)) {
            throw new AccessDeniedException("Access denied: You do not have permission to view this order");
        }

        return mapToResponse(order);
    }

    @Transactional(readOnly = true)
    public List<OrderResponse> getAllOrders() {
        return orderRepository.findAllWithDetails().stream()
                .map(this::mapToResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public Page<OrderResponse> getAllOrdersPaged(OrderStatus status, Pageable pageable) {
        Page<Order> orders;
        if (status != null) {
            orders = orderRepository.findByStatus(status, pageable);
        } else {
            orders = orderRepository.findAll(pageable);
        }
        return orders.map(this::mapToResponse);
    }

    @Transactional
    public OrderResponse cancelOrder(Long orderId, String userEmail, boolean isAdmin) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with ID: " + orderId));

        if (!isAdmin && !order.getUser().getEmail().equalsIgnoreCase(userEmail)) {
            throw new AccessDeniedException("Access denied: You do not have permission to cancel this order");
        }

        if (order.getStatus() == OrderStatus.CANCELLED) {
            throw new IllegalStateException("Order ID " + orderId + " is already CANCELLED");
        }

        if (order.getStatus() == OrderStatus.REJECTED) {
            throw new IllegalStateException("Cannot cancel order ID " + orderId + " because it is already REJECTED");
        }

        if (order.getStatus() == OrderStatus.CONFIRMED) {
            Warehouse warehouse = order.getWarehouse();
            if (warehouse != null) {
                for (OrderItem item : order.getItems()) {
                    int released = inventoryRepository.releaseStock(
                            item.getProduct().getId(),
                            warehouse.getId(),
                            item.getQuantity()
                    );
                    if (released != 1) {
                        throw new IllegalStateException(String.format(
                                "Critical stock compensation failure: failed to release reserved stock for product ID %d at warehouse ID %d during cancellation",
                                item.getProduct().getId(), warehouse.getId()));
                    }
                    log.info("Released {} unit(s) of product ID {} at warehouse ID {} for cancelled order ID {}",
                            item.getQuantity(), item.getProduct().getId(), warehouse.getId(), orderId);
                }
            }
        }

        order.setStatus(OrderStatus.CANCELLED);
        order.setCancelledByRole(isAdmin ? UserRole.ADMIN : UserRole.CUSTOMER);
        order = orderRepository.saveAndFlush(order);
        log.info("Order ID {} successfully CANCELLED by user '{}' (role: {})", orderId, userEmail, order.getCancelledByRole());

        return mapToResponse(order);
    }

    private OrderResponse mapToResponse(Order order) {
        List<OrderItemResponse> itemResponses = order.getItems().stream()
                .map(item -> OrderItemResponse.builder()
                        .id(item.getId())
                        .productId(item.getProduct() != null ? item.getProduct().getId() : null)
                        .productName(item.getProduct() != null ? item.getProduct().getName() : null)
                        .productSku(item.getProduct() != null ? item.getProduct().getSku() : null)
                        .quantity(item.getQuantity())
                        .unitPrice(item.getUnitPrice())
                        .subtotal(item.getSubtotal())
                        .build())
                .toList();

        return OrderResponse.builder()
                .id(order.getId())
                .userId(order.getUser() != null ? order.getUser().getId() : null)
                .customerName(order.getUser() != null ? order.getUser().getName() : null)
                .customerEmail(order.getUser() != null ? order.getUser().getEmail() : null)
                .status(order.getStatus())
                .cancelledByRole(order.getCancelledByRole())
                .totalAmount(order.getTotalAmount())
                .warehouseId(order.getWarehouse() != null ? order.getWarehouse().getId() : null)
                .warehouseName(order.getWarehouse() != null ? order.getWarehouse().getName() : null)
                .items(itemResponses)
                .createdAt(order.getCreatedAt())
                .updatedAt(order.getUpdatedAt())
                .build();
    }
}
