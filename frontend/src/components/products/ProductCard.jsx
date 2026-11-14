import React, { useState } from 'react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { formatCurrency } from '../../utils/formatters';
import { useCart } from '../../context/CartContext';

const getCategoryIcon = (categoryName) => {
  const normalized = (categoryName || '').toLowerCase();
  if (normalized.includes('electronic')) return '💻';
  if (normalized.includes('access')) return '🎧';
  if (normalized.includes('appliance') || normalized.includes('home')) return '🔌';
  return '📦';
};

const getCategoryVariant = (categoryName) => {
  const normalized = (categoryName || '').toLowerCase();
  if (normalized.includes('electronic')) return 'primary';
  if (normalized.includes('access')) return 'warning';
  if (normalized.includes('appliance') || normalized.includes('home')) return 'success';
  return 'neutral';
};

export default function ProductCard({ product, onViewDetails }) {
  const icon = getCategoryIcon(product.categoryName);
  const badgeVariant = getCategoryVariant(product.categoryName);
  const { addToCart, isInCart, getItemQuantity } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  const inCart = isInCart(product.id);
  const currentQty = getItemQuantity(product.id);

  const handleAddToCart = (e) => {
    e.stopPropagation();
    addToCart(product, 1);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  };

  return (
    <div
      onClick={() => onViewDetails(product)}
      className="group bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-indigo-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between cursor-pointer"
    >
      <div>
        {/* Top bar: Category Badge + SKU */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <Badge variant={badgeVariant} size="sm">
            {product.categoryName || 'General'}
          </Badge>
          <div className="flex items-center gap-1.5">
            {inCart && (
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                In Cart ({currentQty})
              </span>
            )}
            <span className="font-mono text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
              {product.sku}
            </span>
          </div>
        </div>

        {/* Product Visual & Name */}
        <div className="flex items-start gap-3 my-2">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center text-2xl shrink-0 group-hover:bg-indigo-50 group-hover:scale-105 transition-all">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-base text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
              {product.name}
            </h3>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
              {product.description || 'No detailed description available.'}
            </p>
          </div>
        </div>
      </div>

      {/* Pricing and Action Footer */}
      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
        <div>
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium block">
            Unit Price
          </span>
          <span className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
            {formatCurrency(product.price)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails(product);
            }}
            className="text-xs"
          >
            Details
          </Button>
          <Button
            variant={justAdded ? 'secondary' : 'primary'}
            size="sm"
            onClick={handleAddToCart}
            className="text-xs"
          >
            {justAdded ? '✓ Added' : '+ Add'}
          </Button>
        </div>
      </div>
    </div>
  );
}
