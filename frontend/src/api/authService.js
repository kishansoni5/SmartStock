import axiosInstance from './axiosInstance';
import { ENDPOINTS } from './endpoints';

/**
 * Authentication service encapsulating backend API contracts
 */
export const loginApi = async (credentials) => {
  const payload = {
    email: credentials.email?.trim(),
    password: credentials.password,
  };
  // axiosInstance response interceptor returns response.data (ApiResponse<AuthResponse>)
  const response = await axiosInstance.post(ENDPOINTS.AUTH.LOGIN, payload);
  return response;
};

export const registerApi = async (userData) => {
  const payload = {
    name: userData.name?.trim(),
    email: userData.email?.trim(),
    password: userData.password,
  };
  // Backend returns 201 Created with ApiResponse<AuthResponse>
  const response = await axiosInstance.post(ENDPOINTS.AUTH.REGISTER, payload);
  return response;
};

export const getCurrentUserApi = async () => {
  // Authorization header automatically attached by axiosInstance interceptor
  const response = await axiosInstance.get(ENDPOINTS.AUTH.ME);
  return response;
};

const authService = {
  loginApi,
  registerApi,
  getCurrentUserApi,
};

export default authService;
