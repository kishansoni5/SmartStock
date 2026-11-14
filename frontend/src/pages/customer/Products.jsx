import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getProducts } from '../../api/productService';
import { getCategories } from '../../api/categoryService';
import ProductCard from '../../components/products/ProductCard';
import ProductFilterBar from '../../components/products/ProductFilterBar';
import ProductDetailsModal from '../../components/products/ProductDetailsModal';
import ProductSkeleton from '../../components/products/ProductSkeleton';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtering & Sorting State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [sortBy, setSortBy] = useState('featured');

  // Modal State
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Fetch products and categories concurrently
  const loadCatalogueData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [productsData, categoriesData] = await Promise.all([
        getProducts({ activeOnly: true }),
        getCategories(),
      ]);

      setProducts(Array.isArray(productsData) ? productsData : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
    } catch (err) {
      console.error('Failed to load catalogue data:', err);
      setError(
        err?.message || 'Unable to retrieve product catalogue. Please check your network or try again.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalogueData();
  }, [loadCatalogueData]);

  // Compute filtered & sorted product list
  const filteredAndSortedProducts = useMemo(() => {
    let result = [...products];

    // 1. Filter by Search Query (Name or SKU)
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(query)) ||
          (p.sku && p.sku.toLowerCase().includes(query))
      );
    }

    // 2. Filter by Category
    if (selectedCategory !== 'ALL') {
      result = result.filter(
        (p) => (p.categoryName || '').toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    // 3. Sorting
    result.sort((a, b) => {
      if (sortBy === 'price-asc') {
        return Number(a.price) - Number(b.price);
      }
      if (sortBy === 'price-desc') {
        return Number(b.price) - Number(a.price);
      }
      if (sortBy === 'name-asc') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'name-desc') {
        return (b.name || '').localeCompare(a.name || '');
      }
      // default / 'featured' by ID
      return a.id - b.id;
    });

    return result;
  }, [products, searchQuery, selectedCategory, sortBy]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('ALL');
    setSortBy('featured');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Product Catalogue
            </h1>
            <Badge variant="primary">E-Commerce</Badge>
          </div>
          <p className="text-sm text-slate-500">
            Browse verified inventory items, check specifications, and review unit prices.
          </p>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            📦 {products.length} Products
          </span>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            🏷️ {categories.length} Categories
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <ProductFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        categories={categories}
        sortBy={sortBy}
        onSortChange={setSortBy}
        totalCount={products.length}
        filteredCount={filteredAndSortedProducts.length}
        onResetFilters={handleResetFilters}
      />

      {/* Content States: Loading, Error, Empty, or Product Grid */}
      {loading ? (
        <ProductSkeleton count={6} />
      ) : error ? (
        <div className="bg-white rounded-xl border border-rose-200 p-8 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-xl">
            ⚠️
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-base font-semibold text-slate-900">Failed to load product catalogue</h3>
            <p className="text-xs text-slate-500 mt-1">{error}</p>
          </div>
          <Button variant="primary" size="sm" onClick={loadCatalogueData}>
            🔄 Try Again
          </Button>
        </div>
      ) : filteredAndSortedProducts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-3xl">
            🔍
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-lg font-semibold text-slate-900">No matching products found</h3>
            <p className="text-sm text-slate-500 mt-1">
              {searchQuery || selectedCategory !== 'ALL'
                ? `No products match "${searchQuery}" in ${selectedCategory === 'ALL' ? 'all categories' : selectedCategory}.`
                : 'No products are currently available in the catalogue.'}
            </p>
          </div>
          {(searchQuery || selectedCategory !== 'ALL' || sortBy !== 'featured') && (
            <Button variant="outline" size="sm" onClick={handleResetFilters}>
              Reset Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-5">
          {filteredAndSortedProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onViewDetails={setSelectedProduct}
            />
          ))}
        </div>
      )}

      {/* Product Details Modal */}
      {selectedProduct && (
        <ProductDetailsModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}
