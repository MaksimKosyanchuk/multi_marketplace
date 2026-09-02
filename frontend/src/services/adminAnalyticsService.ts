import { api } from './api';
import type { SellerAnalytics } from '../types/marketplace.type';

export interface AdminDashboard {
    summary: {
        totalRevenue: number;
        totalOrders: number;
        averageOrderValue: number;
    };
    topProducts: unknown[];
    salesTimeline: unknown[];
}
export const adminAnalyticsService = {
    async dashboard(params?: {
        from?: string;
        to?: string;
    }): Promise<AdminDashboard> {
        const { data } = await api.get<AdminDashboard>('/analytics/dashboard', {
            params,
        });
        return data;
    },
    async rankings(params?: {
        from?: string;
        to?: string;
    }): Promise<SellerAnalytics[]> {
        const { data } = await api.get<SellerAnalytics[]>(
            '/analytics/rankings',
            { params },
        );
        return data;
    },
    async downloadCsv(params?: { from?: string; to?: string }): Promise<Blob> {
        const { data } = await api.get<Blob>('/analytics/export/csv', {
            params,
            responseType: 'blob',
        });
        return data;
    },
    async downloadJson(params?: { from?: string; to?: string }): Promise<Blob> {
        const { data } = await api.get<Blob>('/analytics/export/json', {
            params,
            responseType: 'blob',
        });
        return data;
    },
};
