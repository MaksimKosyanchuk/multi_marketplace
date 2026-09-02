import React, { useEffect, useState, useCallback } from 'react';
import { orderService, type Order, type OrderStatus } from '../../../services/orderService';
import { OrderItemCard } from '../../../components/Orderitem/OrderItem';
import styles from './OrdersPage.module.css';

export default function OrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const fetchOrders = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await orderService.getAllOrders();
            setOrders(response.items);
        } catch (err) {
            console.error('Помилка завантаження замовлень:', err);
            setError('Не вдалося завантажити список замовлень');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        let isMounted = true;

        const loadOrders = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await orderService.getAllOrders();
                if (isMounted) {
                    setOrders(response.items);
                }
            } catch (err) {
                if (isMounted) {
                    console.error('Помилка завантаження замовлень:', err);
                    setError('Не вдалося завантажити список замовлень');
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        loadOrders();

        return () => {
            isMounted = false;
        };
    }, [fetchOrders]);

    const handleStatusChange = async (orderId: string, status: OrderStatus) => {
        try {
            await orderService.updateStatus(orderId, status);
            await fetchOrders();
        } catch (err) {
            console.error('Помилка оновлення статусу:', err);
        }
    };

    if (isLoading) return <div className={styles.loader}>Завантаження...</div>;
    if (error) return <div className={styles.error}>{error}</div>;

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Управління замовленнями</h1>

            {orders.length === 0 ? (
                <p className={styles.empty}>Замовлень поки немає.</p>
            ) : (
                <div className={styles.list}>
                    {orders.map((order) => (
                        <OrderItemCard
                            key={order.id}
                            order={order}
                            isAdmin={true}
                            onStatusChange={handleStatusChange}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}