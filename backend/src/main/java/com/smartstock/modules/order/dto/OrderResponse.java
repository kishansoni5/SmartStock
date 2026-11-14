package com.smartstock.modules.order.dto;

import com.smartstock.modules.auth.model.UserRole;
import com.smartstock.modules.order.model.OrderStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderResponse {

    private Long id;
    private Long userId;
    private String customerName;
    private String customerEmail;
    private OrderStatus status;
    private UserRole cancelledByRole;
    private BigDecimal totalAmount;
    private Long warehouseId;
    private String warehouseName;
    private List<OrderItemResponse> items;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
