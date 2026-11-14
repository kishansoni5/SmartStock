import React from 'react';
import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/admin', label: 'Console Overview', icon: '📊', exact: true },
  { to: '/admin/orders', label: 'Orders Stream', icon: '📑' },
  { to: '/admin/products', label: 'Products', icon: '🏷️' },
  { to: '/admin/categories', label: 'Categories', icon: '📁' },
  { to: '/admin/warehouses', label: 'Warehouses', icon: '🏢' },
  { to: '/admin/inventory', label: 'Inventory & Adjustments', icon: '📦' },
];

export default function AdminNavTabs() {
  return (
    <div className="border-b border-slate-200 mb-6">
      <nav className="flex space-x-2 sm:space-x-4 overflow-x-auto py-1" aria-label="Admin Modules">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.exact}
            className={({ isActive }) =>
              `flex items-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`
            }
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
