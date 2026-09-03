import { api } from './api';
import type { SellerAnalytics } from '../types/marketplace.type';

export const sellerService = {
    async getMine(): Promise<unknown> {
        const { data } = await api.get('/sellers/me');
        return data;
    },
    async apply(displayName: string, description?: string): Promise<unknown> {
        const { data } = await api.post('/sellers/applications', {
            displayName,
            description,
        });
        return data;
    },
    async listPendingApplications(): Promise<unknown[]> {
        const { data } = await api.get<unknown[]>('/sellers/applications', {
            params: { status: 'PENDING' },
        });
        return data;
    },
    async approveApplication(id: string): Promise<unknown> {
        const { data } = await api.patch(`/sellers/applications/${id}/approve`);
        return data;
    },
    async rejectApplication(id: string, reason = 'Відхилено адміністратором'): Promise<unknown> {
        const { data } = await api.patch(`/sellers/applications/${id}/reject`, {
            reason,
        });
        return data;
    },
    async analytics(params?: {
        from?: string;
        to?: string;
    }): Promise<SellerAnalytics> {
        const { data } = await api.get<SellerAnalytics>('/analytics/seller', {
            params,
        });
        return data;
    },
    async comparison(params?: {
        from?: string;
        to?: string;
    }): Promise<unknown> {
        const { data } = await api.get('/analytics/seller/comparison', {
            params,
        });
        return data;
    },
    async timeline(params?: { from?: string; to?: string }): Promise<unknown> {
        const { data } = await api.get('/analytics/seller/timeline', {
            params,
        });
        return data;
    },
};
