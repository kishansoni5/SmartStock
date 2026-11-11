package com.smartstock.modules.order.event;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.smartstock.common.event.DomainEvent;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class OrderCreatedEvent implements DomainEvent {

    private String eventId;
    private Long orderId;
    private Long customerId;
    private BigDecimal totalAmount;
    private List<OrderItemPayload> items;
    private Instant createdAt;
    private Instant occurredAt;

    @Override
    public String getEventType() {
        return "OrderCreated";
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OrderItemPayload {
        private Long productId;
        private Integer quantity;
        private BigDecimal unitPrice;
    }
}
