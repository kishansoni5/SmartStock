import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getOrderById, cancelOrder } from '../../api/orderService';
import { useAuth } from '../../context/AuthContext';
import OrderStatusTracker from '../../components/orders/OrderStatusTracker';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Cancellation State
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState({ type: '', message: '' });

  const fetchOrder = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const data = await getOrderById(id);
        if (data) {
          setOrder(data);
        } else {
          setError({ status: 404, message: `Order #${id} not found.` });
        }
      } catch (err) {
        console.error('Failed to fetch order details:', err);
        // axiosInstance response error object structure
        const status = err?.status || (err?.message?.includes('403') || err?.message?.includes('denied') ? 403 : 500);
        setError({
          status,
          message:
            err?.message ||
            (status === 403
              ? 'Access denied: You do not have permission to view this order.'
              : 'Failed to retrieve order details from backend.'),
        });
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [id]
  );

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Handle Cancellation
  const handleConfirmCancel = async () => {
    if (!order?.id || isCancelling) return;

    setIsCancelling(true);
    setCancelFeedback({ type: '', message: '' });

    try {
      const updatedOrder = await cancelOrder(order.id);
      if (updatedOrder) {
        setOrder(updatedOrder);
        setCancelFeedback({
          type: 'success',
          message: `Order #${order.id} has been successfully cancelled. Reserved inventory was compensated and released.`,
        });
        setIsCancelModalOpen(false);
      }
    } catch (err) {
      console.error('Cancellation failed:', err);
      setCancelFeedback({
        type: 'error',
        message: err?.message || 'Failed to cancel order. Please verify order status and try again.',
      });
      setIsCancelModalOpen(false);
    } finally {
      setIsCancelling(false);
    }
  };

  // =========================================================================
  // VIEW: Loading State
  // =========================================================================
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-16 text-center space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-medium text-slate-600">
          Retrieving order #{id} details from backend...
        </p>
      </div>
    );
  }

  // =========================================================================
  // VIEW: Error & Access Denied States
  // =========================================================================
  if (error) {
    const isAccessDenied =
      error.status === 403 ||
      (error.message && error.message.toLowerCase().includes('access denied'));

    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-4 shadow-xs">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto text-3xl ${
              isAccessDenied
                ? 'bg-rose-50 text-rose-600 border border-rose-100'
                : 'bg-amber-50 text-amber-600 border border-amber-100'
            }`}
          >
            {isAccessDenied ? '🔒' : '⚠️'}
          </div>

          <h2 className="text-xl font-bold text-slate-900">
            {isAccessDenied ? 'Access Denied (403 Forbidden)' : 'Order Not Found'}
          </h2>

          <p className="text-sm text-slate-500 max-w-md mx-auto">
            {isAccessDenied
              ? 'You do not have permission to view or manage this order. This order was placed by another customer account.'
              : error.message || `We could not find an order matching #${id}.`}
          </p>

          <div className="pt-3 flex items-center justify-center gap-3">
            <Link to="/orders">
              <Button variant="outline" size="sm">
                ← Back to Order History
              </Button>
            </Link>
            {!isAccessDenied && (
              <Button variant="primary" size="sm" onClick={() => fetchOrder()}>
                Retry
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!order) return null;

  // Determine if cancellation is allowed by backend business rules
  // Backend rule: Cannot cancel if CANCELLED or REJECTED. Allowed if PENDING or CONFIRMED.
  const canCancel = order.status === 'PENDING' || order.status === 'CONFIRMED';

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              to="/orders"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              ← All Orders
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-semibold text-slate-500">Order #{order.id}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Order Tracking & Details
          </h1>
          <p className="text-xs text-slate-500">
            Placed on {formatDate(order.createdAt)} • Order ID #{order.id}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canCancel && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setIsCancelModalOpen(true)}
              disabled={isCancelling}
            >
              Cancel Order
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchOrder(true)}
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Refreshing...' : '🔄 Refresh Status'}
          </Button>
        </div>
      </div>

      {/* Cancellation Success / Error Feedback Alert */}
      {cancelFeedback.message && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-start gap-3 shadow-xs ${
            cancelFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span className="text-lg font-bold">
            {cancelFeedback.type === 'success' ? '✅' : '⚠️'}
          </span>
          <div className="flex-1">
            <h4 className="font-semibold">
              {cancelFeedback.type === 'success' ? 'Cancellation Succeeded' : 'Cancellation Error'}
            </h4>
            <p className="text-xs mt-0.5">{cancelFeedback.message}</p>
          </div>
          <button
            onClick={() => setCancelFeedback({ type: '', message: '' })}
            className="text-slate-400 hover:text-slate-600 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* 1. VISUAL ORDER STATUS TRACKER COMPONENT */}
      <OrderStatusTracker
        status={order.status}
        cancelledByRole={order.cancelledByRole}
        createdAt={order.createdAt}
        updatedAt={order.updatedAt}
        warehouseName={order.warehouseName}
        onRefresh={() => fetchOrder(true)}
        isRefreshing={isRefreshing}
      />

      {/* 2. MAIN GRID: Items & Breakdown (7 cols) + Fulfillment & Customer (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Order Items & Pricing Breakdown */}
        <div className="lg:col-span-8 space-y-6">
          <Card
            title={`Order Items (${(order.items || []).length})`}
            subtitle="Authoritative product quantities and line item totals"
            action={<Badge variant="neutral">Verified by Spring Boot</Badge>}
          >
            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-left border-collapse text-sm min-w-[550px]">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500 bg-slate-50/70">
                    <th className="py-2.5 px-6">Product</th>
                    <th className="py-2.5 px-4 text-center">SKU</th>
                    <th className="py-2.5 px-4 text-center">Qty</th>
                    <th className="py-2.5 px-4 text-right">Unit Price</th>
                    <th className="py-2.5 px-6 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(order.items || []).map((item) => (
                    <tr key={item.id || item.productId} className="hover:bg-slate-50/60">
                      <td className="py-3.5 px-6 font-semibold text-slate-900">
                        {item.productName}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-xs text-slate-500">
                        {item.productSku}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                        {item.quantity}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-600">
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="py-3.5 px-6 text-right font-extrabold text-slate-900">
                        {formatCurrency(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pricing Summary */}
            <div className="pt-4 border-t border-slate-200 space-y-2 text-sm">
              <div className="flex items-center justify-between text-slate-600">
                <span>Items Subtotal</span>
                <span className="font-semibold text-slate-900">
                  {formatCurrency(order.totalAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Warehouse Logistics & Handling</span>
                <span className="font-semibold text-emerald-600">FREE</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex items-baseline justify-between">
                <span className="text-base font-bold text-slate-900">Authoritative Order Total</span>
                <span className="text-2xl font-black text-slate-900">
                  {formatCurrency(order.totalAmount)}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Customer Info & Warehouse Allocation Details */}
        <div className="lg:col-span-4 space-y-5">
          {/* Fulfillment Hub Card */}
          <Card title="Distribution Hub" subtitle="Inventory allocation result">
            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <span className="text-slate-400 block font-medium">Assigned Hub</span>
                <span className="font-bold text-slate-900 text-sm block">
                  {order.warehouseName ? (
                    <span className="text-emerald-700 flex items-center gap-1.5">
                      <span>📍</span> {order.warehouseName}
                    </span>
                  ) : order.status === 'REJECTED' ? (
                    <span className="text-rose-600">None (Out of Stock)</span>
                  ) : order.status === 'CANCELLED' ? (
                    <span className="text-slate-500">None (Cancelled)</span>
                  ) : (
                    <span className="text-amber-600 animate-pulse">Pending Kafka Allocation</span>
                  )}
                </span>
                {order.warehouseId && (
                  <span className="text-[11px] text-slate-400 block">
                    Warehouse ID: #{order.warehouseId}
                  </span>
                )}
              </div>

              <div className="text-slate-500 leading-relaxed space-y-1">
                <p>
                  <strong>Routing Policy:</strong> SmartStock evaluates Surat Hub as primary center and Mumbai Hub as secondary fallback.
                </p>
              </div>
            </div>
          </Card>

          {/* Authenticated Customer Information Card */}
          <Card title="Customer Account" subtitle="Associated order ownership">
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-400 block font-medium">Customer Name</span>
                <span className="font-semibold text-slate-800 text-sm mt-0.5 block">
                  {order.customerName || user?.name}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-400 block font-medium">Email Address</span>
                <span className="font-semibold text-slate-800 text-sm mt-0.5 block">
                  {order.customerEmail || user?.email}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-400 block font-medium">Account ID</span>
                <span className="font-mono text-slate-700 mt-0.5 block">
                  User ID #{order.userId}
                </span>
              </div>
            </div>
          </Card>

          {/* Cancellation Policy Card */}
          <Card title="Cancellation Rules" subtitle="Backend business logic">
            <div className="text-xs text-slate-600 space-y-2">
              <p>
                Orders in <strong className="text-amber-700">PENDING</strong> or{' '}
                <strong className="text-emerald-700">CONFIRMED</strong> state may be cancelled by the customer.
              </p>
              <p>
                When a confirmed order is cancelled, Spring Boot immediately releases the reserved stock back to the warehouse inventory via compensating transaction.
              </p>
              {!canCancel && (
                <div className="p-2.5 rounded-lg bg-slate-100 text-slate-500 text-[11px] font-medium">
                  {order.status === 'CANCELLED'
                    ? (order.cancelledByRole === 'ADMIN'
                        ? 'This order was cancelled by an administrator.'
                        : order.cancelledByRole === 'CUSTOMER'
                        ? 'This order was cancelled by the customer.'
                        : 'This order was cancelled (cancellation actor unavailable).')
                    : 'Rejected orders cannot be cancelled.'}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* CONFIRMATION MODAL FOR CANCELLATION */}
      <ConfirmationModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirm={handleConfirmCancel}
        title={`Cancel Order #${order.id}?`}
        message="Are you sure you want to cancel this order? This action cannot be undone."
        confirmText="Yes, Cancel Order"
        cancelText="Keep Order"
        confirmVariant="danger"
        isLoading={isCancelling}
      >
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs space-y-1">
          <p className="font-semibold">Backend Compensation Notice:</p>
          <p>
            {order.status === 'CONFIRMED'
              ? `This order has reserved stock at ${order.warehouseName || 'Warehouse'}. Cancelling will invoke the backend compensation workflow, releasing all reserved units back to available inventory.`
              : 'This order is currently pending in the Kafka pipeline. Cancelling will transition the status to CANCELLED.'}
          </p>
        </div>
      </ConfirmationModal>
    </div>
  );
}
