import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyOrders, cancelOrder } from '../api/orderService';
import ConfirmationModal from '../components/common/ConfirmationModal';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import { formatCurrency, formatDate } from '../utils/formatters';

const ITEMS_PER_PAGE = 5;

export default function Orders() {
  const { user, isCustomer, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Filters, Search & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  // Cancellation Modal State
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Redirect admin users to the dedicated Admin Order Management console
  useEffect(() => {
    if (isAdmin) {
      navigate('/admin/orders', { replace: true });
    }
  }, [isAdmin, navigate]);

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
      console.error('Failed to fetch orders:', err);
      setError(err?.message || 'Failed to load order history from backend.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isCustomer) {
      fetchOrders();
    } else {
      setLoading(false);
    }
  }, [isCustomer, fetchOrders]);

  // Handle Order Cancellation
  const handleConfirmCancel = async () => {
    if (!orderToCancel || isCancelling) return;

    setIsCancelling(true);
    setFeedback({ type: '', message: '' });

    try {
      const updatedOrder = await cancelOrder(orderToCancel.id);
      if (updatedOrder) {
        // Update local order in state
        setOrders((prev) =>
          prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
        );
        setFeedback({
          type: 'success',
          message: `Order #${orderToCancel.id} was successfully cancelled. Reserved inventory was restored.`,
        });
        setOrderToCancel(null);
      }
    } catch (err) {
      console.error('Failed to cancel order:', err);
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to cancel order. Please try again.',
      });
      setOrderToCancel(null);
    } finally {
      setIsCancelling(false);
    }
  };

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

  // Filter & Search Logic
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // 1. Filter by Status
      if (statusFilter !== 'ALL' && order.status !== statusFilter) {
        return false;
      }

      // 2. Search Query (Order #, SKU, or Product Name)
      if (searchQuery.trim() !== '') {
        const query = searchQuery.trim().toLowerCase();
        const matchesId = String(order.id).includes(query);
        const matchesItems = (order.items || []).some(
          (item) =>
            (item.productName && item.productName.toLowerCase().includes(query)) ||
            (item.productSku && item.productSku.toLowerCase().includes(query))
        );
        return matchesId || matchesItems;
      }

      return true;
    });
  }, [orders, statusFilter, searchQuery]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ITEMS_PER_PAGE));
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredOrders, currentPage]);

  // KPI Metrics
  const kpis = useMemo(() => {
    const total = orders.length;
    const confirmed = orders.filter((o) => o.status === 'CONFIRMED').length;
    const pending = orders.filter((o) => o.status === 'PENDING').length;
    const terminal = orders.filter(
      (o) => o.status === 'REJECTED' || o.status === 'CANCELLED'
    ).length;
    return { total, confirmed, pending, terminal };
  }, [orders]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Customer Order History
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track, inspect, and manage orders placed through your authenticated account.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isCustomer && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchOrders(true)}
              disabled={refreshing || loading}
            >
              {refreshing ? 'Refreshing...' : '🔄 Refresh Status'}
            </Button>
          )}
          <Link to="/products">
            <Button variant="primary" size="sm">
              + New Order
            </Button>
          </Link>
        </div>
      </div>

      {/* Non-customer Notice */}
      {!isCustomer && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <p className="font-semibold">Notice for Admin Accounts</p>
          <p className="text-xs mt-1">
            Customer order history is scoped to authenticated <strong>CUSTOMER</strong> accounts.
            To place orders and test end-to-end customer workflows, log in with a customer account.
          </p>
        </div>
      )}

      {/* Feedback Toast */}
      {feedback.message && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-start gap-3 shadow-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span className="text-lg font-bold">
            {feedback.type === 'success' ? '✅' : '⚠️'}
          </span>
          <div className="flex-1">
            <h4 className="font-semibold">
              {feedback.type === 'success' ? 'Action Completed' : 'Operation Failed'}
            </h4>
            <p className="text-xs mt-0.5">{feedback.message}</p>
          </div>
          <button
            onClick={() => setFeedback({ type: '', message: '' })}
            className="text-slate-400 hover:text-slate-600 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Total Orders
          </span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">
            {kpis.total}
          </span>
        </div>
        <div className="bg-white rounded-xl border border-emerald-100 p-4 shadow-xs bg-emerald-50/20">
          <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider block">
            Confirmed
          </span>
          <span className="text-2xl font-black text-emerald-700 mt-1 block">
            {kpis.confirmed}
          </span>
        </div>
        <div className="bg-white rounded-xl border border-amber-100 p-4 shadow-xs bg-amber-50/20">
          <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider block">
            Pending Allocation
          </span>
          <span className="text-2xl font-black text-amber-700 mt-1 block">
            {kpis.pending}
          </span>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Cancelled / Rejected
          </span>
          <span className="text-2xl font-black text-slate-700 mt-1 block">
            {kpis.terminal}
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {['ALL', 'CONFIRMED', 'PENDING', 'CANCELLED', 'REJECTED'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  statusFilter === status
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {status === 'ALL' ? 'All Orders' : status}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="w-full md:w-72 relative">
            <input
              type="text"
              placeholder="Search by Order #, SKU, Name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
            <span className="absolute left-3 top-2 text-slate-400 text-xs">🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Filter Summary */}
        <div className="text-xs text-slate-400 flex items-center justify-between pt-2 border-t border-slate-100">
          <span>
            Showing <strong>{filteredOrders.length}</strong> of <strong>{orders.length}</strong> orders
          </span>
          {(statusFilter !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setStatusFilter('ALL');
                setSearchQuery('');
              }}
              className="text-indigo-600 hover:underline font-medium"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* Orders List / Table Card */}
      <Card
        title="Customer Orders Stream"
        subtitle={
          isCustomer
            ? `Orders placed by ${user?.email || 'authenticated customer'}`
            : 'Kafka consumer order processing stream'
        }
        action={<Badge variant="primary">{filteredOrders.length} Orders Found</Badge>}
      >
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Retrieving orders from backend...</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center space-y-3">
            <div className="text-4xl">⚠️</div>
            <h3 className="text-base font-semibold text-slate-800">Failed to load order history</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">{error}</p>
            <Button variant="primary" size="sm" onClick={() => fetchOrders()}>
              Retry
            </Button>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="text-4xl">📦</div>
            <h3 className="text-base font-semibold text-slate-800">No orders placed yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Your order history is currently empty. Explore our product catalogue and place your first order.
            </p>
            <div className="pt-2">
              <Link to="/products">
                <Button variant="primary" size="sm">
                  Browse Product Catalogue
                </Button>
              </Link>
            </div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="text-3xl">🔍</div>
            <h3 className="text-sm font-semibold text-slate-800">No orders match your filter</h3>
            <p className="text-xs text-slate-500">
              Try adjusting your search query or selecting a different status tab.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStatusFilter('ALL');
                setSearchQuery('');
              }}
            >
              Clear Filters
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500 bg-slate-50/70">
                    <th className="py-3 px-6">Order #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Fulfillment Hub</th>
                    <th className="py-3 px-4 text-center">Items</th>
                    <th className="py-3 px-4 text-right">Total Amount</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {paginatedOrders.map((order) => {
                    const itemsCount = (order.items || []).reduce(
                      (sum, item) => sum + (item.quantity || 1),
                      0
                    );
                    const canCancel =
                      order.status === 'PENDING' || order.status === 'CONFIRMED';

                    return (
                      <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-4 px-6 font-bold text-slate-900">
                          #{order.id}
                        </td>
                        <td className="py-4 px-4 text-xs text-slate-500">
                          {formatDate(order.createdAt)}
                        </td>
                        <td className="py-4 px-4">
                          {getStatusBadge(order.status)}
                          {order.status === 'CANCELLED' && (
                            <span className="block text-[10px] text-slate-500 font-medium mt-0.5">
                              {order.cancelledByRole === 'ADMIN'
                                ? 'By Admin'
                                : order.cancelledByRole === 'CUSTOMER'
                                ? 'By You'
                                : 'Actor unavailable'}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-xs">
                          {order.warehouseName ? (
                            <span className="font-semibold text-emerald-700 flex items-center gap-1">
                              <span>📍</span> {order.warehouseName}
                            </span>
                          ) : order.status === 'REJECTED' ? (
                            <span className="text-rose-500">None (Out of Stock)</span>
                          ) : order.status === 'CANCELLED' ? (
                            <span className="text-slate-400">None (Cancelled)</span>
                          ) : (
                            <span className="text-amber-600 italic">Pending Allocation</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center text-xs font-semibold text-slate-800">
                          {itemsCount} item{itemsCount !== 1 ? 's' : ''}
                        </td>
                        <td className="py-4 px-4 text-right font-black text-slate-900">
                          {formatCurrency(order.totalAmount)}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {canCancel && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2"
                                onClick={() => setOrderToCancel(order)}
                              >
                                Cancel
                              </Button>
                            )}
                            <Link to={`/orders/${order.id}`}>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs font-semibold text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                              >
                                Track & Details →
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span>
                  Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                </span>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="text-xs px-2.5 py-1"
                  >
                    ← Previous
                  </Button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-7 h-7 rounded-md text-xs font-semibold transition-colors ${
                        currentPage === page
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {page}
                    </button>
                  ))}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="text-xs px-2.5 py-1"
                  >
                    Next →
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* CONFIRMATION MODAL FOR QUICK CANCELLATION */}
      {orderToCancel && (
        <ConfirmationModal
          isOpen={Boolean(orderToCancel)}
          onClose={() => setOrderToCancel(null)}
          onConfirm={handleConfirmCancel}
          title={`Cancel Order #${orderToCancel.id}?`}
          message="Are you sure you want to cancel this order? This action cannot be undone."
          confirmText="Yes, Cancel Order"
          cancelText="Keep Order"
          confirmVariant="danger"
          isLoading={isCancelling}
        >
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs space-y-1">
            <p className="font-semibold">Backend Compensation Notice:</p>
            <p>
              {orderToCancel.status === 'CONFIRMED'
                ? `This order has reserved stock at ${orderToCancel.warehouseName || 'Warehouse'}. Cancelling will release all reserved units back to available stock.`
                : 'This order is currently pending in the Kafka pipeline. Cancelling will transition the status to CANCELLED.'}
            </p>
          </div>
        </ConfirmationModal>
      )}
    </div>
  );
}
