import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

const CartContext = createContext(null);

const CART_STORAGE_KEY = 'smartstock_cart';

export const CartProvider = ({ children }) => {
  // Initialize cart from localStorage safely
  const [cartItems, setCartItems] = useState(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item) => item && item.productId && typeof item.quantity === 'number' && item.quantity > 0
          );
        }
      }
    } catch (e) {
      console.error('Failed to parse cart from localStorage:', e);
    }
    return [];
  });

  // Persist to localStorage whenever cartItems changes
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch (e) {
      console.error('Failed to save cart to localStorage:', e);
    }
  }, [cartItems]);

  // Add an item to the cart (or increment quantity if already present)
  const addToCart = useCallback((product, quantityToAdd = 1) => {
    if (!product || !product.id) return;

    const qty = Math.max(1, Math.floor(Number(quantityToAdd) || 1));
    const targetId = Number(product.id);

    setCartItems((prevItems) => {
      const existingIndex = prevItems.findIndex((item) => item.productId === targetId);

      if (existingIndex > -1) {
        // Increment quantity of existing item
        const updated = [...prevItems];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + qty,
        };
        return updated;
      }

      // Add new item to cart
      const newItem = {
        productId: targetId,
        name: product.name,
        sku: product.sku,
        price: Number(product.price) || 0,
        categoryName: product.categoryName || '',
        quantity: qty,
      };

      return [...prevItems, newItem];
    });
  }, []);

  // Update item quantity directly (removes item if quantity <= 0)
  const updateQuantity = useCallback((productId, newQuantity) => {
    const targetId = Number(productId);
    const qty = Math.floor(Number(newQuantity));

    setCartItems((prevItems) => {
      if (qty <= 0) {
        // Remove item if quantity is zero or negative
        return prevItems.filter((item) => item.productId !== targetId);
      }

      return prevItems.map((item) =>
        item.productId === targetId ? { ...item, quantity: qty } : item
      );
    });
  }, []);

  // Remove an item completely from the cart
  const removeFromCart = useCallback((productId) => {
    const targetId = Number(productId);
    setCartItems((prevItems) => prevItems.filter((item) => item.productId !== targetId));
  }, []);

  // Clear entire cart
  const clearCart = useCallback(() => {
    setCartItems([]);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear cart in localStorage:', e);
    }
  }, []);

  // Computed values
  const totalItems = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.quantity, 0);
  }, [cartItems]);

  const cartSubtotal = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  }, [cartItems]);

  const isInCart = useCallback(
    (productId) => cartItems.some((item) => item.productId === Number(productId)),
    [cartItems]
  );

  const getItemQuantity = useCallback(
    (productId) => {
      const found = cartItems.find((item) => item.productId === Number(productId));
      return found ? found.quantity : 0;
    },
    [cartItems]
  );

  const value = {
    cartItems,
    totalItems,
    cartSubtotal,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    isInCart,
    getItemQuantity,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export default CartContext;
