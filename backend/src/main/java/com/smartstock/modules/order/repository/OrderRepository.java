package com.smartstock.modules.order.repository;

import com.smartstock.modules.order.model.Order;
import com.smartstock.modules.order.model.OrderStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {

    List<Order> findByUserId(Long userId);

    List<Order> findByStatus(OrderStatus status);

    List<Order> findByWarehouseId(Long warehouseId);
}
