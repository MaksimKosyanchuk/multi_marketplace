import { api } from './api';
import type { Product, ProductsResponse, QueryProductParams } from '../types/product.type';

export const productService = {
    getAll: async (params?: QueryProductParams): Promise<ProductsResponse> => {
        const { data } = await api.get<ProductsResponse>('/products', { params });
        return data;
    },

    getById: async (id: string): Promise<Product> => {
        const { data } = await api.get<Product>(`/products/${id}`);
        return data;
    },

    createProduct: async (data: FormData | Record<string, unknown>): Promise<Product> => {
        const { data: response } = await api.post<Product>('/products', data);
        return response;
    },

    updateProduct: async (id: string, data: FormData | Record<string, unknown>): Promise<Product> => {
        const { data: response } = await api.patch<Product>(`/products/${id}`, data);
        return response;
    },

    deleteProduct: async (id: string): Promise<void> => {
        await api.delete(`/products/${id}`);
    },

    restoreProduct: async (id: string): Promise<Product> => {
        const { data: response } = await api.patch<Product>(`/products/${id}/restore`);
        return response;
    }
};