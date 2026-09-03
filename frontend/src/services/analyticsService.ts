import { api } from './api';

export interface DashboardSummary {
    totalRevenue: number;
    platformCommission: number;
    grossRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
    cartToOrderConversion: number;
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
    sellerRevenue: Array<{ sellerId: string; revenue: number }>;
    topSellers: Array<{ sellerId: string; revenue: number }>;
    salesTimeline: SalesTimelineItem[];
}

export interface AnalyticsFilterParams {
    from?: string;
    to?: string;
}

export interface SellerAnalytics {
    sellerId: string;
    revenue: number;
    commission: number;
    refunded: number;
    orders: number;
    completedOrders: number;
    conversion: number;
    topProducts: Array<{ productId: string; productName: string; quantity: number; revenue: number }>;
}

export const analyticsService = {
    async getDashboardData(params?: AnalyticsFilterParams): Promise<DashboardData> {
        const response = await api.get<DashboardData>('/analytics/dashboard', {
            params,
        });
        return response.data;
    },

    async getSellerAnalytics(params?: AnalyticsFilterParams): Promise<SellerAnalytics> {
        const response = await api.get<SellerAnalytics>('/analytics/seller', { params });
        return response.data;
    },

    async getSellerTimeline(params?: AnalyticsFilterParams): Promise<SalesTimelineItem[]> {
        const response = await api.get<SalesTimelineItem[]>('/analytics/seller/timeline', { params });
        return response.data;
    },

    async getSellerComparison(params?: AnalyticsFilterParams) {
        const response = await api.get('/analytics/seller/comparison', { params });
        return response.data as {
            current: SellerAnalytics;
            previous: SellerAnalytics | null;
            revenueChange: number | null;
            ordersChange: number | null;
        };
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

    async downloadDashboardJson(params?: AnalyticsFilterParams): Promise<void> {
        const response = await api.get('/analytics/export/json', {
            params,
            responseType: 'blob',
        });
        const url = window.URL.createObjectURL(response.data);
        const link = document.createElement('a');
        link.href = url;
        link.download = `analytics_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    },
};