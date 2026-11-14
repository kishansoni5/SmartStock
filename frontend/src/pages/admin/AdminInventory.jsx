import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getAllInventory, adjustStock } from '../../api/inventoryService';
import { getProducts } from '../../api/productService';
import { getAllWarehouses } from '../../api/warehouseService';
import AdminNavTabs from '../../components/admin/AdminNavTabs';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { formatDate } from '../../utils/formatters';

export default function AdminInventory() {
  const [inventory, setInventory] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');
  const [stockLevelFilter, setStockLevelFilter] = useState('ALL');

  // Stock Adjustment Modal State
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({
    productId: '',
    warehouseId: '',
    adjustmentType: 'INCREASE', // 'INCREASE' | 'DECREASE'
    quantity: '10',
    reason: '',
  });
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invData, prodData, whData] = await Promise.all([
        getAllInventory(),
        getProducts(),
        getAllWarehouses(),
      ]);
      setInventory(Array.isArray(invData) ? invData : []);
      setProducts(Array.isArray(prodData) ? prodData : []);
      setWarehouses(Array.isArray(whData) ? whData : []);
    } catch (err) {
      console.error('Failed to load inventory data:', err);
      setError(err?.message || 'Failed to load inventory records from backend.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open adjustment modal for a specific record or new
  const handleOpenAdjustment = (record = null) => {
    setAdjustError('');
    if (record) {
      setAdjustmentForm({
        productId: String(record.productId),
        warehouseId: String(record.warehouseId),
        adjustmentType: 'INCREASE',
        quantity: '10',
        reason: 'Periodic warehouse restock shipment',
      });
    } else {
      setAdjustmentForm({
        productId: products[0]?.id ? String(products[0].id) : '',
        warehouseId: warehouses[0]?.id ? String(warehouses[0].id) : '',
        adjustmentType: 'INCREASE',
        quantity: '10',
        reason: 'Manual inventory adjustment',
      });
    }
    setIsAdjustmentModalOpen(true);
  };

  // Find currently targeted inventory record for real-time validation preview
  const targetedRecord = useMemo(() => {
    if (!adjustmentForm.productId || !adjustmentForm.warehouseId) return null;
    return inventory.find(
      (i) =>
        String(i.productId) === adjustmentForm.productId &&
        String(i.warehouseId) === adjustmentForm.warehouseId
    );
  }, [inventory, adjustmentForm.productId, adjustmentForm.warehouseId]);

  // Current quantities and calculation preview
  const currentOnHand = targetedRecord?.onHand || 0;
  const currentReserved = targetedRecord?.reserved || 0;
  const currentAvailable = currentOnHand - currentReserved;

  const parsedQty = Math.max(1, parseInt(adjustmentForm.quantity, 10) || 0);
  const delta = adjustmentForm.adjustmentType === 'INCREASE' ? parsedQty : -parsedQty;
  const newOnHand = currentOnHand + delta;
  const newAvailable = newOnHand - currentReserved;

  // Real-time backend rule check
  const isNegativeOnHand = newOnHand < 0;
  const isLessThanReserved = newOnHand < currentReserved;
  const isInvalidAdjustment = isNegativeOnHand || isLessThanReserved;

  // Submit Adjustment Handler
  const handleAdjustmentSubmit = async (e) => {
    e.preventDefault();
    setAdjustError('');

    if (!adjustmentForm.productId || !adjustmentForm.warehouseId) {
      setAdjustError('Please select both a product and a warehouse.');
      return;
    }

    if (isNaN(parsedQty) || parsedQty <= 0) {
      setAdjustError('Adjustment quantity must be greater than zero.');
      return;
    }

    if (isNegativeOnHand) {
      setAdjustError(
        `Invalid stock adjustment: Resulting on-hand stock (${newOnHand}) cannot be negative.`
      );
      return;
    }

    if (isLessThanReserved) {
      setAdjustError(
        `Invalid stock adjustment: Resulting on-hand stock (${newOnHand}) cannot be less than reserved stock (${currentReserved}).`
      );
      return;
    }

    setAdjusting(true);

    try {
      // Backend StockAdjustmentRequest: { productId, warehouseId, adjustmentQuantity, reason }
      const payload = {
        productId: Number(adjustmentForm.productId),
        warehouseId: Number(adjustmentForm.warehouseId),
        adjustmentQuantity: delta,
        reason: adjustmentForm.reason.trim() || 'Manual stock adjustment',
      };

      const updatedRecord = await adjustStock(payload);

      // Update local state and trigger refresh
      setInventory((prev) => {
        const exists = prev.some((i) => i.id === updatedRecord.id);
        if (exists) {
          return prev.map((i) => (i.id === updatedRecord.id ? updatedRecord : i));
        }
        return [...prev, updatedRecord];
      });

      setFeedback({
        type: 'success',
        message: `Stock successfully adjusted for ${updatedRecord.productName} at ${updatedRecord.warehouseName}! New Available: ${updatedRecord.available} units.`,
      });

      setIsAdjustmentModalOpen(false);
    } catch (err) {
      console.error('Stock adjustment failed:', err);
      setAdjustError(err?.message || 'Failed to adjust stock. Please verify backend constraints.');
    } finally {
      setAdjusting(false);
    }
  };

  // Filtered Inventory Records
  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      // 1. Warehouse Filter
      if (selectedWarehouse !== 'ALL' && String(item.warehouseId) !== selectedWarehouse) {
        return false;
      }

      // 2. Stock Level Filter
      const avail = item.available ?? (item.onHand - item.reserved);
      if (stockLevelFilter === 'OUT_OF_STOCK' && avail > 0) return false;
      if (stockLevelFilter === 'LOW_STOCK' && (avail <= 0 || avail > 5)) return false;
      if (stockLevelFilter === 'IN_STOCK' && avail <= 5) return false;

      // 3. Search Query (Product Name or SKU)
      if (searchQuery.trim() !== '') {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = item.productName?.toLowerCase().includes(q);
        const matchesSku = item.productSku?.toLowerCase().includes(q);
        const matchesWh = item.warehouseName?.toLowerCase().includes(q);
        return matchesName || matchesSku || matchesWh;
      }

      return true;
    });
  }, [inventory, selectedWarehouse, stockLevelFilter, searchQuery]);

  // Aggregate stats
  const totalOnHand = inventory.reduce((sum, i) => sum + (i.onHand || 0), 0);
  const totalReserved = inventory.reduce((sum, i) => sum + (i.reserved || 0), 0);
  const totalAvailable = inventory.reduce((sum, i) => sum + (i.available || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Admin Sub-navigation Tabs */}
      <AdminNavTabs />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Inventory Management & Stock Adjustments
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Monitor real-time on-hand, reserved, and available quantities across regional distribution centers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => loadData()}>
            🔄 Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => handleOpenAdjustment()}>
            + Adjust Stock
          </Button>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback.message && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-start gap-3 shadow-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span className="text-lg font-bold">
            {feedback.type === 'success' ? '✅' : '⚠️'}
          </span>
          <div className="flex-1">
            <p className="text-xs font-semibold">{feedback.message}</p>
          </div>
          <button
            onClick={() => setFeedback({ type: '', message: '' })}
            className="text-slate-400 hover:text-slate-600 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Aggregate Stock KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Available for Sale
          </span>
          <span className="text-2xl font-black text-indigo-600 mt-1 block">
            {totalAvailable.toLocaleString()} units
          </span>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Usable for new customer orders
          </span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            On-Hand Physical Stock
          </span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">
            {totalOnHand.toLocaleString()} units
          </span>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Total physical inventory on shelves
          </span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs bg-amber-50/20">
          <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider block">
            Kafka Reserved Units
          </span>
          <span className="text-2xl font-black text-amber-700 mt-1 block">
            {totalReserved.toLocaleString()} units
          </span>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Locked for confirmed orders
          </span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Distribution Hubs
          </span>
          <span className="text-2xl font-black text-slate-800 mt-1 block">
            {warehouses.length} Hubs
          </span>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Active regional logistics centers
          </span>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Warehouse Selector */}
          <select
            value={selectedWarehouse}
            onChange={(e) => setSelectedWarehouse(e.target.value)}
            className="text-xs rounded-lg border border-slate-300 py-1.5 px-3 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="ALL">All Warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={String(w.id)}>
                {w.name}
              </option>
            ))}
          </select>

          {/* Stock Level Selector */}
          <select
            value={stockLevelFilter}
            onChange={(e) => setStockLevelFilter(e.target.value)}
            className="text-xs rounded-lg border border-slate-300 py-1.5 px-3 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="ALL">All Stock Levels</option>
            <option value="IN_STOCK">In Stock (&gt; 5)</option>
            <option value="LOW_STOCK">Low Stock (1 - 5)</option>
            <option value="OUT_OF_STOCK">Out of Stock (0)</option>
          </select>
        </div>

        {/* Search Input */}
        <div className="w-full md:w-72 relative">
          <input
            type="text"
            placeholder="Search by Product, SKU, Warehouse..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
          />
          <span className="absolute left-2.5 top-1.5 text-slate-400 text-xs">🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1 text-slate-400 hover:text-slate-600 font-bold text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Inventory Matrix Table Card */}
      <Card
        title="Inventory Allocation Matrix"
        subtitle={`Showing ${filteredInventory.length} of ${inventory.length} warehouse stock allocations`}
        action={<Badge variant="primary">{inventory.length} Stock Records</Badge>}
      >
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Loading inventory matrix from backend...</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center space-y-2">
            <div className="text-3xl">⚠️</div>
            <p className="text-sm font-semibold text-slate-800">{error}</p>
            <Button variant="primary" size="sm" onClick={() => loadData()}>
              Retry
            </Button>
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="text-3xl">📦</div>
            <h3 className="text-sm font-semibold text-slate-800">No inventory records match filters</h3>
            <p className="text-xs text-slate-500">
              Try resetting your filters or adjusting stock for a product.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-left border-collapse text-xs min-w-[750px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500 bg-slate-50/70">
                  <th className="py-2.5 px-6">Product / SKU</th>
                  <th className="py-2.5 px-4">Warehouse Hub</th>
                  <th className="py-2.5 px-4 text-right">On-Hand</th>
                  <th className="py-2.5 px-4 text-right">Reserved</th>
                  <th className="py-2.5 px-4 text-right">Available</th>
                  <th className="py-2.5 px-4 text-center">Status</th>
                  <th className="py-2.5 px-4">Last Updated</th>
                  <th className="py-2.5 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredInventory.map((item) => {
                  const avail = item.available ?? (item.onHand - item.reserved);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-6">
                        <span className="font-bold text-slate-900 block">
                          {item.productName}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400 block">
                          {item.productSku}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-700">
                        📍 {item.warehouseName}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-800">
                        {item.onHand}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-amber-600">
                        {item.reserved}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 text-sm">
                        {avail}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge
                          variant={avail <= 0 ? 'danger' : avail <= 5 ? 'warning' : 'success'}
                        >
                          {avail <= 0 ? 'OUT OF STOCK' : avail <= 5 ? 'LOW STOCK' : 'IN STOCK'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                        {formatDate(item.updatedAt)}
                      </td>
                      <td className="py-3 px-6 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-indigo-600 hover:text-indigo-800 px-2"
                          onClick={() => handleOpenAdjustment(item)}
                        >
                          Adjust Stock →
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* STOCK ADJUSTMENT MODAL */}
      {isAdjustmentModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Warehouse Stock Adjustment
                </h3>
                <p className="text-xs text-slate-500">
                  Update physical inventory levels with real-time backend constraint validation.
                </p>
              </div>
              <button
                onClick={() => setIsAdjustmentModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {adjustError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                ⚠️ {adjustError}
              </div>
            )}

            <form onSubmit={handleAdjustmentSubmit} className="space-y-4 text-xs">
              {/* Product and Warehouse Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Target Product *
                  </label>
                  <select
                    required
                    value={adjustmentForm.productId}
                    onChange={(e) =>
                      setAdjustmentForm({ ...adjustmentForm, productId: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Distribution Hub *
                  </label>
                  <select
                    required
                    value={adjustmentForm.warehouseId}
                    onChange={(e) =>
                      setAdjustmentForm({ ...adjustmentForm, warehouseId: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={String(w.id)}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Current Quantities Status Card */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-3 gap-2 text-center">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                    Current On-Hand
                  </span>
                  <span className="text-base font-bold text-slate-900 block">
                    {currentOnHand}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-amber-600 uppercase font-semibold block">
                    Reserved
                  </span>
                  <span className="text-base font-bold text-amber-600 block">
                    {currentReserved}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-indigo-600 uppercase font-semibold block">
                    Current Available
                  </span>
                  <span className="text-base font-bold text-indigo-600 block">
                    {currentAvailable}
                  </span>
                </div>
              </div>

              {/* Adjustment Type & Quantity */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Operation Type
                  </label>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() =>
                        setAdjustmentForm({ ...adjustmentForm, adjustmentType: 'INCREASE' })
                      }
                      className={`py-1 text-xs font-semibold rounded-md transition-colors ${
                        adjustmentForm.adjustmentType === 'INCREASE'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      + Restock
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAdjustmentForm({ ...adjustmentForm, adjustmentType: 'DECREASE' })
                      }
                      className={`py-1 text-xs font-semibold rounded-md transition-colors ${
                        adjustmentForm.adjustmentType === 'DECREASE'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      - Write-off
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Adjustment Units *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={adjustmentForm.quantity}
                    onChange={(e) =>
                      setAdjustmentForm({ ...adjustmentForm, quantity: e.target.value })
                    }
                    placeholder="e.g. 25"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              {/* Real-time Calculation Preview Card */}
              <div
                className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                  isInvalidAdjustment
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-indigo-50/60 border-indigo-200 text-indigo-900'
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span>
                    Calculation Preview ({delta > 0 ? `+${delta}` : delta} units):
                  </span>
                  <span>
                    New On-Hand: <strong>{newOnHand}</strong> | New Available: <strong>{newAvailable}</strong>
                  </span>
                </div>
                {isNegativeOnHand && (
                  <p className="text-rose-600 font-semibold pt-1">
                    ❌ Violation: Resulting on-hand stock cannot be negative.
                  </p>
                )}
                {isLessThanReserved && (
                  <p className="text-rose-600 font-semibold pt-1">
                    ❌ Violation: Resulting on-hand stock ({newOnHand}) cannot be less than reserved stock ({currentReserved}).
                  </p>
                )}
              </div>

              {/* Reason */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Adjustment Reason / Audit Reference
                </label>
                <input
                  type="text"
                  value={adjustmentForm.reason}
                  onChange={(e) =>
                    setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })
                  }
                  placeholder="e.g. Supplier Batch Restock PO-492"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAdjustmentModalOpen(false)}
                  disabled={adjusting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={adjustmentForm.adjustmentType === 'INCREASE' ? 'primary' : 'danger'}
                  size="sm"
                  disabled={adjusting || isInvalidAdjustment}
                >
                  {adjusting
                    ? 'Adjusting...'
                    : adjustmentForm.adjustmentType === 'INCREASE'
                    ? `Confirm +${parsedQty} Restock`
                    : `Confirm -${parsedQty} Write-off`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
