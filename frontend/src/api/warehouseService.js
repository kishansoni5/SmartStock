import axiosInstance from './axiosInstance';
import { ENDPOINTS } from './endpoints';

/**
 * Service to interact with Spring Boot Warehouse APIs
 */
export const getAllWarehouses = async () => {
  const response = await axiosInstance.get(ENDPOINTS.WAREHOUSES.LIST);
  return response?.data || [];
};

export const getWarehouseById = async (id) => {
  const response = await axiosInstance.get(ENDPOINTS.WAREHOUSES.DETAIL(id));
  return response?.data || null;
};

export const createWarehouse = async (warehouseData) => {
  const response = await axiosInstance.post(ENDPOINTS.WAREHOUSES.CREATE, warehouseData);
  return response?.data;
};

export const updateWarehouse = async (id, warehouseData) => {
  const response = await axiosInstance.put(ENDPOINTS.WAREHOUSES.UPDATE(id), warehouseData);
  return response?.data;
};

const warehouseService = {
  getAllWarehouses,
  getWarehouseById,
  createWarehouse,
  updateWarehouse,
};

export default warehouseService;
