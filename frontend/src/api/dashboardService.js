import { getProducts } from './productService';
import { getAllInventory } from './inventoryService';
import { getAllOrdersAdmin } from './orderService';

/**
 * Service to aggregate dashboard metrics from real backend endpoints
 */
export const getAdminDashboardData = async () => {
  // Execute calls in parallel to minimize latency
  const [productsRes, inventoryRes, allOrdersRes, pendingOrdersRes, recentOrdersRes] =
    await Promise.all([
      getProducts().catch((err) => {
        console.error('Dashboard products fetch failed:', err);
        return [];
      }),
      getAllInventory().catch((err) => {
        console.error('Dashboard inventory fetch failed:', err);
        return [];
      }),
      getAllOrdersAdmin({ size: 1 }).catch((err) => {
        console.error('Dashboard all orders fetch failed:', err);
        return { totalElements: 0 };
      }),
      getAllOrdersAdmin({ status: 'PENDING', size: 1 }).catch((err) => {
        console.error('Dashboard pending orders fetch failed:', err);
        return { totalElements: 0 };
      }),
      getAllOrdersAdmin({ size: 5, sort: 'createdAt,desc' }).catch((err) => {
        console.error('Dashboard recent orders fetch failed:', err);
        return { content: [] };
      }),
    ]);

  // 1. Products Metrics
  const products = Array.isArray(productsRes) ? productsRes : [];
  const activeProducts = products.filter((p) => p.active !== false);

  // 2. Inventory Metrics
  const inventory = Array.isArray(inventoryRes) ? inventoryRes : [];
  const totalOnHand = inventory.reduce((sum, item) => sum + (item.onHand || 0), 0);
  const totalReserved = inventory.reduce((sum, item) => sum + (item.reserved || 0), 0);
  const totalAvailable = inventory.reduce((sum, item) => sum + (item.available || 0), 0);
  const uniqueWarehouses = new Set(
    inventory.map((item) => item.warehouseId).filter(Boolean)
  ).size;

  // 3. Orders Metrics
  const totalOrders = allOrdersRes?.totalElements ?? 0;
  const pendingOrders = pendingOrdersRes?.totalElements ?? 0;
  const recentOrders = recentOrdersRes?.content || [];

  return {
    metrics: {
      activeProductsCount: activeProducts.length,
      totalProductsCount: products.length,
      totalAvailableUnits: totalAvailable,
      totalOnHandUnits: totalOnHand,
      totalReservedUnits: totalReserved,
      uniqueWarehousesCount: uniqueWarehouses,
      totalOrdersCount: totalOrders,
      pendingOrdersCount: pendingOrders,
      kafkaHealth: {
        statusText: 'Health status unavailable',
        badge: 'Unmonitored',
        subtext: 'Actuator health check endpoint not exposed by backend',
      },
    },
    inventoryRecords: inventory,
    recentOrders,
  };
};

const dashboardService = {
  getAdminDashboardData,
};

export default dashboardService;
