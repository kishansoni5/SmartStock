import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';

export default function Sidebar({ isOpen, onClose }) {
  const { isAuthenticated, user, isAdmin, logout } = useAuth();
  const { totalItems } = useCart();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Dynamic navigation links based on role
  const navLinks = [
    { to: '/', label: 'Overview', icon: '📊', exact: true },
    ...(isAuthenticated && !isAdmin
      ? [
          { to: '/customer', label: 'Customer Portal', icon: '👤' },
          { to: '/products', label: 'Product Catalog', icon: '🛍️' },
          { to: '/cart', label: 'Shopping Cart', icon: '🛒', count: totalItems },
          { to: '/orders', label: 'My Orders', icon: '📑' },
        ]
      : []),
    ...(isAdmin
      ? [
          { to: '/admin', label: 'Admin Console', icon: '⚙️', exact: true },
          { to: '/admin/orders', label: 'Manage Orders', icon: '📑' },
          { to: '/admin/products', label: 'Manage Products', icon: '🏷️' },
          { to: '/admin/categories', label: 'Manage Categories', icon: '📁' },
          { to: '/admin/warehouses', label: 'Manage Warehouses', icon: '🏢' },
          { to: '/admin/inventory', label: 'Stock Adjustments', icon: '📦' },
          { to: '/products', label: 'Product Catalog', icon: '🛍️' },
          { to: '/cart', label: 'Shopping Cart', icon: '🛒', count: totalItems },
          { to: '/customer', label: 'Customer Portal Preview', icon: '👤' },
        ]
      : []),
    ...(!isAuthenticated
      ? [
          { to: '/products', label: 'Product Catalog', icon: '🛍️' },
          { to: '/cart', label: 'Shopping Cart', icon: '🛒', count: totalItems },
        ]
      : []),
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 z-40 md:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-900 text-slate-200 flex flex-col border-r border-slate-800 transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800">
          <NavLink to="/" className="flex items-center gap-2.5">
            <span className="text-2xl">📦</span>
            <div>
              <span className="font-bold text-base tracking-tight text-white block">SmartStock</span>
              <span className="text-[10px] uppercase font-semibold text-indigo-400 tracking-wider block">
                Enterprise v0.0.1
              </span>
            </div>
          </NavLink>
          <button
            onClick={onClose}
            className="md:hidden text-slate-400 hover:text-white p-1 rounded-lg"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <div>
            <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              Management
            </span>
            <ul className="space-y-1">
              {navLinks.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.exact}
                    onClick={() => onClose && onClose()}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                      }`
                    }
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base">{link.icon}</span>
                      <span>{link.label}</span>
                    </div>
                    {link.count !== undefined && link.count > 0 && (
                      <span className="bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {link.count}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              Authentication
            </span>
            <ul className="space-y-1">
              {!isAuthenticated ? (
                <>
                  <li>
                    <NavLink
                      to="/login"
                      onClick={() => onClose && onClose()}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                        }`
                      }
                    >
                      <span className="text-base">🔐</span>
                      <span>Sign In</span>
                    </NavLink>
                  </li>
                  <li>
                    <NavLink
                      to="/register"
                      onClick={() => onClose && onClose()}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                        }`
                      }
                    >
                      <span className="text-base">📝</span>
                      <span>Register Customer</span>
                    </NavLink>
                  </li>
                </>
              ) : (
                <li>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-rose-300 hover:bg-rose-950/40 hover:text-rose-200 transition-colors"
                  >
                    <span className="text-base">🚪</span>
                    <span>Sign Out</span>
                  </button>
                </li>
              )}
            </ul>
          </div>
        </nav>

        {/* User / Environment Info Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/30">
                {(user.name || user.email || 'U').slice(0, 2).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-white truncate">{user.name || user.email}</p>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                      user.role === 'ADMIN' ? 'bg-amber-400' : 'bg-emerald-400'
                    }`}
                  />
                  <span className="text-[10px] text-slate-400 tracking-wide">
                    {user.role === 'ADMIN' ? 'Administrator' : 'Customer'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400">
              <span className="block font-semibold text-slate-300">Backend API</span>
              <span className="block truncate font-mono text-[10px] text-slate-400">
                {import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081/api/v1'}
              </span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
