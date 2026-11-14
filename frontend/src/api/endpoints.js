export const ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    ME: '/auth/me',
  },
  INVENTORY: {
    PRODUCTS: '/products',
    PRODUCT_DETAIL: (id) => `/products/${id}`,
    CATEGORIES: '/categories',
    CATEGORY_DETAIL: (id) => `/categories/${id}`,
    STOCK: '/inventory',
    STOCK_ADJUST: '/inventory/adjust',
    BY_PRODUCT: (id) => `/inventory/product/${id}`,
    BY_WAREHOUSE: (id) => `/inventory/warehouse/${id}`,
  },
  WAREHOUSES: {
    LIST: '/warehouses',
    CREATE: '/warehouses',
    DETAIL: (id) => `/warehouses/${id}`,
    UPDATE: (id) => `/warehouses/${id}`,
  },
  ORDERS: {
    LIST: '/orders',
    CREATE: '/orders',
    DETAIL: (id) => `/orders/${id}`,
    CANCEL: (id) => `/orders/${id}/cancel`,
    ADMIN_LIST: '/admin/orders',
    ADMIN_DETAIL: (id) => `/admin/orders/${id}`,
    ADMIN_CANCEL: (id) => `/admin/orders/${id}/cancel`,
  },
};
