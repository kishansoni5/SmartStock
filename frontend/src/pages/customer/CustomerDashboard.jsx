import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { getMyOrders } from '../../api/orderService';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function CustomerDashboard() {
  const { user } = useAuth();
  const { totalItems } = useCart();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchOrders = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await getMyOrders();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load customer orders:', err);
      setError(
        err?.message ||
          'Failed to load your order records from the backend. Please check your connection.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Status Badge Helper
  const getStatusBadge = (status) => {
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

  // Metrics calculated authoritatively from actual customer orders
  const metrics = useMemo(() => {
    const totalOrdersCount = orders.length;

    // Active orders: In-flight Kafka processing (PENDING) + Confirmed with allocated stock (CONFIRMED)
    const activeOrders = orders.filter(
      (o) => o.status === 'PENDING' || o.status === 'CONFIRMED'
    );
    const pendingOrders = orders.filter((o) => o.status === 'PENDING');
    const confirmedOrders = orders.filter((o) => o.status === 'CONFIRMED');

    // Total Purchases calculated from CONFIRMED orders (policy: verified fulfilled purchases)
    const totalPurchases = confirmedOrders.reduce(
      (acc, o) => acc + (Number(o.totalAmount) || 0),
      0
    );

    return {
      activeCount: activeOrders.length,
      pendingCount: pendingOrders.length,
      confirmedCount: confirmedOrders.length,
      totalPurchases,
      totalOrdersCount,
    };
  }, [orders]);

  // Show top 5 most recent orders
  const recentOrders = useMemo(() => {
    return [...orders].slice(0, 5);
  }, [orders]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Customer Portal
            </h1>
            <Badge variant="primary">Customer View</Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Welcome back, <span className="font-semibold text-slate-800">{user?.name || user?.email}</span>. Track your active orders, explore products, and review your purchases.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/orders">
            <Button variant="outline" size="sm">
              My Orders ({metrics.totalOrdersCount})
            </Button>
          </Link>
          <Link to="/products">
            <Button variant="primary" size="sm">
              + Browse Products
            </Button>
          </Link>
        </div>
      </div>

      {/* Error State Banner */}
      {error && (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchOrders(true)}>
            Retry
          </Button>
        </div>
      )}

      {/* Real Metric Cards Calculated from Backend Customer Data */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Orders"
          value={loading ? '...' : metrics.activeCount}
          badge={metrics.activeCount > 0 ? 'In Progress' : 'None Active'}
          badgeVariant={metrics.activeCount > 0 ? 'warning' : 'neutral'}
          subtext={
            loading
              ? 'Loading active orders...'
              : `${metrics.pendingCount} pending, ${metrics.confirmedCount} confirmed`
          }
          icon="📦"
        />

        <StatCard
          title="Confirmed Orders"
          value={loading ? '...' : metrics.confirmedCount}
          badge="Stock Allocated"
          badgeVariant="success"
          subtext="Orders reserved at warehouse hubs"
          icon="✅"
        />

        <StatCard
          title="Total Purchases"
          value={loading ? '...' : formatCurrency(metrics.totalPurchases)}
          badge="Verified"
          badgeVariant="primary"
          subtext="Total value of confirmed orders"
          icon="💳"
        />

        <StatCard
          title="Cart Items"
          value={totalItems}
          badge={totalItems > 0 ? 'Ready for Checkout' : 'Empty'}
          badgeVariant={totalItems > 0 ? 'success' : 'neutral'}
          subtext="Items stored in your shopping cart"
          icon="🛒"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Cols: Real Recent Orders */}
        <div className="lg:col-span-2 space-y-6">
          <Card
            title="Recent Orders"
            subtitle={`Your latest orders out of ${metrics.totalOrdersCount} lifetime submissions`}
            action={
              <Link to="/orders">
                <Button variant="ghost" size="sm" className="text-xs text-indigo-600">
                  View All Orders ({metrics.totalOrdersCount}) →
                </Button>
              </Link>
            }
          >
            {loading ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-500">Querying your order history from Spring Boot...</p>
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <span className="text-4xl block">🛍️</span>
                <h3 className="text-base font-bold text-slate-800">No Orders Placed Yet</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  You have not placed any orders yet. Visit our product catalogue to select items and place your first order.
                </p>
                <Link to="/products">
                  <Button variant="primary" size="sm">
                    Start Shopping →
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <table className="w-full text-left border-collapse text-xs min-w-[540px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500 bg-slate-50/70">
                      <th className="py-2.5 px-6">Order ID</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Fulfillment Hub</th>
                      <th className="py-2.5 px-3 text-center">Items</th>
                      <th className="py-2.5 px-4 text-right">Total</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-6 font-bold text-indigo-600 whitespace-nowrap">
                          <Link to={`/orders/${order.id}`} className="hover:underline">
                            #{order.id}
                          </Link>
                        </td>
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                          {formatDate(order.createdAt)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {order.warehouseName ? (
                            <span className="font-medium text-slate-700">
                              {order.warehouseName}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">
                              {order.status === 'REJECTED' ? 'Not Allocated' : 'Pending'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap font-medium">
                          {order.items?.length || 0} {order.items?.length === 1 ? 'item' : 'items'}
                        </td>
                        <td className="py-3 px-4 text-right font-extrabold text-slate-900 whitespace-nowrap">
                          {formatCurrency(order.totalAmount)}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {getStatusBadge(order.status)}
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
              <Link to="/orders" className="text-indigo-600 font-medium hover:underline">
                Explore full orders history →
              </Link>
            </div>
          </Card>
        </div>

        {/* Right Col: Quick Access & Architecture Explanation */}
        <div className="space-y-6">
          <Card title="Quick Actions" subtitle="Customer tools & navigation">
            <div className="space-y-2.5">
              <Link to="/products" className="block">
                <div className="p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors flex items-center gap-3">
                  <span className="text-2xl">🛍️</span>
                  <div>
                    <div className="text-xs font-bold text-slate-900">Browse Products</div>
                    <div className="text-[11px] text-slate-500">Explore catalog & add items to cart</div>
                  </div>
                </div>
              </Link>

              <Link to="/cart" className="block">
                <div className="p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors flex items-center gap-3">
                  <span className="text-2xl">🛒</span>
                  <div>
                    <div className="text-xs font-bold text-slate-900">Review Shopping Cart</div>
                    <div className="text-[11px] text-slate-500">
                      {totalItems > 0
                        ? `${totalItems} items ready for checkout`
                        : 'Your cart is currently empty'}
                    </div>
                  </div>
                </div>
              </Link>

              <Link to="/orders" className="block">
                <div className="p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors flex items-center gap-3">
                  <span className="text-2xl">📍</span>
                  <div>
                    <div className="text-xs font-bold text-slate-900">Track Orders & Shipments</div>
                    <div className="text-[11px] text-slate-500">View live fulfillment & cancellation options</div>
                  </div>
                </div>
              </Link>
            </div>
          </Card>

          {/* Architecture Information Card (Non-fake Support) */}
          <Card title="Fulfillment Architecture" subtitle="How your orders are processed">
            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-semibold text-slate-800 block flex items-center gap-1.5">
                  <span>⚡</span> Event-Driven Reservation
                </span>
                <p className="text-[11px] text-slate-500">
                  Placing an order saves the order in <code className="text-slate-800 font-mono">PENDING</code> state and publishes an <code className="text-slate-800 font-mono">OrderCreated</code> event via Apache Kafka.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-semibold text-slate-800 block flex items-center gap-1.5">
                  <span>🏢</span> Multi-Warehouse Allocation
                </span>
                <p className="text-[11px] text-slate-500">
                  Downstream consumers evaluate warehouse inventory (Surat primary, Mumbai fallback). If stock is available, stock is reserved and order becomes <code className="text-emerald-700 font-bold">CONFIRMED</code>.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-semibold text-slate-800 block flex items-center gap-1.5">
                  <span>🛡️</span> Customer Cancellation
                </span>
                <p className="text-[11px] text-slate-500">
                  You can cancel any eligible order directly from the order details screen. Reserved stock will be automatically released back to the warehouse buffer.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
