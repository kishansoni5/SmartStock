import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AdminInventory from './admin/AdminInventory';

/**
 * Standard Inventory route wrapper:
 * - ADMIN users access the complete inventory & stock adjustments console.
 * - Non-admin users are guided to the public product catalog.
 */
export default function Inventory() {
  const { isAdmin } = useAuth();

  if (isAdmin) {
    return <AdminInventory />;
  }

  return <Navigate to="/products" replace />;
}
