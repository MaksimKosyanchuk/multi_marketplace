import React, { startTransition, useCallback, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import styles from '../../ProfilePage.module.css';
import { OrderItemCard } from '../../../../components/Orderitem/OrderItem';
import { orderService, type Order } from '../../../../services/orderService';
import { orderApi } from '../../../../services/orderApi';
import { reviewService } from '../../../../services/reviewService';
import { disputeService } from '../../../../services/disputeService';
import { useAuth } from '../../../../context/AuthContext/useAuth';

interface CustomerOrdersTabProps {
    onError: (message: string) => void;
}

export const CustomerOrdersTab: React.FC<CustomerOrdersTabProps> = ({
    onError,
}) => (
    <CustomerOrdersContent onError={onError} />
);

const CustomerOrdersContent: React.FC<CustomerOrdersTabProps> = ({ onError }) => {
    const { socket, user } = useAuth();
    const isCustomer = user?.role === 'CUSTOMER';
    const [orders, setOrders] = useState<Order[]>([]);
    const [reviewedProductIds, setReviewedProductIds] = useState<Set<string>>(new Set());
    const [isLoadingOrders, setIsLoadingOrders] = useState(false);

    const fetchOrders = useCallback(async () => {
        setIsLoadingOrders(true);
        try {
            const data = await orderService.getMyOrders();
            const reviews = isCustomer ? await reviewService.listMine() : [];
            startTransition(() => {
                setOrders(data);
                setReviewedProductIds(new Set(reviews.map((review) => review.productId)));
            });
        } catch (error: unknown) {
            console.error('Помилка завантаження замовлень:', error);
            onError('Не вдалося завантажити список замовлень.');
        } finally {
            setIsLoadingOrders(false);
        }
    }, [isCustomer, onError]);

    useEffect(() => {
        void fetchOrders();
    }, [fetchOrders]);

    useEffect(() => {
        if (!socket) return;
        const handleUpdate = (payload?: { orderId?: string; status?: string }) => {
            if (payload?.orderId && payload.status) {
                setOrders((current) =>
                    current.map((order) =>
                        order.id === payload.orderId
                            ? { ...order, status: payload.status as Order['status'] }
                            : order,
                    ),
                );
            }
            if (payload?.status !== 'PAYMENT_PENDING') void fetchOrders();
        };
        socket.on('order_status_updated', handleUpdate);
        return () => {
            socket.off('order_status_updated', handleUpdate);
        };
    }, [socket, fetchOrders]);

    const getErrorMessage = (error: unknown, fallback: string) => {
        if (error instanceof AxiosError && error.response?.data?.message) {
            const message = error.response.data.message;
            return Array.isArray(message) ? message[0] : message;
        }
        return fallback;
    };

    const onPay = async (orderId: string) => {
        try {
            await orderService.payOrder(orderId);
            await fetchOrders();
        } catch (error: unknown) {
            onError(getErrorMessage(error, 'Помилка при оплаті замовлення.'));
        }
    };

    const onCancel = async (orderId: string) => {
        try {
            const order = orders.find((current) => current.id === orderId);
            if (order?.status === 'PAYMENT_PENDING') {
                await orderApi.cancelPendingPayment(orderId);
            } else {
                await orderService.cancelOrder(orderId);
            }
            await fetchOrders();
        } catch (error: unknown) {
            onError(getErrorMessage(error, 'Помилка при скасуванні замовлення.'));
        }
    };

    const onSellerCancel = async (sellerOrderId: string) => {
        try {
            await orderApi.cancelCustomerSellerOrder(sellerOrderId);
            await fetchOrders();
        } catch (error: unknown) {
            onError(getErrorMessage(error, 'Помилка при скасуванні замовлення продавця.'));
        }
    };

    const onReview = async (orderItemId: string) => {
        const rating = Number(window.prompt('Оцінка від 1 до 5'));
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
        try {
            await reviewService.create(
                orderItemId,
                rating,
                window.prompt('Ваш коментар') ?? undefined,
            );
            const productId = orders
                .flatMap((order) => order.sellerOrders ?? [])
                .flatMap((sellerOrder) => sellerOrder.items)
                .find((item) => item.id === orderItemId)?.productId;
            if (productId) {
                setReviewedProductIds((current) => new Set(current).add(productId));
            }
            await fetchOrders();
        } catch (error: unknown) {
            onError(getErrorMessage(error, 'Не вдалося залишити відгук.'));
        }
    };

    const onOpenDispute = async (sellerOrderId: string) => {
        const subject = window.prompt('Тема спору');
        const description = window.prompt('Опишіть проблему');
        if (!subject || !description) return;
        try {
            await disputeService.open(sellerOrderId, subject, description);
            await fetchOrders();
        } catch (error: unknown) {
            onError(getErrorMessage(error, 'Не вдалося відкрити спір.'));
        }
    };

    return (
        <div className={styles.section}>
            <h2>Історія замовлень</h2>
            {isLoadingOrders ? (
                <div>Завантаження замовлень...</div>
            ) : orders.length === 0 ? (
                <p>У вас поки немає замовлень.</p>
            ) : (
                <div className={styles.ordersList}>
                    {orders.map((order) => (
                        <OrderItemCard
                            key={order.id}
                            order={order}
                            onPay={onPay}
                            onCancel={onCancel}
                            onSellerCancel={onSellerCancel}
                            onReview={onReview}
                            onOpenDispute={onOpenDispute}
                            reviewedProductIds={reviewedProductIds}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
