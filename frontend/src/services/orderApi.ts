import { api } from './api';
import { withIdempotencyKey } from './requestMeta';
import type { Order, SellerOrder } from '../types/marketplace.type';

export const orderApi = {
    async checkout(idempotencyKey?: string): Promise<Order> {
        const { data } = await api.post<Order>('/orders/checkout', undefined, {
            headers: withIdempotencyKey(idempotencyKey),
        });
        return data;
    },
    async listMine(): Promise<Order[]> {
        const { data } = await api.get<Order[]>('/orders/my');
        return data;
    },
    async resync(): Promise<Order[]> {
        const { data } = await api.get<Order[]>('/orders/resync');
        return data;
    },
    async pay(orderId: string, idempotencyKey?: string): Promise<Order> {
        const { data } = await api.post<Order>(
            `/orders/${orderId}/pay`,
            undefined,
            { headers: withIdempotencyKey(idempotencyKey) },
        );
        return data;
    },
    async cancel(orderId: string): Promise<Order> {
        const { data } = await api.post<Order>(`/orders/${orderId}/cancel`);
        return data;
    },
    async cancelPendingPayment(
        orderId: string,
        idempotencyKey?: string,
    ): Promise<Order> {
        const { data } = await api.post<Order>(
            `/orders/${orderId}/payment/cancel`,
            undefined,
            { headers: withIdempotencyKey(idempotencyKey) },
        );
        return data;
    },
    async listSellerOrders(): Promise<SellerOrder[]> {
        const { data } = await api.get<SellerOrder[]>('/orders/seller/me');
        return data;
    },
    async updateSellerStatus(
        sellerOrderId: string,
        status: string,
        trackingNumber?: string,
    ): Promise<SellerOrder> {
        const { data } = await api.patch<SellerOrder>(
            `/orders/seller/${sellerOrderId}/status`,
            { status, trackingNumber },
        );
        return data;
    },
    async cancelSellerOrder(
        sellerOrderId: string,
        reason?: string,
        idempotencyKey?: string,
    ): Promise<SellerOrder> {
        const { data } = await api.post<SellerOrder>(
            `/orders/seller/${sellerOrderId}/cancel`,
            { reason },
            { headers: withIdempotencyKey(idempotencyKey) },
        );
        return data;
    },
    async refundItem(
        orderItemId: string,
        quantity: number,
        reason?: string,
        idempotencyKey?: string,
    ): Promise<unknown> {
        const { data } = await api.post(
            `/orders/items/${orderItemId}/refund`,
            { quantity, reason },
            { headers: withIdempotencyKey(idempotencyKey) },
        );
        return data;
    },
};
