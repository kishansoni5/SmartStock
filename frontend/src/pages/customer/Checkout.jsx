import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { createOrder, getOrderById } from '../../api/orderService';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Card from '../../components/common/Card';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function Checkout() {
  const { cartItems, totalItems, cartSubtotal, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Submission & Confirmation State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [createdOrder, setCreatedOrder] = useState(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // If cart is empty and no order was just placed, show redirect view
  if (cartItems.length === 0 && !createdOrder) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-4 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-3xl">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-slate-900">Your cart is empty</h2>
          <p className="text-sm text-slate-500">
            Please add items from the product catalogue before proceeding to checkout.
          </p>
          <div className="pt-2">
            <Link to="/products">
              <Button variant="primary">Return to Product Catalogue</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Handle Order Placement
  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (isSubmitting || cartItems.length === 0) return;

    setErrorMessage('');
    setIsSubmitting(true);

    // Build exact backend payload: { items: [{ productId, quantity }] }
    const orderPayload = {
      items: cartItems.map((item) => ({
        productId: Number(item.productId),
        quantity: Number(item.quantity),
      })),
    };

    try {
      // Spring Boot returns 201 Created with ApiResponse<OrderResponse>
      const responseData = await createOrder(orderPayload);

      // Verify that backend returned the order object
      if (responseData && responseData.id) {
        setCreatedOrder(responseData);
        // Clear cart ONLY after successful persistence
        clearCart();
      } else {
        throw new Error('Order creation succeeded but response format was unexpected.');
      }
    } catch (err) {
      console.error('Order creation failed:', err);
      // err is unwrapped ApiResponse from axiosInstance interceptor
      setErrorMessage(
        err?.message ||
          'Failed to place order. A product may be inactive, out of stock, or your session has expired.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Poll / Check latest status of the created order
  const handleRefreshStatus = async () => {
    if (!createdOrder?.id) return;
    setIsCheckingStatus(true);
    setStatusMessage('');

    try {
      const refreshed = await getOrderById(createdOrder.id);
      if (refreshed) {
        setCreatedOrder(refreshed);
        if (refreshed.status === 'CONFIRMED') {
          setStatusMessage(
            `Order CONFIRMED! Stock allocated at ${refreshed.warehouseName || 'Warehouse Hub'}.`
          );
        } else if (refreshed.status === 'REJECTED') {
          setStatusMessage('Order REJECTED by Kafka consumer due to insufficient warehouse stock.');
        } else {
          setStatusMessage('Order is currently PENDING inventory allocation in the Kafka pipeline.');
        }
      }
    } catch (err) {
      console.error('Failed to refresh status:', err);
      setStatusMessage('Unable to refresh order status. Please try again.');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // =========================================================================
  // VIEW: Order Confirmation Screen (After successful placement)
  // =========================================================================
  if (createdOrder) {
    const isConfirmed = createdOrder.status === 'CONFIRMED';
    const isRejected = createdOrder.status === 'REJECTED';
    const isPending = createdOrder.status === 'PENDING';

    return (
      <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          {/* Header Callout */}
          <div className="text-center space-y-3 pb-6 border-b border-slate-100">
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto text-3xl ${
                isConfirmed
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                  : isRejected
                  ? 'bg-rose-50 text-rose-600 border border-rose-100'
                  : 'bg-indigo-50 text-indigo-600 border border-indigo-100 animate-pulse'
              }`}
            >
              {isConfirmed ? '✅' : isRejected ? '❌' : '⚡'}
            </div>

            <div className="space-y-1">
              <span className="text-xs uppercase font-semibold tracking-wider text-slate-400">
                Order Placement Result
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Order #{createdOrder.id} Placed
              </h2>
              <p className="text-sm text-slate-500">
                Created on {formatDate(createdOrder.createdAt)}
              </p>
            </div>

            {/* Asynchronous Status Indicator */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold">
              <span className="text-slate-500">Current Status:</span>
              <Badge
                variant={isConfirmed ? 'success' : isRejected ? 'danger' : 'warning'}
                size="md"
              >
                {createdOrder.status}
              </Badge>
            </div>
          </div>

          {/* Asynchronous Pipeline Notice */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                <span>🔄</span> Event-Driven Pipeline Lifecycle
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshStatus}
                disabled={isCheckingStatus}
                className="text-xs"
              >
                {isCheckingStatus ? 'Checking...' : 'Check Pipeline Status'}
              </Button>
            </div>
            <p className="leading-relaxed">
              SmartStock uses an asynchronous event-driven architecture. The order is transactionally saved in a <strong>PENDING</strong> state and emitted to Apache Kafka. The inventory consumer verifies warehouse stock and confirms or rejects the order asynchronously.
            </p>
            {statusMessage && (
              <p className="font-semibold text-indigo-600 pt-1">{statusMessage}</p>
            )}
            {createdOrder.warehouseName && (
              <div className="pt-1 text-emerald-700 font-medium">
                📍 Assigned Distribution Hub: <strong>{createdOrder.warehouseName}</strong>
              </div>
            )}
          </div>

          {/* Authoritative Order Details from Backend */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Order Items & Pricing (Verified by Backend)
            </h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                    <th className="py-2.5 px-4">Product Name</th>
                    <th className="py-2.5 px-4 text-center">SKU</th>
                    <th className="py-2.5 px-4 text-center">Qty</th>
                    <th className="py-2.5 px-4 text-right">Unit Price</th>
                    <th className="py-2.5 px-4 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(createdOrder.items || []).map((item) => (
                    <tr key={item.id}>
                      <td className="py-3 px-4 font-medium text-slate-800">{item.productName}</td>
                      <td className="py-3 px-4 text-center font-mono text-xs text-slate-500">{item.productSku}</td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-800">{item.quantity}</td>
                      <td className="py-3 px-4 text-right text-slate-600">{formatCurrency(item.unitPrice)}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">{formatCurrency(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-baseline justify-between">
                <span className="font-bold text-slate-800">Authoritative Total</span>
                <span className="text-xl font-black text-slate-900">
                  {formatCurrency(createdOrder.totalAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <span className="text-slate-400 block font-medium">Customer Name</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">{createdOrder.customerName || user?.name}</span>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 bg-white">
              <span className="text-slate-400 block font-medium">Customer Email</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">{createdOrder.customerEmail || user?.email}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <Link to={`/orders/${createdOrder.id}`}>
              <Button variant="primary" size="md">
                Track Order #{createdOrder.id} →
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Link to="/orders">
                <Button variant="outline" size="md">
                  View All Orders
                </Button>
              </Link>
              <Link to="/products">
                <Button variant="ghost" size="md">
                  Continue Shopping
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: Checkout Review & Submission Form
  // =========================================================================
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Order Checkout
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Review order items and submit your purchase to the warehouse processing pipeline.
        </p>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-3 shadow-xs">
          <span className="text-lg font-bold">⚠️</span>
          <div>
            <h4 className="font-semibold">Unable to process order</h4>
            <p className="text-xs mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Main Grid: Customer Details (7 cols) + Order Summary (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Customer & Fulfillment Details */}
        <div className="lg:col-span-7 space-y-5">
          {/* Customer Authentication Association */}
          <Card
            title="Authenticated Customer Information"
            subtitle="Order will be linked to your authenticated account"
            action={<Badge variant="success">Verified Session</Badge>}
          >
            <div className="space-y-3.5 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-xs text-slate-400 block font-medium">Customer Name</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block">{user?.name || 'Customer'}</span>
                </div>
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-xs text-slate-400 block font-medium">Account Email</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block">{user?.email || 'customer@smartstock.local'}</span>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                <span className="font-semibold text-slate-700 block mb-1">Architecture Note:</span>
                Spring Boot identifies your customer ID directly from your validated JWT bearer token. No payment gateway or manual shipping address entry is required for this enterprise warehouse fulfillment workflow.
              </div>
            </div>
          </Card>

          {/* Fulfillment Hub Policy */}
          <Card title="Warehouse Fulfillment Strategy" subtitle="Automated allocation logic">
            <div className="space-y-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                <span>Primary Distribution Center: <strong>Surat Warehouse Hub</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span>Secondary Fallback Hub: <strong>Mumbai Warehouse Hub</strong></span>
              </div>
              <p className="pt-2 text-slate-500 border-t border-slate-100 leading-relaxed">
                Orders are fulfilled on an all-or-nothing basis. If stock is unavailable at Surat, the pipeline automatically routes fulfillment to Mumbai.
              </p>
            </div>
          </Card>
        </div>

        {/* Right Column: Order Items & Placement Action */}
        <div className="lg:col-span-5 space-y-4">
          <Card title="Order Items Summary" subtitle={`${totalItems} total items to dispatch`}>
            <div className="space-y-4">
              {/* Item List */}
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto pr-1">
                {cartItems.map((item) => (
                  <div key={item.productId} className="py-2.5 flex items-center justify-between text-sm">
                    <div className="min-w-0 pr-3">
                      <p className="font-semibold text-slate-900 truncate">{item.name}</p>
                      <span className="font-mono text-xs text-slate-400">{item.sku} × {item.quantity}</span>
                    </div>
                    <span className="font-bold text-slate-800 whitespace-nowrap">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Pricing Totals */}
              <div className="pt-3 border-t border-slate-200 space-y-2 text-sm">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(cartSubtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Logistics & Handling</span>
                  <span className="text-emerald-600 font-semibold">FREE</span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex items-baseline justify-between">
                  <span className="text-base font-bold text-slate-900">Estimated Total</span>
                  <span className="text-2xl font-black text-slate-900">{formatCurrency(cartSubtotal)}</span>
                </div>
              </div>

              {/* Duplicate Submission Protection */}
              <Button
                variant="primary"
                size="lg"
                className="w-full text-base font-semibold shadow-sm"
                onClick={handlePlaceOrder}
                disabled={isSubmitting || cartItems.length === 0}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Submitting Order to Kafka...
                  </span>
                ) : (
                  `Confirm & Place Order (${totalItems} items)`
                )}
              </Button>

              <div className="text-center">
                <Link to="/cart" className="text-xs text-indigo-600 font-medium hover:underline">
                  ← Return to Cart to adjust quantities
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
