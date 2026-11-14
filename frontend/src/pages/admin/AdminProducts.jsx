import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getProducts, createProduct, updateProduct, deactivateProduct } from '../../api/productService';
import { getCategories } from '../../api/categoryService';
import AdminNavTabs from '../../components/admin/AdminNavTabs';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal State for Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    price: '',
    categoryId: '',
    active: true,
  });

  // Modal State for Deactivation / Activation
  const [productToToggle, setProductToToggle] = useState(null);
  const [isToggling, setIsToggling] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productsData, categoriesData] = await Promise.all([
        getProducts(),
        getCategories(),
      ]);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
    } catch (err) {
      console.error('Failed to load products or categories:', err);
      setError(err?.message || 'Failed to load products from backend.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingProduct(null);
    setFormError('');
    setFormData({
      name: '',
      sku: '',
      description: '',
      price: '',
      categoryId: categories[0]?.id ? String(categories[0].id) : '',
      active: true,
    });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (product) => {
    setEditingProduct(product);
    setFormError('');
    setFormData({
      name: product.name || '',
      sku: product.sku || '',
      description: product.description || '',
      price: String(product.price || ''),
      categoryId: product.categoryId ? String(product.categoryId) : '',
      active: Boolean(product.active),
    });
    setIsModalOpen(true);
  };

  // Form Submit Handler
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('Product name is required.');
      return;
    }

    if (!editingProduct && !formData.sku.trim()) {
      setFormError('SKU is required.');
      return;
    }

    const priceNum = parseFloat(formData.price);
    if (isNaN(priceNum) || priceNum < 0) {
      setFormError('Price must be a valid positive number.');
      return;
    }

    if (!formData.categoryId) {
      setFormError('Please select a valid category.');
      return;
    }

    setFormSubmitting(true);

    try {
      if (editingProduct) {
        // Backend ProductUpdateRequest: { name, description, price, categoryId, active }
        const payload = {
          name: formData.name.trim(),
          description: formData.description.trim(),
          price: priceNum,
          categoryId: Number(formData.categoryId),
          active: formData.active,
        };
        const updated = await updateProduct(editingProduct.id, payload);
        setProducts((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p))
        );
        setFeedback({
          type: 'success',
          message: `Product '${updated.name}' updated successfully!`,
        });
      } else {
        // Backend ProductCreateRequest: { name, sku, description, price, categoryId, active }
        const payload = {
          name: formData.name.trim(),
          sku: formData.sku.trim().toUpperCase(),
          description: formData.description.trim(),
          price: priceNum,
          categoryId: Number(formData.categoryId),
          active: formData.active,
        };
        const created = await createProduct(payload);
        setProducts((prev) => [created, ...prev]);
        setFeedback({
          type: 'success',
          message: `Product '${created.name}' (${created.sku}) created successfully!`,
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error('Save product error:', err);
      setFormError(err?.message || 'Failed to save product. Please check input fields.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Toggle Active State
  const handleConfirmToggle = async () => {
    if (!productToToggle) return;
    setIsToggling(true);
    setFeedback({ type: '', message: '' });

    try {
      if (productToToggle.active) {
        // Soft deactivate via DELETE /products/{id}
        const updated = await deactivateProduct(productToToggle.id);
        setProducts((prev) =>
          prev.map((p) => (p.id === productToToggle.id ? { ...p, active: false } : p))
        );
        setFeedback({
          type: 'success',
          message: `Product '${productToToggle.name}' has been deactivated.`,
        });
      } else {
        // Reactivate via PUT /products/{id} with active: true
        const payload = {
          name: productToToggle.name,
          description: productToToggle.description,
          price: productToToggle.price,
          categoryId: productToToggle.categoryId,
          active: true,
        };
        const updated = await updateProduct(productToToggle.id, payload);
        setProducts((prev) =>
          prev.map((p) => (p.id === productToToggle.id ? updated : p))
        );
        setFeedback({
          type: 'success',
          message: `Product '${productToToggle.name}' has been reactivated.`,
        });
      }
      setProductToToggle(null);
    } catch (err) {
      console.error('Product status change failed:', err);
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to change product status.',
      });
      setProductToToggle(null);
    } finally {
      setIsToggling(false);
    }
  };

  // Filter & Search Logic
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // 1. Status Filter
      if (statusFilter === 'ACTIVE' && !product.active) return false;
      if (statusFilter === 'INACTIVE' && product.active) return false;

      // 2. Category Filter
      if (selectedCategory !== 'ALL' && String(product.categoryId) !== selectedCategory) {
        return false;
      }

      // 3. Search Query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.trim().toLowerCase();
        const matchesName = product.name?.toLowerCase().includes(query);
        const matchesSku = product.sku?.toLowerCase().includes(query);
        return matchesName || matchesSku;
      }

      return true;
    });
  }, [products, statusFilter, selectedCategory, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Admin Sub-navigation Tabs */}
      <AdminNavTabs />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Product Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Create, update, activate, and manage products registered in the SmartStock catalog.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => loadData()}>
            🔄 Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={handleOpenCreate}>
            + Add New Product
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

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs rounded-lg border border-slate-300 py-1.5 px-3 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs rounded-lg border border-slate-300 py-1.5 px-3 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="ALL">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={String(cat.id)}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Search Input */}
        <div className="w-full md:w-72 relative">
          <input
            type="text"
            placeholder="Search by Product Name or SKU..."
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

      {/* Product Table Card */}
      <Card
        title="Products Catalog"
        subtitle={`Showing ${filteredProducts.length} of ${products.length} registered products`}
        action={<Badge variant="primary">{products.length} Total SKUs</Badge>}
      >
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Loading products from backend...</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center space-y-2">
            <div className="text-3xl">⚠️</div>
            <p className="text-sm font-semibold text-slate-800">{error}</p>
            <Button variant="primary" size="sm" onClick={() => loadData()}>
              Retry
            </Button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="text-3xl">📦</div>
            <h3 className="text-sm font-semibold text-slate-800">No products match your filters</h3>
            <p className="text-xs text-slate-500">
              Try adjusting your search criteria or add a new product.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-left border-collapse text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500 bg-slate-50/70">
                  <th className="py-2.5 px-6">SKU</th>
                  <th className="py-2.5 px-4">Product Name</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4 text-right">Unit Price</th>
                  <th className="py-2.5 px-4 text-center">Status</th>
                  <th className="py-2.5 px-4">Created Date</th>
                  <th className="py-2.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-6 font-mono font-bold text-slate-900">
                      {p.sku}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {p.name}
                      {p.description && (
                        <span className="block text-[11px] font-normal text-slate-400 truncate max-w-xs">
                          {p.description}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {p.categoryName || 'Unassigned'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      {formatCurrency(p.price)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant={p.active ? 'success' : 'neutral'}>
                        {p.active ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {formatDate(p.createdAt)}
                    </td>
                    <td className="py-3 px-6 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-indigo-600 hover:text-indigo-800 px-2"
                          onClick={() => handleOpenEdit(p)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`text-xs px-2 ${
                            p.active
                              ? 'text-rose-600 hover:text-rose-800 hover:bg-rose-50'
                              : 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50'
                          }`}
                          onClick={() => setProductToToggle(p)}
                        >
                          {p.active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* CREATE / EDIT PRODUCT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                {editingProduct ? `Edit Product #${editingProduct.id}` : 'Create New Product'}
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
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={150}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Wireless Ergonomic Mouse"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    SKU Code * {editingProduct && <span className="text-slate-400 font-normal">(Immutable)</span>}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={50}
                    disabled={Boolean(editingProduct)}
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                    placeholder="e.g. MOU-WIR-001"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs uppercase disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Unit Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="e.g. 1500.00"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Category *
                </label>
                <select
                  required
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">Select a category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Detailed product specifications..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="product-active-toggle"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="product-active-toggle" className="font-semibold text-slate-700 cursor-pointer">
                  Active (Visible in customer catalogue)
                </label>
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
                  {formSubmitting ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Product'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL FOR DEACTIVATE / ACTIVATE */}
      {productToToggle && (
        <ConfirmationModal
          isOpen={Boolean(productToToggle)}
          onClose={() => setProductToToggle(null)}
          onConfirm={handleConfirmToggle}
          title={
            productToToggle.active
              ? `Deactivate Product '${productToToggle.name}'?`
              : `Reactivate Product '${productToToggle.name}'?`
          }
          message={
            productToToggle.active
              ? 'Soft deactivation hides this product from the customer catalogue and prevents new orders. Existing order history is preserved.'
              : 'Reactivating this product will make it immediately visible to customers for purchasing.'
          }
          confirmText={productToToggle.active ? 'Yes, Deactivate' : 'Yes, Reactivate'}
          confirmVariant={productToToggle.active ? 'danger' : 'primary'}
          isLoading={isToggling}
        />
      )}
    </div>
  );
}
