import React from 'react';

export default function StatCard({
  title,
  value,
  subtext,
  icon,
  badge,
  badgeVariant = 'neutral',
  className = '',
}) {
  const badgeClasses = {
    neutral: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    primary: 'bg-indigo-50 text-indigo-700',
    danger: 'bg-rose-50 text-rose-700',
  };

  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </span>
        {icon && (
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg">
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`${
            String(value).length > 16 ? 'text-sm font-bold' : 'text-2xl font-bold'
          } text-slate-900 tracking-tight`}
        >
          {value}
        </span>
        {badge && (
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
              badgeClasses[badgeVariant] || badgeClasses.neutral
            }`}
          >
            {badge}
          </span>
        )}
      </div>

      {subtext && <p className="text-xs text-slate-500 mt-2">{subtext}</p>}
    </div>
  );
}
