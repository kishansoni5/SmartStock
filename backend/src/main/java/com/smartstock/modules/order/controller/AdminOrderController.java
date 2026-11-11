package com.smartstock.modules.order.controller;

import com.smartstock.common.response.ApiResponse;
import com.smartstock.modules.order.dto.OrderResponse;
import com.smartstock.modules.order.model.OrderStatus;
import com.smartstock.modules.order.service.OrderService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping({"/api/v1/admin/orders", "/admin/orders"})
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class AdminOrderController {

    private final OrderService orderService;

    @GetMapping
    public ResponseEntity<ApiResponse<Page<OrderResponse>>> getAllOrders(
            @RequestParam(required = false) OrderStatus status,
            @PageableDefault(size = 10, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        Page<OrderResponse> page = orderService.getAllOrdersPaged(status, pageable);
        return ResponseEntity.ok(ApiResponse.ok(page, "Orders retrieved successfully"));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<OrderResponse>> getOrderById(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails) {
        OrderResponse response = orderService.getOrderById(id, userDetails.getUsername(), true);
        return ResponseEntity.ok(ApiResponse.ok(response, "Order details retrieved successfully"));
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<ApiResponse<OrderResponse>> cancelOrder(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails userDetails) {
        OrderResponse response = orderService.cancelOrder(id, userDetails.getUsername(), true);
        return ResponseEntity.ok(ApiResponse.ok(response, "Order cancelled successfully by administrator"));
    }
}
