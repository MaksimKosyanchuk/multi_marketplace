import { api } from './api';
import type { SellerOrder } from '../types/marketplace.type';

export type SellerStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export interface SellerApplication {
    id: string;
    userId: string;
    displayName: string;
    description?: string | null;
    status: SellerStatus;
    rejectionReason?: string | null;
}

export const sellerAdminService = {
    async listApplications(
        status?: SellerStatus,
    ): Promise<SellerApplication[]> {
        const { data } = await api.get<SellerApplication[]>(
            '/sellers/applications',
            { params: { status } },
        );
        return data;
    },
    async approveApplication(id: string): Promise<SellerApplication> {
        const { data } = await api.patch<SellerApplication>(
            `/sellers/applications/${id}/approve`,
        );
        return data;
    },
    async rejectApplication(
        id: string,
        reason: string,
    ): Promise<SellerApplication> {
        const { data } = await api.patch<SellerApplication>(
            `/sellers/applications/${id}/reject`,
            { reason },
        );
        return data;
    },
    async listOrders(): Promise<SellerOrder[]> {
        const { data } = await api.get<SellerOrder[]>('/orders/seller/me');
        return data;
    },
};
