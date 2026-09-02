import { api } from './api';

export interface DashboardSummary {
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
}

export interface TopProduct {
    productId: string;
    productName: string;
    totalSold: number;
    totalRevenue: number;
}

export interface SalesTimelineItem {
    date: string;
    revenue: number;
    orders: number;
}

export interface DashboardData {
    summary: DashboardSummary;
    topProducts: TopProduct[];
    salesTimeline: SalesTimelineItem[];
}

export interface AnalyticsFilterParams {
    from?: string;
    to?: string;
}

export const analyticsService = {
    async getDashboardData(params?: AnalyticsFilterParams): Promise<DashboardData> {
        const response = await api.get<DashboardData>('/analytics/dashboard', {
            params,
        });
        return response.data;
    },

    async downloadOrdersCsv(params?: AnalyticsFilterParams): Promise<void> {
        const response = await api.get('/analytics/export/csv', {
            params,
            responseType: 'blob',
        });

        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        
        const dateStr = new Date().toISOString().slice(0, 10);
        link.setAttribute('download', `sales_report_${dateStr}.csv`);
        
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    },
};