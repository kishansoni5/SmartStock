import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useCart } from '../../context/CartContext';

export default function ProductDetailsModal({ product, onClose }) {
  const { addToCart, isInCart, getItemQuantity } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [addedNotice, setAddedNotice] = useState(false);

  const inCart = isInCart(product?.id);
  const currentInCartQty = getItemQuantity(product?.id);

  // Handle ESC key press to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!product) return null;

  const handleQuantityChange = (val) => {
    const num = Math.floor(Number(val));
    if (isNaN(num) || num < 1) {
      setQuantity(1);
    } else {
      setQuantity(num);
    }
  };

  const handleAddToCart = () => {
    addToCart(product, quantity);
    setAddedNotice(true);
    setTimeout(() => setAddedNotice(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden transform transition-all animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Badge variant="primary" size="sm">
                {product.categoryName || 'Catalog Product'}
              </Badge>
              <span className="font-mono text-xs font-semibold text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded">
                {product.sku}
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {product.name}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition-colors"
            aria-label="Close details"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Price Callout */}
          <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-100 flex items-baseline justify-between">
            <div>
              <span className="text-xs uppercase font-semibold text-indigo-600 tracking-wider block">
                Standard Unit Price
              </span>
              <span className="text-2xl font-black text-slate-900">
                {formatCurrency(product.price)}
              </span>
            </div>
            <div className="text-right">
              <Badge variant="success" size="md">
                Active in Catalog
              </Badge>
              {inCart && (
                <span className="block text-[11px] font-semibold text-emerald-700 mt-1">
                  ({currentInCartQty} already in cart)
                </span>
              )}
            </div>
          </div>

          {/* Description Section */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Product Overview & Specifications
            </h4>
            <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-lg border border-slate-100">
              {product.description || 'No detailed description provided for this catalog item.'}
            </p>
          </div>

          {/* Quantity Selection & Add to Cart Controls */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 block">
              Purchase Quantity
            </span>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden w-fit">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(quantity - 1)}
                  disabled={quantity <= 1}
                  className="w-9 h-9 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  −
                </button>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  className="w-14 h-9 text-center text-sm font-semibold text-slate-800 border-x border-slate-300 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleQuantityChange(quantity + 1)}
                  className="w-9 h-9 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold flex items-center justify-center"
                >
                  +
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={addedNotice ? 'secondary' : 'primary'}
                  size="md"
                  onClick={handleAddToCart}
                  className="w-full sm:w-auto"
                >
                  {addedNotice ? '✓ Added to Cart!' : `+ Add ${quantity > 1 ? `${quantity} Items` : 'to Cart'}`}
                </Button>
                {inCart && (
                  <Link to="/cart" onClick={onClose}>
                    <Button variant="outline" size="md">
                      View Cart →
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Metadata Specifications Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/50">
              <span className="text-slate-400 block font-medium">SKU Code</span>
              <span className="font-mono font-semibold text-slate-800 mt-0.5 block">
                {product.sku}
              </span>
            </div>

            <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/50">
              <span className="text-slate-400 block font-medium">Category</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">
                {product.categoryName || 'General'}
              </span>
            </div>

            <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/50">
              <span className="text-slate-400 block font-medium">Catalog ID</span>
              <span className="font-mono font-semibold text-slate-800 mt-0.5 block">
                #{product.id}
              </span>
            </div>

            <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/50">
              <span className="text-slate-400 block font-medium">Catalog Entry Date</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">
                {formatDate(product.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            Authoritative totals verified upon checkout.
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Back to Catalog
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
