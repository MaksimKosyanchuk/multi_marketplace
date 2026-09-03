import { api } from './api';
import { withIdempotencyKey } from './requestMeta';
import type { SellerOrder, SellerOrderStatus } from '../types/marketplace.type';

export interface OrderItem {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    price?: string | number;
    unitPrice?: string | number;
    totalAmount?: string | number;
}

export type OrderStatus =
    | 'NEW'
    | 'PAYMENT_PENDING'
    | 'PROCESSING'
    | 'PARTIALLY_SHIPPED'
    | 'PARTIALLY_COMPLETED'
    | 'PARTIALLY_CANCELLED'
    | 'SHIPPED'
    | 'COMPLETED'
    | 'CANCELLED';

export interface Order {
    id: string;
    userId: string;
    status: OrderStatus;
    totalAmount: string | number;
    createdAt: string;
    items: OrderItem[];
    subtotal?: string | number;
    currency?: string;
    sellerOrders?: SellerOrder[];
    updatedAt?: string;
}

const normalizeOrder = (value: unknown): Order => {
    if (!value || typeof value !== 'object') {
        throw new Error('Invalid order response');
    }

    const source = value as Partial<Order> & { sellerOrders?: SellerOrder[] };
    const sellerItems = (source.sellerOrders ?? []).flatMap(
        (sellerOrder) =>
            (sellerOrder.items ?? []).map((item) => ({
                id: item.id,
                productId: item.productId,
                productName: item.productName ?? 'Товар',
                quantity: item.quantity,
                price: item.unitPrice ?? Number(item.totalAmount) / item.quantity,
                totalAmount: item.totalAmount,
            })),
    );

    return {
        id: source.id ?? '',
        userId: source.userId ?? '',
        status: source.status ?? 'NEW',
        totalAmount: source.totalAmount ?? 0,
        createdAt: source.createdAt ?? '',
        items: Array.isArray(source.items) ? source.items : sellerItems,
        subtotal: source.subtotal,
        currency: source.currency,
        sellerOrders: source.sellerOrders ?? [],
        updatedAt: source.updatedAt,
    };
};

export const orderService = {
    async checkout(): Promise<Order> {
        const response = await api.post<unknown>('/orders/checkout', undefined, {
            headers: withIdempotencyKey(),
        });
        return normalizeOrder(response.data);
    },

    async getMyOrders(): Promise<Order[]> {
        const response = await api.get<unknown[]>('/orders/my');
        return response.data.map(normalizeOrder);
    },

    async payOrder(
        orderId: string,
    ): Promise<{ success: boolean; transactionId: string }> {
        const response = await api.post<Order>(
            `/orders/${orderId}/pay`,
            undefined,
            { headers: withIdempotencyKey() },
        );
        return { success: true, transactionId: response.data.id };
    },

    async cancelOrder(orderId: string): Promise<Order> {
        const response = await api.post<unknown>(`/orders/${orderId}/cancel`);
        return normalizeOrder(response.data);
    },

    getAllOrders: async (): Promise<{ items: Order[]; meta: unknown }> => {
        const response = await api.get('/orders');
        return response.data;
    },

    async updateStatus(orderId: string, status: OrderStatus): Promise<Order> {
        const response = await api.patch<Order>(`/orders/${orderId}/status`, {
            status,
        });
        return response.data;
    },
};
