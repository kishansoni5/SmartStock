import React from 'react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { formatDate } from '../../utils/formatters';

export default function OrderStatusTracker({
  status = 'PENDING',
  cancelledByRole,
  createdAt,
  updatedAt,
  warehouseName,
  onRefresh,
  isRefreshing = false,
}) {
  const isPending = status === 'PENDING';
  const isConfirmed = status === 'CONFIRMED';
  const isRejected = status === 'REJECTED';
  const isCancelled = status === 'CANCELLED';

  // Badge mapping
  const renderBadge = () => {
    switch (status) {
      case 'CONFIRMED':
        return <Badge variant="success" size="md">CONFIRMED</Badge>;
      case 'PENDING':
        return <Badge variant="warning" size="md">PENDING ALLOCATION</Badge>;
      case 'REJECTED':
        return <Badge variant="danger" size="md">REJECTED (OUT OF STOCK)</Badge>;
      case 'CANCELLED':
        return <Badge variant="neutral" size="md">CANCELLED</Badge>;
      default:
        return <Badge variant="neutral" size="md">{status}</Badge>;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-xs">
      {/* Header bar with Status and Refresh trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Fulfillment Lifecycle
          </span>
          <div className="flex items-center gap-3 mt-1">
            <h3 className="text-lg font-bold text-slate-900">Order Processing Status</h3>
            {renderBadge()}
          </div>
        </div>

        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-xs self-start sm:self-auto"
          >
            {isRefreshing ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                Checking Kafka Pipeline...
              </span>
            ) : (
              '🔄 Refresh Status'
            )}
          </Button>
        )}
      </div>

      {/* Visual Step Progress Tracker */}
      <div className="relative py-2">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-0 relative">
          {/* Connector line for desktop */}
          <div className="hidden md:block absolute top-6 left-1/6 right-1/6 h-0.5 bg-slate-200 -z-0" />

          {/* STEP 1: Order Placed */}
          <div className="flex md:flex-col items-center md:text-center gap-4 md:gap-2 relative z-10">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 border-2 border-emerald-500 flex items-center justify-center font-bold text-lg shrink-0 shadow-xs">
              ✓
            </div>
            <div>
              <p className="font-bold text-sm text-slate-900">1. Order Placed</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {formatDate(createdAt)}
              </p>
              <span className="inline-block mt-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Transaction Persisted
              </span>
            </div>
          </div>

          {/* STEP 2: Kafka Inventory Check */}
          <div className="flex md:flex-col items-center md:text-center gap-4 md:gap-2 relative z-10">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shrink-0 shadow-xs border-2 ${
                isConfirmed
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-500'
                  : isRejected
                  ? 'bg-rose-50 text-rose-600 border-rose-500'
                  : isCancelled
                  ? 'bg-slate-100 text-slate-400 border-slate-300'
                  : 'bg-amber-50 text-amber-600 border-amber-500 animate-pulse'
              }`}
            >
              {isConfirmed ? '✓' : isRejected ? '✕' : isCancelled ? '—' : '⚡'}
            </div>
            <div>
              <p className="font-bold text-sm text-slate-900">2. Stock Allocation</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {isConfirmed
                  ? `Reserved at ${warehouseName || 'Hub'}`
                  : isRejected
                  ? 'Insufficient warehouse stock'
                  : isCancelled
                  ? 'Stock released back'
                  : 'Kafka consumer verifying stock...'}
              </p>
              <span
                className={`inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                  isConfirmed
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : isRejected
                    ? 'text-rose-700 bg-rose-50 border-rose-200'
                    : isCancelled
                    ? 'text-slate-600 bg-slate-100 border-slate-200'
                    : 'text-amber-700 bg-amber-50 border-amber-200'
                }`}
              >
                {isConfirmed
                  ? 'Inventory Reserved'
                  : isRejected
                  ? 'Out of Stock'
                  : isCancelled
                  ? 'Cancelled'
                  : 'Kafka Pipeline Evaluating'}
              </span>
            </div>
          </div>

          {/* STEP 3: Order Outcome */}
          <div className="flex md:flex-col items-center md:text-center gap-4 md:gap-2 relative z-10">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shrink-0 shadow-xs border-2 ${
                isConfirmed
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-500'
                  : isRejected
                  ? 'bg-rose-50 text-rose-600 border-rose-500'
                  : isCancelled
                  ? 'bg-slate-100 text-slate-400 border-slate-300'
                  : 'bg-slate-50 text-slate-300 border-slate-200'
              }`}
            >
              {isConfirmed ? '📦' : isRejected ? '❌' : isCancelled ? '🚫' : '⏳'}
            </div>
            <div>
              <p className="font-bold text-sm text-slate-900">3. Final Status</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {isConfirmed
                  ? 'Confirmed & Ready for Hub Dispatch'
                  : isRejected
                  ? 'Order Rejected by System'
                  : isCancelled
                  ? (cancelledByRole === 'ADMIN'
                      ? 'Cancelled by Admin'
                      : cancelledByRole === 'CUSTOMER'
                      ? 'Cancelled by Customer'
                      : 'Cancellation actor unavailable')
                  : 'Awaiting Pipeline Confirmation'}
              </p>
              <span
                className={`inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                  isConfirmed
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : isRejected
                    ? 'text-rose-700 bg-rose-50 border-rose-200'
                    : isCancelled
                    ? 'text-slate-600 bg-slate-100 border-slate-200'
                    : 'text-slate-500 bg-slate-50 border-slate-200'
                }`}
              >
                {isConfirmed
                  ? 'CONFIRMED'
                  : isRejected
                  ? 'REJECTED'
                  : isCancelled
                  ? 'CANCELLED'
                  : 'PENDING'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Explanatory Architecture Banner */}
      <div
        className={`p-4 rounded-xl border text-xs space-y-1.5 ${
          isConfirmed
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
            : isRejected
            ? 'bg-rose-50/70 border-rose-200 text-rose-800'
            : isCancelled
            ? 'bg-slate-50 border-slate-200 text-slate-700'
            : 'bg-amber-50/70 border-amber-200 text-amber-800'
        }`}
      >
        <div className="flex items-center gap-2 font-semibold">
          <span>{isConfirmed ? '✅' : isRejected ? '❌' : isCancelled ? 'ℹ️' : '⚡'}</span>
          <span>
            {isConfirmed
              ? `Order confirmed and reserved at ${warehouseName || 'Hub'}`
              : isRejected
              ? 'Order rejected due to lack of warehouse stock'
              : isCancelled
              ? (cancelledByRole === 'ADMIN'
                  ? 'This order has been cancelled by an administrator'
                  : cancelledByRole === 'CUSTOMER'
                  ? 'This order has been cancelled by the customer'
                  : 'This order has been cancelled (cancellation actor unavailable)')
              : 'Order is currently pending Kafka inventory reservation'}
          </span>
        </div>
        <p className="leading-relaxed">
          {isConfirmed &&
            `The event consumer successfully confirmed your order and allocated physical inventory at ${warehouseName || 'Distribution Hub'}.`}
          {isRejected &&
            'The Kafka inventory consumer checked all distribution centers (Surat Hub and Mumbai Hub) and found insufficient stock to satisfy the requested item quantities.'}
          {isCancelled &&
            (cancelledByRole === 'ADMIN'
              ? 'The order was cancelled by an administrator. Any previously reserved stock has been automatically returned to warehouse inventory via compensating transaction.'
              : cancelledByRole === 'CUSTOMER'
              ? 'The order was cancelled by the customer. Any previously reserved stock has been automatically returned to warehouse inventory via compensating transaction.'
              : 'The order was cancelled (cancellation actor unavailable). Any previously reserved stock has been automatically returned to warehouse inventory via compensating transaction.')}
          {isPending &&
            'SmartStock uses asynchronous event-driven architecture. The order is stored in a PENDING state and emitted to Apache Kafka. The inventory consumer evaluates stock across warehouse hubs before confirming.'}
        </p>
        {updatedAt && (
          <p className="text-[11px] text-slate-400 pt-1">
            Last status transition: {formatDate(updatedAt)}
          </p>
        )}
      </div>
    </div>
  );
}
