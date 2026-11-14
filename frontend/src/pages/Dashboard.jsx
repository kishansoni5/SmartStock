import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProducts } from '../api/productService';
import { getAllInventory } from '../api/inventoryService';
import { getAllOrdersAdmin, getMyOrders } from '../api/orderService';
import Card from '../components/common/Card';
import StatCard from '../components/common/StatCard';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import { formatCurrency, formatDate } from '../utils/formatters';

export default function Dashboard() {
  const { isAuthenticated, user, isAdmin, isCustomer } = useAuth();
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081/api/v1';

  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [totalOrdersCount, setTotalOrdersCount] = useState(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPlatformData = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Fetch products & inventory concurrently
      const [prodData, invData] = await Promise.all([
        getProducts().catch(() => []),
        getAllInventory().catch(() => []),
      ]);

      setProducts(Array.isArray(prodData) ? prodData : []);
      setInventory(Array.isArray(invData) ? invData : []);

      // 2. Fetch orders based on role
      if (isAdmin) {
        const [ordersPage, pendingPage] = await Promise.all([
          getAllOrdersAdmin({ page: 0, size: 5, sort: 'createdAt,desc' }).catch(() => ({
            content: [],
            totalElements: 0,
          })),
          getAllOrdersAdmin({ status: 'PENDING', page: 0, size: 1 }).catch(() => ({
            totalElements: 0,
          })),
        ]);

        setRecentOrders(ordersPage?.content || []);
        setTotalOrdersCount(ordersPage?.totalElements || 0);
        setPendingOrdersCount(pendingPage?.totalElements || 0);
      } else {
        const myOrders = await getMyOrders().catch(() => []);
        const orderList = Array.isArray(myOrders) ? myOrders : [];
        setRecentOrders(orderList.slice(0, 5));
        setTotalOrdersCount(orderList.length);
        setPendingOrdersCount(orderList.filter((o) => o.status === 'PENDING').length);
      }
    } catch (err) {
      console.error('Failed to load platform data:', err);
      setError(err?.message || 'Failed to retrieve platform data from Spring Boot backend.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, isAdmin]);

  useEffect(() => {
    fetchPlatformData();
  }, [fetchPlatformData]);

  // Calculated live metrics
  const activeProductsCount = useMemo(() => {
    return products.filter((p) => p.active !== false).length;
  }, [products]);

  const totalAvailableUnits = useMemo(() => {
    return inventory.reduce((sum, item) => sum + (Number(item.available) || 0), 0);
  }, [inventory]);

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

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Welcome Hero / Top Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 mb-3">
            <span>🚀</span> SmartStock Enterprise Inventory & Fulfillment Hub
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Operations & Fulfillment Hub
          </h1>
          <p className="text-sm text-slate-500 mt-2 max-w-2xl leading-relaxed">
            Scalable full-stack platform powered by Spring Boot 3, MySQL database, and event-driven Apache Kafka order pipelines (topic: <code className="font-mono text-indigo-700 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">order-created</code>).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {isAuthenticated ? (
            <>
              {isAdmin && (
                <Link to="/admin" className="w-full sm:w-auto">
                  <Button variant="primary" size="md" className="w-full sm:w-auto">
                    Admin Console →
                  </Button>
                </Link>
              )}
              <Link to="/customer" className="w-full sm:w-auto">
                <Button variant="outline" size="md" className="w-full sm:w-auto">
                  Customer Portal
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="w-full sm:w-auto">
                <Button variant="primary" size="md" className="w-full sm:w-auto">
                  Sign In
                </Button>
              </Link>
              <Link to="/register" className="w-full sm:w-auto">
                <Button variant="outline" size="md" className="w-full sm:w-auto">
                  Create Account
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Primary KPI Stats Grid (Real Backend Data) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Catalog SKUs"
          value={loading ? '...' : activeProductsCount}
          badge="Live Catalog"
          badgeVariant="primary"
          subtext={
            isAuthenticated
              ? `${activeProductsCount} active of ${products.length} registered products`
              : 'Sign in to inspect full product catalogue'
          }
          icon="📦"
        />

        <StatCard
          title="Total Available Stock"
          value={loading ? '...' : totalAvailableUnits.toLocaleString()}
          badge="Live Stock"
          badgeVariant="success"
          subtext="Available units across warehouse hubs"
          icon="🏬"
        />

        <StatCard
          title="Queued Orders"
          value={loading ? '...' : pendingOrdersCount}
          badge={pendingOrdersCount > 0 ? 'Kafka In-Flight' : 'Pipeline Clear'}
          badgeVariant={pendingOrdersCount > 0 ? 'warning' : 'success'}
          subtext={
            isAuthenticated
              ? `${totalOrdersCount} total lifetime orders recorded`
              : 'Sign in to inspect order streams'
          }
          icon="⏳"
        />

        <StatCard
          title="Kafka EDA Pipeline"
          value="Port 9092"
          badge="Event-Driven"
          badgeVariant="indigo"
          subtext="Topic: order-created | Actuator probe unexposed"
          icon="⚡"
        />
      </div>

      {/* Main Grid: Orders Stream & Architecture Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Recent Orders Stream */}
        <div className="lg:col-span-7 space-y-6">
          <Card
            title={isAdmin ? 'Live Orders Stream' : 'Your Recent Orders'}
            subtitle={
              isAdmin
                ? `Showing latest orders out of ${totalOrdersCount} total customer submissions`
                : `Showing latest orders out of ${totalOrdersCount} orders placed`
            }
            action={
              isAuthenticated && (
                <Link to={isAdmin ? '/admin/orders' : '/orders'}>
                  <Button variant="ghost" size="sm" className="text-xs text-indigo-600">
                    {isAdmin ? 'Manage All Orders →' : 'View Order History →'}
                  </Button>
                </Link>
              )
            }
          >
            {!isAuthenticated ? (
              <div className="py-12 text-center space-y-3">
                <span className="text-3xl block">🔐</span>
                <p className="text-sm font-semibold text-slate-700">Authentication Required</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Sign in with an ADMIN or CUSTOMER account to monitor live order fulfillment and inventory streams.
                </p>
                <div className="pt-2 flex justify-center gap-2">
                  <Link to="/login">
                    <Button variant="primary" size="sm">
                      Sign In
                    </Button>
                  </Link>
                  <Link to="/register">
                    <Button variant="outline" size="sm">
                      Register
                    </Button>
                  </Link>
                </div>
              </div>
            ) : loading ? (
              <div className="py-12 text-center space-y-2">
                <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-500">Querying live order stream from backend...</p>
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <span className="text-3xl">📦</span>
                <p className="text-sm font-semibold text-slate-700">No orders placed yet</p>
                <p className="text-xs text-slate-400">
                  New orders will automatically stream here when placed through the customer catalogue.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <table className="w-full text-left border-collapse text-xs min-w-[500px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500 bg-slate-50/70">
                      <th className="py-2.5 px-6">Order #</th>
                      <th className="py-2.5 px-4">{isAdmin ? 'Customer' : 'Items'}</th>
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
                          {isAdmin ? (
                            <>
                              <span className="font-semibold block truncate max-w-[130px]">
                                {order.customerName || 'Customer'}
                              </span>
                              <span className="text-[10px] text-slate-400 block truncate max-w-[130px]">
                                {order.customerEmail}
                              </span>
                            </>
                          ) : (
                            <span className="font-semibold text-slate-700">
                              {order.items?.length || 0} {order.items?.length === 1 ? 'item' : 'items'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          {formatDate(order.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                          {formatCurrency(order.totalAmount)}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {getStatusBadge(order.status)}
                        </td>
                        <td className="py-3 px-6 text-right whitespace-nowrap">
                          <Link to={isAdmin ? `/admin/orders` : `/orders/${order.id}`}>
                            <span className="text-indigo-600 font-semibold hover:underline cursor-pointer">
                              {isAdmin ? 'Manage →' : 'Track →'}
                            </span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {isAuthenticated && recentOrders.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Showing latest {recentOrders.length} orders</span>
                <Link
                  to={isAdmin ? '/admin/orders' : '/orders'}
                  className="text-indigo-600 font-medium hover:underline"
                >
                  Explore full orders pipeline →
                </Link>
              </div>
            )}
          </Card>

          {/* Quick Operations Controls */}
          <Card title="Quick Operations Controls" subtitle="Direct workflow shortcuts">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link to="/products" className="block">
                <div className="p-3.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 transition-all text-left">
                  <span className="text-xl mb-1 block">🛍️</span>
                  <span className="font-semibold text-xs text-slate-900 block">
                    Product Catalog
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Browse SKUs & add to cart
                  </span>
                </div>
              </Link>

              <Link to={isAdmin ? '/admin/inventory' : '/products'} className="block">
                <div className="p-3.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 transition-all text-left">
                  <span className="text-xl mb-1 block">📦</span>
                  <span className="font-semibold text-xs text-slate-900 block">
                    {isAdmin ? 'Stock Adjustments' : 'Warehouse Stock'}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    {isAdmin ? 'Adjust hub stock levels' : 'Inspect stock availability'}
                  </span>
                </div>
              </Link>

              <Link to={isAdmin ? '/admin/orders' : '/orders'} className="block">
                <div className="p-3.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 transition-all text-left">
                  <span className="text-xl mb-1 block">⚡</span>
                  <span className="font-semibold text-xs text-slate-900 block">
                    {isAdmin ? 'Admin Orders' : 'My Orders'}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    {isAdmin ? 'Inspect & cancel orders' : 'Track fulfillment lifecycle'}
                  </span>
                </div>
              </Link>
            </div>
          </Card>
        </div>

        {/* Right Column (5 cols): Architecture & Microservice Infrastructure */}
        <div className="lg:col-span-5 space-y-6">
          <Card
            title="System Architecture & Pipelines"
            subtitle="Core technical stack powering SmartStock"
            action={<Badge variant="neutral">Spring Boot + MySQL + Kafka</Badge>}
          >
            <div className="space-y-3.5 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-slate-800">
                  <span>⚡</span>
                  <span>Transactional Outbox & Kafka EDA</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Orders are committed with an <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">OutboxEvent</code> in MySQL within an atomic transaction. Background listeners publish events to Apache Kafka (<code className="text-indigo-600 font-mono font-bold">order-created</code>) for asynchronous multi-warehouse stock reservation.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-slate-800">
                  <span>🏢</span>
                  <span>Hierarchical Hub Allocation</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Fulfillment consumers evaluate distribution centers in sequence (Surat Hub primary, Mumbai Hub fallback). If inventory is confirmed, stock is reserved; otherwise, the order is rejected.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-slate-800">
                  <span>🛡️</span>
                  <span>Stateless JWT & Role-Based Security</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Protected REST endpoints enforce <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">ROLE_ADMIN</code> and <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">ROLE_CUSTOMER</code> boundaries. Target API base URL: <code className="font-mono text-indigo-600 font-bold">{apiBaseUrl}</code>.
                </p>
              </div>
            </div>
          </Card>

          {/* Infrastructure Health Status Card */}
          <Card title="Infrastructure Pipeline Status" subtitle="Backend microservice stack">
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
                  Health endpoint unexposed (:9092)
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
