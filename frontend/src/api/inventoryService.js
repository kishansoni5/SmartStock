import axiosInstance from './axiosInstance';
import { ENDPOINTS } from './endpoints';

/**
 * Service to interact with Spring Boot Inventory REST endpoints
 */
export const getAllInventory = async () => {
  // Returns ApiResponse<List<InventoryResponse>> unwrapped by axiosInstance
  const response = await axiosInstance.get(ENDPOINTS.INVENTORY.STOCK);
  return response?.data || [];
};

export const getInventoryByProduct = async (productId) => {
  const response = await axiosInstance.get(ENDPOINTS.INVENTORY.BY_PRODUCT(productId));
  return response?.data || [];
};

export const getInventoryByWarehouse = async (warehouseId) => {
  const response = await axiosInstance.get(ENDPOINTS.INVENTORY.BY_WAREHOUSE(warehouseId));
  return response?.data || [];
};

export const adjustStock = async (adjustmentData) => {
  const response = await axiosInstance.post(ENDPOINTS.INVENTORY.STOCK_ADJUST, adjustmentData);
  return response?.data;
};

const inventoryService = {
  getAllInventory,
  getInventoryByProduct,
  getInventoryByWarehouse,
  adjustStock,
};

export default inventoryService;
