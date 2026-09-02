import { api } from './api';
import type { Dispute, DisputeStatus } from '../types/marketplace.type';

export const disputeService = {
    async listMine(): Promise<Dispute[]> {
        const { data } = await api.get<Dispute[]>('/disputes/my');
        return data;
    },
    async open(
        sellerOrderId: string,
        subject: string,
        description: string,
    ): Promise<Dispute> {
        const { data } = await api.post<Dispute>('/disputes', {
            sellerOrderId,
            subject,
            description,
        });
        return data;
    },
    async resolve(
        disputeId: string,
        status: DisputeStatus,
        resolution?: string,
    ): Promise<Dispute> {
        const { data } = await api.patch<Dispute>(
            `/disputes/${disputeId}/resolve`,
            { status, resolution },
        );
        return data;
    },
};
