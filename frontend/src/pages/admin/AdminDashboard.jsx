import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getAdminDashboardData } from '../../api/dashboardService';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const dashboardData = await getAdminDashboardData();
      setData(dashboardData);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load admin dashboard:', err);
      setError(
        err?.message ||
          'Failed to retrieve dashboard statistics from backend. Please verify your connection.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Helper for order status badge
  const getOrderStatusBadge = (status) => {
    switch (status) {
      case 'CONFIRMED':
        return <Badge variant="success">CONFIRMED</Badge>;
      case 'PENDING':
        return <Badge variant="warning">PENDING</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">REJECTED</Badge>;
      case 'CANCELLED':
        return <Badge variant="neutral">CANCELLED</Badge>;
      default:
        return <Badge variant="neutral">{status || 'UNKNOWN'}</Badge>;
    }
  };

  // Helper for inventory status badge
  const getInventoryStatusBadge = (available) => {
    if (available <= 0) {
      return <Badge variant="danger">OUT OF STOCK</Badge>;
    }
    if (available <= 5) {
      return <Badge variant="warning">LOW STOCK</Badge>;
    }
    return <Badge variant="success">IN STOCK</Badge>;
  };

  // =========================================================================
  // VIEW: Loading State
  // =========================================================================
  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto py-12 text-center">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-slate-800">
            Connecting to SmartStock Backend...
          </h3>
          <p className="text-xs text-slate-500">
            Querying live products, warehouse inventories, and Kafka order streams.
          </p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: Error State
  // =========================================================================
  if (error && !data) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="bg-white rounded-2xl border border-rose-200 p-8 space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mx-auto text-2xl font-bold">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Failed to Load Admin Dashboard
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">{error}</p>
          <div className="pt-2">
            <Button variant="primary" size="sm" onClick={() => loadDashboard()}>
              🔄 Retry Connection
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const { metrics, recentOrders, inventoryRecords } = data || {
    metrics: {},
    recentOrders: [],
    inventoryRecords: [],
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Admin Operations Console
            </h1>
            <Badge variant="danger">Restricted / Staff</Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Global warehouse overview, inventory reservation buffers, and real-time Kafka order pipeline controls.
          </p>
          {lastUpdated && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              Live data synchronized at {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing...' : '🔄 Refresh Metrics'}
          </Button>
          <Link to="/inventory">
            <Button variant="primary" size="sm">
              Manage Inventory Matrix →
            </Button>
          </Link>
        </div>
      </div>

      {/* Metric Cards (Real Backend Statistics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Active Products */}
        <StatCard
          title="Catalog SKUs"
          value={metrics.activeProductsCount}
          badge="Live Catalog"
          badgeVariant="primary"
          subtext={`${metrics.activeProductsCount} active of ${metrics.totalProductsCount} total products`}
          icon="📦"
        />

        {/* Metric 2: Available Units */}
        <StatCard
          title="Total Available Units"
          value={metrics.totalAvailableUnits?.toLocaleString() || '0'}
          badge={`${metrics.totalOnHandUnits} on hand`}
          badgeVariant="success"
          subtext={`${metrics.totalReservedUnits} reserved across ${metrics.uniqueWarehousesCount} hubs`}
          icon="🏬"
        />

        {/* Metric 3: Queued Orders */}
        <StatCard
          title="Queued Orders"
          value={metrics.pendingOrdersCount}
          badge={metrics.pendingOrdersCount > 0 ? 'In Queue' : 'Clear'}
          badgeVariant={metrics.pendingOrdersCount > 0 ? 'warning' : 'success'}
          subtext={`${metrics.totalOrdersCount} total lifetime orders`}
          icon="⏳"
        />

        {/* Metric 4: Kafka Stream Health */}
        <StatCard
          title="Kafka Stream"
          value="Health status unavailable"
          badge="Unmonitored"
          badgeVariant="neutral"
          subtext="Actuator health check endpoint not exposed by backend"
          icon="⚡"
        />
      </div>

      {/* Main Grid: Orders & Inventory */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Recent Orders Stream */}
        <div className="lg:col-span-7 space-y-6">
          <Card
            title="Recent Orders Stream"
            subtitle={`Latest orders from ${metrics.totalOrdersCount} total customer submissions`}
            action={
              <Link to="/admin/orders">
                <Button variant="ghost" size="sm" className="text-xs text-indigo-600">
                  View All Orders →
                </Button>
              </Link>
            }
          >
            {recentOrders.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <span className="text-3xl">📦</span>
                <p className="text-sm font-semibold text-slate-700">No orders placed yet</p>
                <p className="text-xs text-slate-400">
                  New orders will appear here automatically when submitted.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <table className="w-full text-left border-collapse text-xs min-w-[500px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500 bg-slate-50/70">
                      <th className="py-2.5 px-6">Order #</th>
                      <th className="py-2.5 px-4">Customer</th>
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4 text-right">Amount</th>
                      <th className="py-2.5 px-4 text-center">Status</th>
                      <th className="py-2.5 px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-6 font-bold text-slate-900">
                          #{order.id}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold block truncate max-w-[130px]">
                            {order.customerName || 'Customer'}
                          </span>
                          <span className="text-[10px] text-slate-400 block truncate max-w-[130px]">
                            {order.customerEmail}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          {formatDate(order.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                          {formatCurrency(order.totalAmount)}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {getOrderStatusBadge(order.status)}
                        </td>
                        <td className="py-3 px-6 text-right whitespace-nowrap">
                          <Link to={`/orders/${order.id}`}>
                            <span className="text-indigo-600 font-semibold hover:underline cursor-pointer">
                              Track →
                            </span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Showing last {recentOrders.length} orders</span>
              <Link to="/admin/orders" className="text-indigo-600 font-medium hover:underline">
                Explore full orders pipeline →
              </Link>
            </div>
          </Card>

          {/* Quick Management Actions Card */}
          <Card title="Quick Operations Controls" subtitle="Direct admin shortcut workflows">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link to="/products" className="block">
                <div className="p-3.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 transition-all text-left">
                  <span className="text-xl mb-1 block">🏷️</span>
                  <span className="font-semibold text-xs text-slate-900 block">
                    Product Catalogue
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Inspect SKU pricing & specs
                  </span>
                </div>
              </Link>

              <Link to="/inventory" className="block">
                <div className="p-3.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 transition-all text-left">
                  <span className="text-xl mb-1 block">📦</span>
                  <span className="font-semibold text-xs text-slate-900 block">
                    Inventory Matrix
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Warehouse stock buffers
                  </span>
                </div>
              </Link>

              <Link to="/admin/orders" className="block">
                <div className="p-3.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 transition-all text-left">
                  <span className="text-xl mb-1 block">⚡</span>
                  <span className="font-semibold text-xs text-slate-900 block">
                    Kafka Order Stream
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Monitor EDA fulfillment
                  </span>
                </div>
              </Link>
            </div>
          </Card>
        </div>

        {/* Right Column (5 cols): Warehouse Inventory Availability */}
        <div className="lg:col-span-5 space-y-6">
          <Card
            title="Warehouse Inventory Availability"
            subtitle="Real-time stock across distribution centers"
            action={<Badge variant="neutral">{inventoryRecords.length} Records</Badge>}
          >
            {inventoryRecords.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No inventory records found in backend database.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <table className="w-full text-left border-collapse text-xs min-w-[380px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500 bg-slate-50/70">
                      <th className="py-2 px-6">Product / SKU</th>
                      <th className="py-2 px-3">Hub</th>
                      <th className="py-2 px-3 text-right">Available</th>
                      <th className="py-2 px-3 text-center">Threshold</th>
                      <th className="py-2 px-6 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {inventoryRecords.slice(0, 8).map((record) => (
                      <tr key={record.id} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-6 font-medium">
                          <span className="block truncate max-w-[120px] text-slate-900 font-semibold">
                            {record.productName}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400 block">
                            {record.productSku}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 truncate max-w-[90px]">
                          {record.warehouseName?.replace(' Warehouse', '') || 'Hub'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="font-bold text-slate-900 block">
                            {record.available}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {record.onHand}h / {record.reserved}r
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-[10px] text-slate-400">
                          N/A
                        </td>
                        <td className="py-2.5 px-6 text-right">
                          {getInventoryStatusBadge(record.available)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Explanatory Schema Notice */}
            <div className="mt-4 pt-3 border-t border-slate-100 bg-slate-50/50 -mx-6 -mb-6 p-4 rounded-b-xl text-[11px] text-slate-500 space-y-1">
              <span className="font-semibold text-slate-700 block">
                Backend Architecture Note:
              </span>
              <p className="leading-relaxed">
                SmartStock models (<code className="px-1 py-0.5 rounded bg-slate-200 text-slate-800">Product</code> & <code className="px-1 py-0.5 rounded bg-slate-200 text-slate-800">Inventory</code>) do not define a configurable low-stock threshold column. Availability is calculated authoritatively as <code className="text-indigo-600 font-semibold">on_hand - reserved</code>.
              </p>
            </div>
          </Card>

          {/* Infrastructure Health Status Card */}
          <Card title="Infrastructure Pipeline" subtitle="Microservice connectivity">
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-medium text-slate-700">Spring Boot REST API</span>
                <span className="text-emerald-600 font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  ONLINE (:8081)
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-medium text-slate-700">MySQL Database</span>
                <span className="text-emerald-600 font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  HEALTHY (:3307)
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-medium text-slate-700">Apache Kafka Cluster</span>
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  Health endpoint unavailable (:9092)
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
