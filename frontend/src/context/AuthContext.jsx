import React, { createContext, useContext, useState, useEffect } from 'react';
import { loginApi, registerApi, getCurrentUserApi } from '../api/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('smartstock_token'));
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('smartstock_user');
    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(true);

  // Validate existing session on application startup
  useEffect(() => {
    let isMounted = true;

    const validateSession = async () => {
      const storedToken = localStorage.getItem('smartstock_token');
      if (!storedToken) {
        if (isMounted) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        // Backend returns ApiResponse<UserResponse> where response.data has { id, name, email, role, createdAt }
        const response = await getCurrentUserApi();
        if (isMounted && response?.data) {
          setUser(response.data);
          localStorage.setItem('smartstock_user', JSON.stringify(response.data));
        }
      } catch (error) {
        // Token is invalid, expired, or backend rejected it
        if (isMounted) {
          localStorage.removeItem('smartstock_token');
          localStorage.removeItem('smartstock_user');
          setToken(null);
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    validateSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (credentials) => {
    const response = await loginApi(credentials);
    // response is ApiResponse<AuthResponse> with response.data = { token, tokenType, expiresInMs, user }
    const authData = response.data;
    if (authData?.token && authData?.user) {
      localStorage.setItem('smartstock_token', authData.token);
      localStorage.setItem('smartstock_user', JSON.stringify(authData.user));
      setToken(authData.token);
      setUser(authData.user);
      return authData.user;
    }
    throw new Error(response?.message || 'Authentication failed: Invalid response format');
  };

  const register = async (userData) => {
    const response = await registerApi(userData);
    const authData = response.data;
    if (authData?.token && authData?.user) {
      localStorage.setItem('smartstock_token', authData.token);
      localStorage.setItem('smartstock_user', JSON.stringify(authData.user));
      setToken(authData.token);
      setUser(authData.user);
      return authData.user;
    }
    throw new Error(response?.message || 'Registration failed: Invalid response format');
  };

  const logout = () => {
    localStorage.removeItem('smartstock_token');
    localStorage.removeItem('smartstock_user');
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    isAuthenticated: Boolean(token && user),
    isAdmin: user?.role === 'ADMIN',
    isCustomer: user?.role === 'CUSTOMER',
    loading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
