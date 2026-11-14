import axiosInstance from './axiosInstance';
import { ENDPOINTS } from './endpoints';

/**
 * Service encapsulating Spring Boot Order REST APIs
 */
export const createOrder = async (orderPayload) => {
  // orderPayload format: { items: [{ productId: Long, quantity: Integer }] }
  const response = await axiosInstance.post(ENDPOINTS.ORDERS.CREATE, orderPayload);
  return response?.data;
};

export const getMyOrders = async () => {
  const response = await axiosInstance.get(ENDPOINTS.ORDERS.LIST);
  return response?.data || [];
};

export const getOrderById = async (orderId) => {
  const response = await axiosInstance.get(ENDPOINTS.ORDERS.DETAIL(orderId));
  return response?.data;
};

export const cancelOrder = async (orderId) => {
  const response = await axiosInstance.post(ENDPOINTS.ORDERS.CANCEL(orderId));
  return response?.data;
};

export const getAllOrdersAdmin = async (params = {}) => {
  // params can include { status, page, size, sort }
  const cleanParams = { ...params };
  if (!cleanParams.status || cleanParams.status === 'ALL') {
    delete cleanParams.status;
  }
  const response = await axiosInstance.get(ENDPOINTS.ORDERS.ADMIN_LIST, { params: cleanParams });
  return response?.data; // Returns Spring Data Page<OrderResponse> object: { content, totalElements, ... }
};

export const getAdminOrderById = async (orderId) => {
  const response = await axiosInstance.get(ENDPOINTS.ORDERS.ADMIN_DETAIL(orderId));
  return response?.data;
};

export const cancelOrderAdmin = async (orderId) => {
  const response = await axiosInstance.post(ENDPOINTS.ORDERS.ADMIN_CANCEL(orderId));
  return response?.data;
};

const orderService = {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getAllOrdersAdmin,
  getAdminOrderById,
  cancelOrderAdmin,
};

export default orderService;
