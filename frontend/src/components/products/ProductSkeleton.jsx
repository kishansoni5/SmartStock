import React from 'react';

export default function ProductSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-5">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs animate-pulse flex flex-col justify-between"
        >
          <div>
            {/* Top Bar Skeleton */}
            <div className="flex items-center justify-between mb-4">
              <div className="h-5 w-20 bg-slate-200 rounded-full" />
              <div className="h-4 w-16 bg-slate-200 rounded" />
            </div>

            {/* Icon & Title Skeleton */}
            <div className="flex items-start gap-3 my-2">
              <div className="w-12 h-12 rounded-xl bg-slate-200 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-slate-200 rounded" />
                <div className="h-3 w-full bg-slate-100 rounded" />
                <div className="h-3 w-5/6 bg-slate-100 rounded" />
              </div>
            </div>
          </div>

          {/* Pricing Skeleton */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
            <div className="space-y-1">
              <div className="h-3 w-12 bg-slate-200 rounded" />
              <div className="h-6 w-24 bg-slate-200 rounded" />
            </div>
            <div className="h-8 w-24 bg-slate-200 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
