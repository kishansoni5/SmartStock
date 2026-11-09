import React from 'react';

export default function Dashboard() {
  return (
    <div className="page-content">
      <header className="page-header">
        <h1>Operations Dashboard</h1>
        <p>Real-time overview of inventory levels and order event pipelines.</p>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Total SKUs</span>
          <span className="stat-value">--</span>
          <span className="stat-badge">Catalog</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Stock Units</span>
          <span className="stat-value">--</span>
          <span className="stat-badge">Warehouse</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Pending Orders</span>
          <span className="stat-value">--</span>
          <span className="stat-badge warning">In Queue</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Kafka Events</span>
          <span className="stat-value">Active</span>
          <span className="stat-badge success">Connected</span>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h3>Architecture Highlights</h3>
          <ul className="feature-list">
            <li><strong>Modular Monolith:</strong> Isolated modules for Auth, Inventory, Order, and Notification.</li>
            <li><strong>Event-Driven Flow:</strong> Asynchronous order processing decoupled via Apache Kafka.</li>
            <li><strong>Security:</strong> Stateless JWT authentication with Spring Security 6.</li>
          </ul>
        </div>
        <div className="card">
          <h3>Quick Actions</h3>
          <p className="placeholder-text">
            Business logic modules will be populated here. Ready to connect to backend REST endpoints.
          </p>
        </div>
      </div>
    </div>
  );
}
