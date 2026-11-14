import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../../api/categoryService';
import { getProducts } from '../../api/productService';
import AdminNavTabs from '../../components/admin/AdminNavTabs';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { formatDate } from '../../utils/formatters';

export default function AdminCategories() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State for Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState({ name: '', description: '' });

  // Delete State
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [categoriesData, productsData] = await Promise.all([
        getCategories(),
        getProducts(),
      ]);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (err) {
      console.error('Failed to load categories or products:', err);
      setError(err?.message || 'Failed to load categories from backend.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute product count per category
  const productCountMap = useMemo(() => {
    const map = {};
    products.forEach((p) => {
      if (p.categoryId) {
        map[p.categoryId] = (map[p.categoryId] || 0) + 1;
      }
    });
    return map;
  }, [products]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingCategory(null);
    setFormError('');
    setFormData({ name: '', description: '' });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (category) => {
    setEditingCategory(category);
    setFormError('');
    setFormData({
      name: category.name || '',
      description: category.description || '',
    });
    setIsModalOpen(true);
  };

  // Submit Handler
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('Category name is required.');
      return;
    }

    setFormSubmitting(true);

    try {
      if (editingCategory) {
        const payload = {
          name: formData.name.trim(),
          description: formData.description.trim(),
        };
        const updated = await updateCategory(editingCategory.id, payload);
        setCategories((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c))
        );
        setFeedback({
          type: 'success',
          message: `Category '${updated.name}' updated successfully!`,
        });
      } else {
        const payload = {
          name: formData.name.trim(),
          description: formData.description.trim(),
        };
        const created = await createCategory(payload);
        setCategories((prev) => [...prev, created]);
        setFeedback({
          type: 'success',
          message: `Category '${created.name}' created successfully!`,
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error('Save category error:', err);
      setFormError(err?.message || 'Failed to save category. Name may already exist.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Delete Handler
  const handleConfirmDelete = async () => {
    if (!categoryToDelete) return;
    setIsDeleting(true);
    setFeedback({ type: '', message: '' });

    try {
      await deleteCategory(categoryToDelete.id);
      setCategories((prev) => prev.filter((c) => c.id !== categoryToDelete.id));
      setFeedback({
        type: 'success',
        message: `Category '${categoryToDelete.name}' deleted successfully!`,
      });
      setCategoryToDelete(null);
    } catch (err) {
      console.error('Delete category error:', err);
      setFeedback({
        type: 'error',
        message:
          err?.message ||
          `Cannot delete category '${categoryToDelete.name}' because it contains associated products.`,
      });
      setCategoryToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter Categories
  const filteredCategories = useMemo(() => {
    return categories.filter((cat) => {
      if (searchQuery.trim() === '') return true;
      const query = searchQuery.trim().toLowerCase();
      return (
        cat.name?.toLowerCase().includes(query) ||
        cat.description?.toLowerCase().includes(query)
      );
    });
  }, [categories, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Admin Sub-navigation Tabs */}
      <AdminNavTabs />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Category Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Organize catalog taxonomy, product classifications, and category metadata.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => loadData()}>
            🔄 Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={handleOpenCreate}>
            + Create Category
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

      {/* Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex items-center justify-between gap-3">
        <div className="w-full sm:w-80 relative">
          <input
            type="text"
            placeholder="Search categories by name or description..."
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
          Showing <strong>{filteredCategories.length}</strong> of <strong>{categories.length}</strong> categories
        </span>
      </div>

      {/* Categories Table Card */}
      <Card
        title="Category Directory"
        subtitle="Taxonomy classification for product catalog"
        action={<Badge variant="primary">{categories.length} Categories</Badge>}
      >
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Loading categories from backend...</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center space-y-2">
            <div className="text-3xl">⚠️</div>
            <p className="text-sm font-semibold text-slate-800">{error}</p>
            <Button variant="primary" size="sm" onClick={() => loadData()}>
              Retry
            </Button>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="text-3xl">📁</div>
            <h3 className="text-sm font-semibold text-slate-800">No categories found</h3>
            <p className="text-xs text-slate-500">
              Create your first product category using the button above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-left border-collapse text-xs min-w-[650px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500 bg-slate-50/70">
                  <th className="py-2.5 px-6">ID</th>
                  <th className="py-2.5 px-4">Category Name</th>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-4 text-center">Associated Products</th>
                  <th className="py-2.5 px-4">Created Date</th>
                  <th className="py-2.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredCategories.map((c) => {
                  const productCount = productCountMap[c.id] || 0;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-6 font-mono font-bold text-slate-400">
                        #{c.id}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {c.name}
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                        {c.description || '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`font-semibold px-2 py-0.5 rounded-full text-[11px] border ${
                            productCount > 0
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-slate-50 text-slate-500 border-slate-200'
                          }`}
                        >
                          {productCount} product{productCount !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                        {formatDate(c.createdAt)}
                      </td>
                      <td className="py-3 px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-indigo-600 hover:text-indigo-800 px-2"
                            onClick={() => handleOpenEdit(c)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2"
                            onClick={() => setCategoryToDelete(c)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* CREATE / EDIT CATEGORY MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                {editingCategory ? `Edit Category #${editingCategory.id}` : 'Create New Category'}
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
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Consumer Electronics"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Classification details..."
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
                  {formSubmitting ? 'Saving...' : editingCategory ? 'Save Changes' : 'Create Category'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL FOR DELETION */}
      {categoryToDelete && (
        <ConfirmationModal
          isOpen={Boolean(categoryToDelete)}
          onClose={() => setCategoryToDelete(null)}
          onConfirm={handleConfirmDelete}
          title={`Delete Category '${categoryToDelete.name}'?`}
          message="Are you sure you want to delete this category? This operation will fail if any active products are associated with it."
          confirmText="Yes, Delete Category"
          confirmVariant="danger"
          isLoading={isDeleting}
        >
          {productCountMap[categoryToDelete.id] > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
              ⚠️ <strong>Warning:</strong> This category currently contains{' '}
              <strong>{productCountMap[categoryToDelete.id]}</strong> associated product(s). The backend will block deletion with an error. Please reassign or delete these products first.
            </div>
          )}
        </ConfirmationModal>
      )}
    </div>
  );
}
