import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Card from '../../components/common/Card';
import { formatCurrency } from '../../utils/formatters';

export default function Cart() {
  const { cartItems, totalItems, cartSubtotal, updateQuantity, removeFromCart, clearCart } = useCart();
  const navigate = useNavigate();

  if (cartItems.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-5 shadow-xs">
          <div className="w-20 h-20 rounded-3xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto text-4xl shadow-xs">
            🛒
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Your Shopping Cart is Empty</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Explore our enterprise catalog to select verified products and hardware items for fulfillment.
            </p>
          </div>
          <div>
            <Link to="/products">
              <Button variant="primary" size="lg">
                Browse Product Catalogue →
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Shopping Cart
            </h1>
            <Badge variant="primary">{totalItems} {totalItems === 1 ? 'Item' : 'Items'}</Badge>
          </div>
          <p className="text-sm text-slate-500">
            Review your selected warehouse items, adjust quantities, and proceed to order placement.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={clearCart}
            className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:underline transition-colors flex items-center gap-1"
          >
            <span>🗑️</span> Clear Cart
          </button>
          <Link to="/products">
            <Button variant="outline" size="sm">
              ← Continue Shopping
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Grid: Cart Items (8 cols) + Order Summary (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Cart Table/List */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500 bg-slate-50/70">
                    <th className="py-3.5 px-4 sm:px-6">Product Details</th>
                    <th className="py-3.5 px-4 text-center">Unit Price</th>
                    <th className="py-3.5 px-4 text-center">Quantity</th>
                    <th className="py-3.5 px-4 text-right">Subtotal</th>
                    <th className="py-3.5 px-4 text-center">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {cartItems.map((item) => {
                    const itemSubtotal = item.price * item.quantity;
                    return (
                      <tr key={item.productId} className="hover:bg-slate-50/50 transition-colors">
                        {/* Product Info */}
                        <td className="py-4 px-4 sm:px-6">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl shrink-0">
                              📦
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-semibold text-slate-900 line-clamp-1">{item.name}</h4>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="font-mono text-xs font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                  {item.sku}
                                </span>
                                {item.categoryName && (
                                  <span className="text-xs text-slate-400">
                                    • {item.categoryName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Unit Price */}
                        <td className="py-4 px-4 text-center font-medium text-slate-800 whitespace-nowrap">
                          {formatCurrency(item.price)}
                        </td>

                        {/* Quantity Controls */}
                        <td className="py-4 px-4 text-center">
                          <div className="inline-flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                              className="w-7 h-7 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold flex items-center justify-center transition-colors"
                              aria-label="Decrease quantity"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val) && val >= 1) {
                                  updateQuantity(item.productId, val);
                                }
                              }}
                              className="w-11 h-7 text-center text-xs font-semibold text-slate-800 border-x border-slate-300 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                              className="w-7 h-7 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold flex items-center justify-center transition-colors"
                              aria-label="Increase quantity"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        {/* Subtotal */}
                        <td className="py-4 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                          {formatCurrency(itemSubtotal)}
                        </td>

                        {/* Remove Action */}
                        <td className="py-4 px-4 text-center">
                          <button
                            onClick={() => removeFromCart(item.productId)}
                            className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center mx-auto transition-colors"
                            aria-label={`Remove ${item.name} from cart`}
                            title="Remove from cart"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Order Summary Card */}
        <div className="lg:col-span-4 space-y-4">
          <Card title="Order Summary" subtitle="Estimated pricing breakdown">
            <div className="space-y-4">
              <div className="space-y-2.5 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Subtotal ({totalItems} items)</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(cartSubtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Enterprise Logistics</span>
                  <span className="text-emerald-600 font-semibold">FREE</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Warehouse Tax Allocation</span>
                  <span>Calculated at checkout</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-baseline justify-between">
                <div>
                  <span className="text-base font-bold text-slate-900 block">Estimated Total</span>
                  <span className="text-[11px] text-slate-400">INR Currency</span>
                </div>
                <span className="text-2xl font-black text-slate-900 tracking-tight">
                  {formatCurrency(cartSubtotal)}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500 leading-relaxed">
                <strong className="text-slate-700 block mb-0.5">Authoritative Pricing Notice:</strong>
                Subtotal is an estimate. Spring Boot securely verifies database prices when creating your order.
              </div>

              <Button
                variant="primary"
                size="lg"
                className="w-full text-base font-semibold shadow-sm"
                onClick={() => navigate('/checkout')}
              >
                Proceed to Checkout →
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
