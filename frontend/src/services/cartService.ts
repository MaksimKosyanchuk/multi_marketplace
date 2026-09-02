import { api } from './api';

export const cartService = {
    addToCart: async (productId: string, quantity: number = 1) => {
        const { data } = await api.post('/cart/items', { productId, quantity });
        return data;
    },

    getCart: async () => {
        const { data } = await api.get('/cart');
        return data;
    },

    updateItemQuantity: async (itemId: string, quantity: number) => {
        const { data } = await api.patch(`/cart/items/${itemId}`, { quantity });
        return data;
    },

    removeItem: async (itemId: string) => {
        const { data } = await api.delete(`/cart/items/${itemId}`);
        return data;
    },
};
