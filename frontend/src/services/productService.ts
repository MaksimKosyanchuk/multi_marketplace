import { api } from './api';
import type {
    Product,
    ProductsResponse,
    QueryProductParams,
} from '../types/product.type';
import { searchService } from './searchService';

export const productService = {
    getAll: async (params?: QueryProductParams): Promise<ProductsResponse> => {
        const data = await searchService.products(params);
        return {
            items: data.hits,
            meta: {
                total: data.estimatedTotalHits,
                page: data.page ?? params?.page ?? 1,
                limit: data.limit ?? params?.limit ?? 10,
                pageCount: Math.ceil(
                    data.estimatedTotalHits /
                        (data.limit ?? params?.limit ?? 10),
                ),
            },
            facetDistribution: data.facetDistribution,
        };
    },

    getSellerProducts: async (
        params?: QueryProductParams,
    ): Promise<ProductsResponse> => {
        const { data } = await api.get<ProductsResponse>('/products/seller/me', {
            params,
        });
        return {
            ...data,
            items: data.items.map((product) => ({
                ...product,
                auctionId:
                    (product as Product & { auction?: { id: string } }).auction
                        ?.id ?? product.auctionId,
                auctionStatus: (
                    product as Product & {
                        auction?: { status: Product['auctionStatus'] };
                    }
                ).auction?.status ?? product.auctionStatus,
            })),
        };
    },

    getById: async (id: string): Promise<Product> => {
        const { data } = await api.get<Product>(`/products/${id}`);
        return data;
    },
    getPendingApproval: async (): Promise<Product[]> => {
        const { data } = await api.get<ProductsResponse>('/products/admin/pending-approval', {
            params: { limit: 100 },
        });
        return data.items;
    },
    approveProduct: async (id: string): Promise<Product> => {
        const { data } = await api.patch<Product>(`/products/${id}/approve`, {});
        return data;
    },
    rejectProduct: async (id: string, comment = 'Відхилено адміністратором'): Promise<Product> => {
        const { data } = await api.patch<Product>(`/products/${id}/reject`, { comment });
        return data;
    },

    createProduct: async (
        data: FormData | Record<string, unknown>,
    ): Promise<Product> => {
        const { data: response } = await api.post<Product>('/products', data);
        return response;
    },

    updateProduct: async (
        id: string,
        data: FormData | Record<string, unknown>,
    ): Promise<Product> => {
        const { data: response } = await api.patch<Product>(
            `/products/${id}`,
            data,
        );
        return response;
    },

    deleteProduct: async (id: string): Promise<void> => {
        await api.delete(`/products/${id}`);
    },

    restoreProduct: async (id: string): Promise<Product> => {
        const { data: response } = await api.patch<Product>(
            `/products/${id}/restore`,
        );
        return response;
    },

    submitForApproval: async (id: string): Promise<Product> => {
        const { data: response } = await api.patch<Product>(
            `/products/${id}/submit-for-approval`,
        );
        return response;
    },
};
