import axiosInstance from './axiosInstance';
import { ENDPOINTS } from './endpoints';

/**
 * Service to interact with Spring Boot Category APIs
 */
export const getCategories = async () => {
  const response = await axiosInstance.get(ENDPOINTS.INVENTORY.CATEGORIES);
  return response?.data || [];
};

export const getCategoryById = async (id) => {
  const response = await axiosInstance.get(ENDPOINTS.INVENTORY.CATEGORY_DETAIL(id));
  return response?.data || null;
};

export const createCategory = async (categoryData) => {
  const response = await axiosInstance.post(ENDPOINTS.INVENTORY.CATEGORIES, categoryData);
  return response?.data;
};

export const updateCategory = async (id, categoryData) => {
  const response = await axiosInstance.put(ENDPOINTS.INVENTORY.CATEGORY_DETAIL(id), categoryData);
  return response?.data;
};

export const deleteCategory = async (id) => {
  const response = await axiosInstance.delete(ENDPOINTS.INVENTORY.CATEGORY_DETAIL(id));
  return response?.data;
};

const categoryService = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};

export default categoryService;
