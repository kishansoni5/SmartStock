import axiosInstance from './axiosInstance';
import { ENDPOINTS } from './endpoints';

/**
 * Service to interact with Spring Boot Product APIs
 */
export const getProducts = async (params = {}) => {
  // axiosInstance automatically unwraps response.data into ApiResponse<List<ProductResponse>>
  const response = await axiosInstance.get(ENDPOINTS.INVENTORY.PRODUCTS, { params });
  return response?.data || [];
};

export const getProductById = async (id) => {
  const response = await axiosInstance.get(ENDPOINTS.INVENTORY.PRODUCT_DETAIL(id));
  return response?.data || null;
};

export const createProduct = async (productData) => {
  const response = await axiosInstance.post(ENDPOINTS.INVENTORY.PRODUCTS, productData);
  return response?.data;
};

export const updateProduct = async (id, productData) => {
  const response = await axiosInstance.put(ENDPOINTS.INVENTORY.PRODUCT_DETAIL(id), productData);
  return response?.data;
};

export const deactivateProduct = async (id) => {
  const response = await axiosInstance.delete(ENDPOINTS.INVENTORY.PRODUCT_DETAIL(id));
  return response?.data;
};

const productService = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deactivateProduct,
};

export default productService;
