import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import Button from '../common/Button';
import Badge from '../common/Badge';

export default function Navbar({ onMenuToggle }) {
  const { isAuthenticated, user, isAdmin, logout } = useAuth();
  const { totalItems } = useCart();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between">
      {/* Left section: mobile hamburger & breadcrumb/status */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none"
          aria-label="Toggle navigation"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Backend: v1 API Ready
          </span>
          <span className="hidden lg:inline-block text-xs text-slate-400 font-mono">
            {import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081/api/v1'}
          </span>
        </div>
      </div>

      {/* Right section: Auth status and quick navigation */}
      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          to="/"
          className="hidden sm:inline-flex text-xs font-medium text-slate-600 hover:text-indigo-600 px-2 py-1"
        >
          Overview
        </Link>
        <Link
          to="/products"
          className="hidden sm:inline-flex text-xs font-medium text-slate-600 hover:text-indigo-600 px-2 py-1"
        >
          Products
        </Link>
        {isAuthenticated && (
          <Link
            to={isAdmin ? '/admin/orders' : '/orders'}
            className="hidden sm:inline-flex text-xs font-medium text-slate-600 hover:text-indigo-600 px-2 py-1"
          >
            {isAdmin ? 'Manage Orders' : 'My Orders'}
          </Link>
        )}

        {/* Shopping Cart Trigger */}
        <Link
          to="/cart"
          className="relative p-2 rounded-lg text-slate-700 hover:text-indigo-600 hover:bg-slate-100 transition-colors flex items-center justify-center"
          aria-label="Shopping Cart"
          title="View Shopping Cart"
        >
          <span className="text-xl">🛒</span>
          {totalItems > 0 && (
            <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center border-2 border-white shadow-xs">
              {totalItems > 99 ? '99+' : totalItems}
            </span>
          )}
        </Link>

        <div className="h-4 w-px bg-slate-200 hidden sm:block" />

        {isAuthenticated && user ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700 max-w-[140px] truncate hidden sm:inline-block">
                {user.name || user.email}
              </span>
              <Badge variant={user.role === 'ADMIN' ? 'warning' : 'primary'} size="sm">
                {user.role}
              </Badge>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Sign Out
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="outline" size="sm">
                Sign In
              </Button>
            </Link>
            <Link to="/register">
              <Button variant="primary" size="sm">
                Register
              </Button>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
