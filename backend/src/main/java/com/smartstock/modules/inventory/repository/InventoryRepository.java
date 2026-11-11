package com.smartstock.modules.inventory.repository;

import com.smartstock.modules.inventory.model.Inventory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface InventoryRepository extends JpaRepository<Inventory, Long> {

    Optional<Inventory> findByProductIdAndWarehouseId(Long productId, Long warehouseId);

    boolean existsByProductIdAndWarehouseId(Long productId, Long warehouseId);

    List<Inventory> findByProductId(Long productId);

    List<Inventory> findByWarehouseId(Long warehouseId);

    boolean existsByWarehouseId(Long warehouseId);

    @Modifying(clearAutomatically = true)
    @Query("""
        UPDATE Inventory i
        SET i.reserved = i.reserved + :quantity,
            i.version = i.version + 1,
            i.updatedAt = CURRENT_TIMESTAMP
        WHERE i.product.id = :productId
          AND i.warehouse.id = :warehouseId
          AND (i.onHand - i.reserved) >= :quantity
    """)
    int reserveStock(@Param("productId") Long productId,
                     @Param("warehouseId") Long warehouseId,
                     @Param("quantity") int quantity);

    @Modifying(clearAutomatically = true)
    @Query("""
        UPDATE Inventory i
        SET i.reserved = i.reserved - :quantity,
            i.version = i.version + 1,
            i.updatedAt = CURRENT_TIMESTAMP
        WHERE i.product.id = :productId
          AND i.warehouse.id = :warehouseId
          AND i.reserved >= :quantity
    """)
    int releaseStock(@Param("productId") Long productId,
                     @Param("warehouseId") Long warehouseId,
                     @Param("quantity") int quantity);
}

