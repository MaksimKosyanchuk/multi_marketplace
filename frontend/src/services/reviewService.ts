import { api } from './api';
import type { Review, ReviewSummary } from '../types/marketplace.type';

export const reviewService = {
    async listForProduct(productId: string): Promise<ReviewSummary> {
        const { data } = await api.get<ReviewSummary>(
            `/reviews/products/${productId}`,
        );
        return data;
    },
    async create(
        orderItemId: string,
        rating: number,
        comment?: string,
    ): Promise<Review> {
        const { data } = await api.post<Review>('/reviews', {
            orderItemId,
            rating,
            comment,
        });
        return data;
    },
};
