import React from 'react';

export default function Inventory() {
  return (
    <div className="page-content">
      <header className="page-header">
        <h1>Inventory Management</h1>
        <p>Monitor stock availability, low-stock thresholds, and warehouse locations.</p>
      </header>

      <div className="card">
        <div className="card-header-actions">
          <h3>Product Catalog & Stock Levels</h3>
          <button className="btn-primary" disabled>+ Add Product</button>
        </div>
        <div className="table-placeholder">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Unit Price</th>
                <th>Available Stock</th>
                <th>Reserved Stock</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="7" className="empty-state">
                  Initial scaffold: Inventory module ready for API integration.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
