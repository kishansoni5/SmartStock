import React from 'react';

export default function Orders() {
  return (
    <div className="page-content">
      <header className="page-header">
        <h1>Order Processing</h1>
        <p>Track customer orders and inspect event-driven Kafka processing lifecycle.</p>
      </header>

      <div className="card">
        <div className="card-header-actions">
          <h3>Orders Stream</h3>
          <button className="btn-primary" disabled>+ Create Test Order</button>
        </div>
        <div className="table-placeholder">
          <table>
            <thead>
              <tr>
                <th>Order Number</th>
                <th>Customer ID</th>
                <th>Total Amount</th>
                <th>Items Count</th>
                <th>Status</th>
                <th>Event Status</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="7" className="empty-state">
                  Initial scaffold: Order event pipelines will be displayed here.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
