-- =============================================================================
-- V2__add_cancelled_by_role_to_orders.sql
-- Add cancelled_by_role column to orders table for cancellation attribution
-- =============================================================================

ALTER TABLE orders ADD COLUMN cancelled_by_role VARCHAR(20) NULL;
