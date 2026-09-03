import { api } from './api';
import { withIdempotencyKey } from './requestMeta';

export interface OrderItem {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    price: string | number;
}

export type OrderStatus =
    | 'NEW'
    | 'PAYMENT_PENDING'
    | 'PROCESSING'
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
}

const normalizeOrder = (value: unknown): Order => {
    if (!value || typeof value !== 'object') {
        throw new Error('Invalid order response');
    }

    const source = value as Partial<Order> & {
        sellerOrders?: Array<{
            items?: Array<{
                id: string;
                productId: string;
                productName?: string;
                quantity: number;
                unitPrice: string | number;
            }>;
        }>;
    };
    const sellerItems = (source.sellerOrders ?? []).flatMap(
        (sellerOrder) =>
            (sellerOrder.items ?? []).map((item) => ({
                id: item.id,
                productId: item.productId,
                productName: item.productName ?? 'Товар',
                quantity: item.quantity,
                price: item.unitPrice,
            })),
    );

    return {
        id: source.id ?? '',
        userId: source.userId ?? '',
        status: source.status ?? 'NEW',
        totalAmount: source.totalAmount ?? 0,
        createdAt: source.createdAt ?? '',
        items: Array.isArray(source.items) ? source.items : sellerItems,
    };
};

export const orderService = {
    async checkout(): Promise<Order> {
        const response = await api.post<Order>('/orders/checkout', undefined, {
            headers: withIdempotencyKey(),
        });
        return response.data;
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

    async cancelOrder(orderId: string): Promise<{ order: Order }> {
        const response = await api.post<{ order: Order }>(
            `/orders/${orderId}/cancel`,
        );
        return response.data;
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
