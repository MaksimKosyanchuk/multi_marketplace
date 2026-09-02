import { api } from './api';
import type { ProductSearchResponse } from '../types/marketplace.type';
import type { QueryProductParams } from '../types/product.type';

export const searchService = {
    async products(
        params?: QueryProductParams,
    ): Promise<ProductSearchResponse> {
        const { data } = await api.get<ProductSearchResponse>(
            '/search/products',
            { params },
        );
        return data;
    },
};
