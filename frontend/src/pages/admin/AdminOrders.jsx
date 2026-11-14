import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  getAllOrdersAdmin,
  getAdminOrderById,
  cancelOrderAdmin,
} from '../../api/orderService';
import AdminNavTabs from '../../components/admin/AdminNavTabs';
import OrderStatusTracker from '../../components/orders/OrderStatusTracker';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { formatCurrency, formatDate } from '../../utils/formatters';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'PENDING', label: 'PENDING (In-Flight)' },
  { value: 'CONFIRMED', label: 'CONFIRMED (Reserved)' },
  { value: 'REJECTED', label: 'REJECTED (Out of Stock)' },
  { value: 'CANCELLED', label: 'CANCELLED (Restored)' },
];

const SORT_OPTIONS = [
  { value: 'createdAt,desc', label: 'Newest First' },
  { value: 'createdAt,asc', label: 'Oldest First' },
  { value: 'totalAmount,desc', label: 'Highest Amount' },
  { value: 'totalAmount,asc', label: 'Lowest Amount' },
];

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

export default function AdminOrders() {
  // Page Data State from Spring Boot Page<OrderResponse>
  const [orders, setOrders] = useState([]);
  const [pageInfo, setPageInfo] = useState({
    pageNumber: 0,
    pageSize: 10,
    totalPages: 1,
    totalElements: 0,
    first: true,
    last: true,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Server-side Query Parameters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortOption, setSortOption] = useState('createdAt,desc');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(0); // 0-indexed for Spring Data

  // Client-side Search / Quick Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('ALL'); // ALL, TODAY, 7DAYS, 30DAYS

  // Order Details Modal State
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Cancellation Modal State
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Feedback Notification Banner
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // ---------------------------------------------------------------------------
  // 1. Fetch Orders from Backend Admin API
  // ---------------------------------------------------------------------------
  const fetchOrders = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = {
          page: currentPage,
          size: pageSize,
          sort: sortOption,
        };

        if (statusFilter && statusFilter !== 'ALL') {
          params.status = statusFilter;
        }

        const data = await getAllOrdersAdmin(params);

        if (data && Array.isArray(data.content)) {
          setOrders(data.content);
          setPageInfo({
            pageNumber: data.number ?? currentPage,
            pageSize: data.size ?? pageSize,
            totalPages: data.totalPages || 1,
            totalElements: data.totalElements || 0,
            first: data.first ?? true,
            last: data.last ?? true,
          });
        } else if (Array.isArray(data)) {
          // Fallback if raw list returned
          setOrders(data);
          setPageInfo({
            pageNumber: 0,
            pageSize: data.length,
            totalPages: 1,
            totalElements: data.length,
            first: true,
            last: true,
          });
        } else {
          setOrders([]);
        }
      } catch (err) {
        console.error('Failed to fetch admin orders:', err);
        setError(
          err?.message ||
            'Failed to load order stream from Spring Boot backend. Please check connection.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentPage, pageSize, sortOption, statusFilter]
  );

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Reset page when server query filters change
  const handleStatusChange = (newStatus) => {
    setStatusFilter(newStatus);
    setCurrentPage(0);
  };

  const handleSortChange = (newSort) => {
    setSortOption(newSort);
    setCurrentPage(0);
  };

  const handlePageSizeChange = (newSize) => {
    setPageSize(Number(newSize));
    setCurrentPage(0);
  };

  // ---------------------------------------------------------------------------
  // 2. Open Order Details Modal
  // ---------------------------------------------------------------------------
  const handleOpenDetails = async (orderId) => {
    setIsDetailsModalOpen(true);
    setIsLoadingDetails(true);
    setSelectedOrder(null);

    try {
      const fullOrder = await getAdminOrderById(orderId);
      setSelectedOrder(fullOrder);
    } catch (err) {
      console.error(`Failed to load details for order #${orderId}:`, err);
      // Fallback: look up in local page orders
      const fallback = orders.find((o) => o.id === orderId);
      if (fallback) {
        setSelectedOrder(fallback);
      } else {
        setFeedback({
          type: 'error',
          message: err?.message || `Failed to load details for order #${orderId}.`,
        });
        setIsDetailsModalOpen(false);
      }
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleCloseDetails = () => {
    setIsDetailsModalOpen(false);
    setSelectedOrder(null);
  };

  // ---------------------------------------------------------------------------
  // 3. Order Cancellation Workflow
  // ---------------------------------------------------------------------------
  const handleInitiateCancel = (order, e) => {
    if (e) e.stopPropagation();
    setOrderToCancel(order);
    setIsCancelModalOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!orderToCancel || isCancelling) return;

    setIsCancelling(true);
    setFeedback({ type: '', message: '' });

    try {
      const updatedOrder = await cancelOrderAdmin(orderToCancel.id);

      // Update in local page list
      setOrders((prev) =>
        prev.map((o) => (o.id === orderToCancel.id ? { ...o, ...updatedOrder, status: 'CANCELLED', cancelledByRole: updatedOrder?.cancelledByRole || 'ADMIN' } : o))
      );

      // Update details modal if currently open
      if (selectedOrder && selectedOrder.id === orderToCancel.id) {
        setSelectedOrder((prev) => ({ ...prev, ...updatedOrder, status: 'CANCELLED', cancelledByRole: updatedOrder?.cancelledByRole || 'ADMIN' }));
      }

      setFeedback({
        type: 'success',
        message: `Order #${orderToCancel.id} was successfully cancelled by administrator. Any reserved inventory was restored via compensation transaction.`,
      });

      setIsCancelModalOpen(false);
      setOrderToCancel(null);

      // Refresh list to update counts & server state
      fetchOrders(true);
    } catch (err) {
      console.error('Failed to cancel order:', err);
      setFeedback({
        type: 'error',
        message:
          err?.message ||
          'Failed to cancel order. Backend rejected the cancellation request.',
      });
      setIsCancelModalOpen(false);
    } finally {
      setIsCancelling(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 4. Client-side Search & Date Filtering on Loaded Page
  // ---------------------------------------------------------------------------
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // 1. Text Search (Order ID, Customer Name, Customer Email, Warehouse)
      if (searchQuery.trim() !== '') {
        const query = searchQuery.trim().toLowerCase();
        const matchesId = String(order.id).includes(query);
        const matchesName = order.customerName?.toLowerCase().includes(query);
        const matchesEmail = order.customerEmail?.toLowerCase().includes(query);
        const matchesHub = order.warehouseName?.toLowerCase().includes(query);
        const matchesItems = (order.items || []).some(
          (item) =>
            item.productName?.toLowerCase().includes(query) ||
            item.productSku?.toLowerCase().includes(query)
        );

        if (!matchesId && !matchesName && !matchesEmail && !matchesHub && !matchesItems) {
          return false;
        }
      }

      // 2. Date Filter
      if (dateFilter !== 'ALL' && order.createdAt) {
        const orderDate = new Date(order.createdAt);
        const now = new Date();
        if (dateFilter === 'TODAY') {
          const isToday =
            orderDate.getDate() === now.getDate() &&
            orderDate.getMonth() === now.getMonth() &&
            orderDate.getFullYear() === now.getFullYear();
          if (!isToday) return false;
        } else if (dateFilter === '7DAYS') {
          const diffDays = (now - orderDate) / (1000 * 60 * 60 * 24);
          if (diffDays > 7) return false;
        } else if (dateFilter === '30DAYS') {
          const diffDays = (now - orderDate) / (1000 * 60 * 60 * 24);
          if (diffDays > 30) return false;
        }
      }

      return true;
    });
  }, [orders, searchQuery, dateFilter]);

  // Direct Order ID Quick Lookup
  const handleQuickLookup = async (e) => {
    e.preventDefault();
    const query = searchQuery.trim().replace(/^#/, '');
    if (!query || isNaN(Number(query))) return;

    try {
      setLoading(true);
      const order = await getAdminOrderById(Number(query));
      if (order && order.id) {
        handleOpenDetails(order.id);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Order #${query} not found in backend database.`,
      });
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 5. Status Badge & Helper Functions
  // ---------------------------------------------------------------------------
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

  const isCancellable = (status) => {
    return status === 'PENDING' || status === 'CONFIRMED';
  };

  // Calculate Page Summary Statistics
  const pageStats = useMemo(() => {
    const total = pageInfo.totalElements;
    const confirmedCount = orders.filter((o) => o.status === 'CONFIRMED').length;
    const pendingCount = orders.filter((o) => o.status === 'PENDING').length;
    const pageRevenue = orders
      .filter((o) => o.status === 'CONFIRMED')
      .reduce((acc, curr) => acc + (Number(curr.totalAmount) || 0), 0);

    return { total, confirmedCount, pendingCount, pageRevenue };
  }, [orders, pageInfo.totalElements]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Admin Sub-navigation Tabs */}
      <AdminNavTabs />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Admin Order Management
            </h1>
            <Badge variant="indigo">Kafka EDA Stream</Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Monitor, inspect, filter, and manage customer orders across all distribution warehouses.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchOrders(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            {refreshing ? 'Updating Stream...' : 'Refresh Pipeline'}
          </Button>
        </div>
      </div>

      {/* Feedback Banner */}
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
            <p className="text-xs font-semibold">{feedback.message}</p>
          </div>
          <button
            onClick={() => setFeedback({ type: '', message: '' })}
            className="text-slate-400 hover:text-slate-600 font-bold"
            aria-label="Dismiss feedback"
          >
            ×
          </button>
        </div>
      )}

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total System Orders"
          value={pageInfo.totalElements}
          icon="📦"
          description="Total customer orders on platform"
        />
        <StatCard
          title="Confirmed on Page"
          value={pageStats.confirmedCount}
          icon="✅"
          description="Inventory allocated & locked"
        />
        <StatCard
          title="Pending Allocation"
          value={pageStats.pendingCount}
          icon="⏳"
          description="In-flight Kafka consumer processing"
        />
        <StatCard
          title="Page Confirmed Total"
          value={formatCurrency(pageStats.pageRevenue)}
          icon="💰"
          description="Value of confirmed orders on page"
        />
      </div>

      {/* Search, Filter & Pagination Query Bar */}
      <Card>
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Search Input with Quick Lookup */}
            <form
              onSubmit={handleQuickLookup}
              className="relative flex-1 max-w-md flex items-center gap-2"
            >
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                  🔍
                </span>
                <input
                  type="text"
                  placeholder="Search by Order ID, customer name, email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                />
              </div>
              {searchQuery && !isNaN(Number(searchQuery.trim().replace(/^#/, ''))) && (
                <Button type="submit" variant="outline" size="sm" className="whitespace-nowrap text-xs">
                  Inspect #{searchQuery.trim().replace(/^#/, '')}
                </Button>
              )}
            </form>

            {/* Server-side Status Filter Buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500 mr-1">Status:</span>
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    statusFilter === opt.value
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {opt.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Sub-Filters: Sort, Page Size, Date Preset */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {/* Sort Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">Sort By:</span>
                <select
                  value={sortOption}
                  onChange={(e) => handleSortChange(e.target.value)}
                  className="border border-slate-300 rounded-md py-1 px-2 text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Page Size Selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">Page Size:</span>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(e.target.value)}
                  className="border border-slate-300 rounded-md py-1 px-2 text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size} per page
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">Date:</span>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="border border-slate-300 rounded-md py-1 px-2 text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="ALL">All Dates</option>
                  <option value="TODAY">Today Only</option>
                  <option value="7DAYS">Past 7 Days</option>
                  <option value="30DAYS">Past 30 Days</option>
                </select>
              </div>
            </div>

            {/* Clear Filters */}
            {(statusFilter !== 'ALL' || searchQuery || dateFilter !== 'ALL' || sortOption !== 'createdAt,desc') && (
              <button
                onClick={() => {
                  setStatusFilter('ALL');
                  setSearchQuery('');
                  setDateFilter('ALL');
                  setSortOption('createdAt,desc');
                  setCurrentPage(0);
                }}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline"
              >
                Reset All Filters
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Main Order Listing Table Card */}
      <Card
        title="Customer Order Stream"
        subtitle={`Showing page ${pageInfo.pageNumber + 1} of ${pageInfo.totalPages} (${pageInfo.totalElements} total registered orders)`}
        action={
          <Badge variant="neutral">
            {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'} visible
          </Badge>
        }
      >
        {/* Loading State */}
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-700">Loading Order Stream...</p>
            <p className="text-xs text-slate-400">
              Querying Spring Boot orders with status and pagination parameters.
            </p>
          </div>
        ) : error ? (
          /* Error State */
          <div className="py-12 text-center space-y-3 max-w-md mx-auto">
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mx-auto text-xl font-bold">
              ⚠️
            </div>
            <h3 className="text-sm font-bold text-slate-800">Failed to Load Orders</h3>
            <p className="text-xs text-slate-500">{error}</p>
            <Button variant="outline" size="sm" onClick={() => fetchOrders(true)}>
              Retry Connection
            </Button>
          </div>
        ) : filteredOrders.length === 0 ? (
          /* Empty State */
          <div className="py-16 text-center space-y-3 max-w-md mx-auto">
            <span className="text-4xl block">📑</span>
            <h3 className="text-base font-bold text-slate-800">No Orders Found</h3>
            <p className="text-xs text-slate-500">
              {statusFilter !== 'ALL' || searchQuery
                ? 'No orders match the current filter or search criteria.'
                : 'No customer orders have been placed in the system yet.'}
            </p>
            {(statusFilter !== 'ALL' || searchQuery) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter('ALL');
                  setSearchQuery('');
                  setDateFilter('ALL');
                  setCurrentPage(0);
                }}
              >
                Clear Search & Filters
              </Button>
            )}
          </div>
        ) : (
          /* Orders Table */
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-left border-collapse text-xs min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500 bg-slate-50/70">
                  <th className="py-3 px-6">Order #</th>
                  <th className="py-3 px-4">Customer Details</th>
                  <th className="py-3 px-4">Order Date</th>
                  <th className="py-3 px-4">Fulfillment Hub</th>
                  <th className="py-3 px-4 text-center">Items</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredOrders.map((order) => {
                  const totalUnits = (order.items || []).reduce(
                    (acc, item) => acc + (Number(item.quantity) || 0),
                    0
                  );

                  return (
                    <tr
                      key={order.id}
                      onClick={() => handleOpenDetails(order.id)}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                    >
                      {/* Order ID */}
                      <td className="py-3.5 px-6 font-bold text-slate-900 whitespace-nowrap">
                        <span className="text-indigo-600 group-hover:underline">
                          #{order.id}
                        </span>
                      </td>

                      {/* Customer Details */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold block truncate max-w-[150px] text-slate-900">
                          {order.customerName || 'Customer'}
                        </span>
                        <span className="text-[10px] text-slate-400 block truncate max-w-[150px]">
                          {order.customerEmail}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        <span className="block font-medium text-slate-700">
                          {formatDate(order.createdAt)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(order.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>

                      {/* Fulfillment Hub */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {order.warehouseName ? (
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <span>🏢</span>
                            <span className="font-medium truncate max-w-[130px]">
                              {order.warehouseName}
                            </span>
                          </div>
                        ) : order.status === 'REJECTED' ? (
                          <span className="text-[10px] text-rose-500 font-medium">
                            Allocation Failed
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Awaiting Allocation
                          </span>
                        )}
                      </td>

                      {/* Number of Items */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className="font-semibold text-slate-800">
                          {order.items?.length || 0}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          ({totalUnits} {totalUnits === 1 ? 'unit' : 'units'})
                        </span>
                      </td>

                      {/* Total Amount */}
                      <td className="py-3.5 px-4 text-right font-extrabold text-slate-900 whitespace-nowrap">
                        {formatCurrency(order.totalAmount)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {getStatusBadge(order.status)}
                        {order.status === 'CANCELLED' && (
                          <span className="block text-[10px] text-slate-500 font-medium mt-0.5">
                            {order.cancelledByRole === 'ADMIN'
                              ? 'By Admin'
                              : order.cancelledByRole === 'CUSTOMER'
                              ? 'By Customer'
                              : 'Actor unavailable'}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td
                        className="py-3.5 px-6 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-indigo-600 hover:text-indigo-800"
                            onClick={() => handleOpenDetails(order.id)}
                          >
                            Details
                          </Button>

                          {isCancellable(order.status) && (
                            <Button
                              variant="danger"
                              size="sm"
                              className="text-xs px-2.5 py-1"
                              onClick={(e) => handleInitiateCancel(order, e)}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Server-Side Pagination Bar */}
        {!loading && pageInfo.totalPages > 1 && (
          <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div>
              Showing orders{' '}
              <span className="font-bold text-slate-900">
                {pageInfo.pageNumber * pageInfo.pageSize + 1}
              </span>{' '}
              to{' '}
              <span className="font-bold text-slate-900">
                {Math.min(
                  (pageInfo.pageNumber + 1) * pageInfo.pageSize,
                  pageInfo.totalElements
                )}
              </span>{' '}
              of{' '}
              <span className="font-bold text-slate-900">
                {pageInfo.totalElements}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={pageInfo.first || currentPage === 0}
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                className="text-xs"
              >
                ← Previous
              </Button>

              <div className="flex items-center gap-1 px-2 font-medium">
                Page {pageInfo.pageNumber + 1} of {pageInfo.totalPages}
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={pageInfo.last || currentPage >= pageInfo.totalPages - 1}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="text-xs"
              >
                Next →
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ======================================================================= */}
      {/* ORDER DETAILS MODAL                                                     */}
      {/* ======================================================================= */}
      {isDetailsModalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-fadeIn"
          onClick={handleCloseDetails}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden transform transition-all p-6 sm:p-8 space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                    Order #{selectedOrder?.id || '...'}
                  </h2>
                  {selectedOrder && getStatusBadge(selectedOrder.status)}
                </div>
                <p className="text-xs text-slate-500">
                  Authoritative record from Spring Boot Order Service & MySQL Database.
                </p>
              </div>

              <button
                onClick={handleCloseDetails}
                className="text-slate-400 hover:text-slate-700 text-2xl font-bold p-1 rounded-lg"
                aria-label="Close details"
              >
                ✕
              </button>
            </div>

            {isLoadingDetails ? (
              <div className="py-12 text-center space-y-2">
                <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-500">Fetching live order specifications...</p>
              </div>
            ) : selectedOrder ? (
              <div className="space-y-6">
                {/* Order Lifecycle Visual Tracker */}
                <OrderStatusTracker
                  status={selectedOrder.status}
                  cancelledByRole={selectedOrder.cancelledByRole}
                  createdAt={selectedOrder.createdAt}
                  updatedAt={selectedOrder.updatedAt}
                  warehouseName={selectedOrder.warehouseName}
                  onRefresh={() => handleOpenDetails(selectedOrder.id)}
                  isRefreshing={isLoadingDetails}
                />

                {/* Metadata Summary Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-400 block font-medium uppercase text-[10px]">
                      Customer Profile
                    </span>
                    <span className="font-bold text-slate-900 block mt-0.5">
                      {selectedOrder.customerName || 'N/A'}
                    </span>
                    <span className="text-slate-500 block truncate">
                      {selectedOrder.customerEmail}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      User ID: #{selectedOrder.userId}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block font-medium uppercase text-[10px]">
                      Fulfillment Routing
                    </span>
                    <span className="font-bold text-slate-900 block mt-0.5">
                      {selectedOrder.warehouseName || 'Pending Assignment'}
                    </span>
                    <span className="text-slate-500 block">
                      {selectedOrder.warehouseId
                        ? `Warehouse Hub ID: #${selectedOrder.warehouseId}`
                        : 'Unassigned (Awaiting Kafka allocation)'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block font-medium uppercase text-[10px]">
                      Timestamps
                    </span>
                    <span className="text-slate-700 block mt-0.5">
                      Placed: <span className="font-semibold">{formatDate(selectedOrder.createdAt)}</span>
                    </span>
                    <span className="text-slate-500 block text-[10px]">
                      Updated: {formatDate(selectedOrder.updatedAt)}
                    </span>
                  </div>
                </div>

                {/* Ordered Items Breakdown */}
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between">
                    <span>Products Ordered ({selectedOrder.items?.length || 0})</span>
                    <span className="text-xs text-slate-500 font-normal">
                      Snapshot at time of order creation
                    </span>
                  </h3>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                          <th className="py-2.5 px-4">Item</th>
                          <th className="py-2.5 px-3">SKU</th>
                          <th className="py-2.5 px-3 text-right">Unit Price</th>
                          <th className="py-2.5 px-3 text-center">Qty</th>
                          <th className="py-2.5 px-4 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        {(selectedOrder.items || []).map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/50">
                            <td className="py-3 px-4 font-semibold text-slate-900">
                              {item.productName}
                            </td>
                            <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                              {item.productSku}
                            </td>
                            <td className="py-3 px-3 text-right text-slate-700">
                              {formatCurrency(item.unitPrice)}
                            </td>
                            <td className="py-3 px-3 text-center font-bold text-slate-900">
                              {item.quantity}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-slate-900">
                              {formatCurrency(item.subtotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50/90 border-t border-slate-200">
                          <td colSpan="4" className="py-3 px-4 text-right font-bold text-slate-700">
                            Authoritative Order Total:
                          </td>
                          <td className="py-3 px-4 text-right font-extrabold text-indigo-700 text-sm">
                            {formatCurrency(selectedOrder.totalAmount)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Modal Footer Controls */}
                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-500">
                    {selectedOrder.status === 'CONFIRMED' && (
                      <span className="text-emerald-700 font-medium">
                        ✓ Inventory reserved at {selectedOrder.warehouseName}. Cancellation will release buffer.
                      </span>
                    )}
                    {selectedOrder.status === 'PENDING' && (
                      <span className="text-amber-700 font-medium">
                        ⏳ Order in-flight; Kafka consumer is evaluating stock allocation.
                      </span>
                    )}
                    {selectedOrder.status === 'REJECTED' && (
                      <span className="text-rose-600 font-medium">
                        ✕ Order rejected during event-driven stock evaluation (insufficient stock).
                      </span>
                    )}
                    {selectedOrder.status === 'CANCELLED' && (
                      <span className="text-slate-600 font-medium">
                        ✓ {selectedOrder.cancelledByRole === 'ADMIN'
                            ? 'Order cancelled by Admin; stock allocations successfully reversed.'
                            : selectedOrder.cancelledByRole === 'CUSTOMER'
                            ? 'Order cancelled by Customer; stock allocations successfully reversed.'
                            : 'Order cancelled (cancellation actor unavailable); stock allocations successfully reversed.'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                    {isCancellable(selectedOrder.status) && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={(e) => handleInitiateCancel(selectedOrder, e)}
                      >
                        Cancel Order
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={handleCloseDetails}>
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* CONFIRMATION MODAL FOR CANCELLATION                                     */}
      {/* ======================================================================= */}
      <ConfirmationModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirm={handleConfirmCancel}
        title={`Cancel Order #${orderToCancel?.id}?`}
        message={`Are you sure you want to cancel order #${orderToCancel?.id} for customer ${orderToCancel?.customerName || ''}?`}
        confirmText="Confirm Cancellation"
        cancelText="Abort"
        confirmVariant="danger"
        isLoading={isCancelling}
      >
        <div className="space-y-2 pt-1 text-slate-600">
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-800 space-y-1">
            <span className="font-bold block">Backend Business Logic Execution:</span>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>
                Calls <code className="font-mono text-amber-900">POST /api/v1/admin/orders/{orderToCancel?.id}/cancel</code>.
              </li>
              <li>
                If status is <span className="font-semibold">CONFIRMED</span>, Spring Boot executes an atomic compensation transaction restoring reserved stock at the designated warehouse hub.
              </li>
              <li>Terminal statuses (CANCELLED or REJECTED) cannot be reversed.</li>
            </ul>
          </div>

          <div className="flex items-center justify-between text-xs pt-2">
            <span className="text-slate-500">Total Order Value:</span>
            <span className="font-bold text-slate-900">
              {formatCurrency(orderToCancel?.totalAmount)}
            </span>
          </div>
        </div>
      </ConfirmationModal>
    </div>
  );
}
