import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getAllWarehouses, createWarehouse, updateWarehouse } from '../../api/warehouseService';
import { getAllInventory } from '../../api/inventoryService';
import AdminNavTabs from '../../components/admin/AdminNavTabs';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { formatDate } from '../../utils/formatters';

export default function AdminWarehouses() {
  const [warehouses, setWarehouses] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State for Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState({ name: '', location: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [warehouseData, inventoryData] = await Promise.all([
        getAllWarehouses(),
        getAllInventory(),
      ]);
      setWarehouses(Array.isArray(warehouseData) ? warehouseData : []);
      setInventory(Array.isArray(inventoryData) ? inventoryData : []);
    } catch (err) {
      console.error('Failed to load warehouses:', err);
      setError(err?.message || 'Failed to load warehouses from backend.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute total inventory stock per warehouse
  const warehouseStatsMap = useMemo(() => {
    const map = {};
    inventory.forEach((i) => {
      if (i.warehouseId) {
        if (!map[i.warehouseId]) {
          map[i.warehouseId] = { skus: 0, available: 0, onHand: 0, reserved: 0 };
        }
        map[i.warehouseId].skus += 1;
        map[i.warehouseId].available += (i.available || 0);
        map[i.warehouseId].onHand += (i.onHand || 0);
        map[i.warehouseId].reserved += (i.reserved || 0);
      }
    });
    return map;
  }, [inventory]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingWarehouse(null);
    setFormError('');
    setFormData({ name: '', location: '' });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (warehouse) => {
    setEditingWarehouse(warehouse);
    setFormError('');
    setFormData({
      name: warehouse.name || '',
      location: warehouse.location || '',
    });
    setIsModalOpen(true);
  };

  // Submit Handler
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('Warehouse name is required.');
      return;
    }
    if (!formData.location.trim()) {
      setFormError('Warehouse location is required.');
      return;
    }

    setFormSubmitting(true);

    try {
      if (editingWarehouse) {
        const payload = {
          name: formData.name.trim(),
          location: formData.location.trim(),
        };
        const updated = await updateWarehouse(editingWarehouse.id, payload);
        setWarehouses((prev) =>
          prev.map((w) => (w.id === updated.id ? updated : w))
        );
        setFeedback({
          type: 'success',
          message: `Warehouse '${updated.name}' updated successfully!`,
        });
      } else {
        const payload = {
          name: formData.name.trim(),
          location: formData.location.trim(),
        };
        const created = await createWarehouse(payload);
        setWarehouses((prev) => [...prev, created]);
        setFeedback({
          type: 'success',
          message: `Warehouse '${created.name}' created successfully!`,
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error('Save warehouse error:', err);
      setFormError(err?.message || 'Failed to save warehouse. Name may already exist.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Filter warehouses
  const filteredWarehouses = useMemo(() => {
    return warehouses.filter((w) => {
      if (searchQuery.trim() === '') return true;
      const query = searchQuery.trim().toLowerCase();
      return (
        w.name?.toLowerCase().includes(query) ||
        w.location?.toLowerCase().includes(query)
      );
    });
  }, [warehouses, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Admin Sub-navigation Tabs */}
      <AdminNavTabs />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Warehouse Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Manage regional fulfillment hubs, distribution center locations, and stock buffers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => loadData()}>
            🔄 Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={handleOpenCreate}>
            + Add Distribution Hub
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

      {/* Architectural Callout for Warehouses */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
        <div className="flex items-center gap-2 font-semibold text-slate-800">
          <span>🏛️</span>
          <span>Event-Driven Warehouse Allocation Policy</span>
        </div>
        <p className="leading-relaxed">
          SmartStock Kafka consumers allocate stock sequentially: <strong>Surat Warehouse Hub</strong> acts as the primary preference, while <strong>Mumbai Warehouse Hub</strong> serves as the fallback. Because orders and inventory tables maintain referential integrity to distribution hubs, the backend does not expose a delete or disable endpoint.
        </p>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex items-center justify-between gap-3">
        <div className="w-full sm:w-80 relative">
          <input
            type="text"
            placeholder="Search warehouses by name or location..."
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

        <span className="text-xs text-slate-400">
          Showing <strong>{filteredWarehouses.length}</strong> of <strong>{warehouses.length}</strong> hubs
        </span>
      </div>

      {/* Warehouses Table Card */}
      <Card
        title="Distribution Center Network"
        subtitle="Regional fulfillment nodes participating in Kafka EDA processing"
        action={<Badge variant="primary">{warehouses.length} Hubs Registered</Badge>}
      >
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Loading warehouses from backend...</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center space-y-2">
            <div className="text-3xl">⚠️</div>
            <p className="text-sm font-semibold text-slate-800">{error}</p>
            <Button variant="primary" size="sm" onClick={() => loadData()}>
              Retry
            </Button>
          </div>
        ) : filteredWarehouses.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="text-3xl">🏢</div>
            <h3 className="text-sm font-semibold text-slate-800">No warehouses found</h3>
            <p className="text-xs text-slate-500">
              Register your first regional warehouse hub using the button above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-left border-collapse text-xs min-w-[650px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500 bg-slate-50/70">
                  <th className="py-2.5 px-6">Hub ID</th>
                  <th className="py-2.5 px-4">Warehouse Name</th>
                  <th className="py-2.5 px-4">Physical Location</th>
                  <th className="py-2.5 px-4 text-center">Allocated SKUs</th>
                  <th className="py-2.5 px-4 text-right">Available Stock</th>
                  <th className="py-2.5 px-4 text-center">Operational Status</th>
                  <th className="py-2.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredWarehouses.map((w) => {
                  const stats = warehouseStatsMap[w.id] || { skus: 0, available: 0, onHand: 0, reserved: 0 };
                  return (
                    <tr key={w.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-6 font-mono font-bold text-slate-400">
                        #{w.id}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        📍 {w.name}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {w.location}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                          {stats.skus} SKU{stats.skus !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900">
                        {stats.available} units
                        <span className="block text-[10px] text-slate-400 font-normal">
                          ({stats.onHand} on-hand / {stats.reserved} reserved)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant="success">ACTIVE HUB</Badge>
                      </td>
                      <td className="py-3 px-6 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-indigo-600 hover:text-indigo-800 px-2"
                          onClick={() => handleOpenEdit(w)}
                        >
                          Edit Hub Details
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

      {/* CREATE / EDIT WAREHOUSE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                {editingWarehouse ? `Edit Warehouse #${editingWarehouse.id}` : 'Add Distribution Hub'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Warehouse Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Bangalore Logistics Hub"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Physical Location *
                </label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g. Electronic City Phase 1, Bangalore"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                  disabled={formSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={formSubmitting}
                >
                  {formSubmitting ? 'Saving...' : editingWarehouse ? 'Save Changes' : 'Create Hub'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
