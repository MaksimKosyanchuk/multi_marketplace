import React, {
    useState,
    useCallback,
    startTransition,
    useEffect,
} from 'react';
import { AxiosError } from 'axios';
import { orderService, type Order } from '../../services/orderService';
import { OrderItemCard } from '../../components/Orderitem/OrderItem';
import { Modal } from '../../components/Modal/Modal';
import { Button } from '../../components/Ui/Button/Button';
import styles from './ProfilePage.module.css';
import { useAuth } from '../../context/AuthContext/useAuth';

type ActiveTab = 'info' | 'orders';

export const ProfilePage: React.FC = () => {
    const { socket } = useAuth();

    const [activeTab, setActiveTab] = useState<ActiveTab>('info');
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const fetchOrders = useCallback(async () => {
        setIsLoadingOrders(true);

        try {
            const data = await orderService.getMyOrders();

            startTransition(() => {
                setOrders(data);
            });
        } catch (err) {
            console.error('Помилка завантаження замовлень:', err);

            startTransition(() => {
                setErrorMessage(
                    'Не вдалося завантажити список замовлень.',
                );
            });
        } finally {
            setIsLoadingOrders(false);
        }
    }, []);

    const handleTabChange = (tab: ActiveTab) => {
        setActiveTab(tab);

        if (tab === 'orders') {
            void fetchOrders();
        }
    };

    const handleOrderUpdate = useCallback(async () => {
        try {
            const newOrders = await orderService.getMyOrders();

            startTransition(() => {
                setOrders(newOrders);
            });
        } catch (err) {
            console.error(
                'Помилка оновлення замовлень через WebSocket:',
                err,
            );
        }
    }, []);

    useEffect(() => {
        if (!socket) {
            return;
        }

        socket.on('order_status_updated', handleOrderUpdate);

        return () => {
            socket.off('order_status_updated', handleOrderUpdate);
        };
    }, [socket, handleOrderUpdate]);

    const handlePayOrder = async (orderId: string) => {
        try {
            await orderService.payOrder(orderId);
            await fetchOrders();
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                setErrorMessage(
                    Array.isArray(err.response.data.message)
                        ? err.response.data.message[0]
                        : err.response.data.message,
                );
            } else {
                setErrorMessage('Помилка при оплаті замовлення.');
            }
        }
    };

    const handleCancelOrder = async (orderId: string) => {
        try {
            await orderService.cancelOrder(orderId);
            await fetchOrders();
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                setErrorMessage(
                    Array.isArray(err.response.data.message)
                        ? err.response.data.message[0]
                        : err.response.data.message,
                );
            } else {
                setErrorMessage('Помилка при скасуванні замовлення.');
            }
        }
    };

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Особистий кабінет</h1>

            <div className={styles.tabs}>
                <button
                    type="button"
                    className={`${styles.tabBtn} ${
                        activeTab === 'info' ? styles.activeTab : ''
                    }`}
                    onClick={() => handleTabChange('info')}
                >
                    Особисті дані
                </button>

                <button
                    type="button"
                    className={`${styles.tabBtn} ${
                        activeTab === 'orders' ? styles.activeTab : ''
                    }`}
                    onClick={() => handleTabChange('orders')}
                >
                    Мої замовлення
                </button>
            </div>

            {activeTab === 'info' && (
                <div className={styles.section}>
                    <h2>Дані профілю</h2>

                    {/* Ваша існуюча форма профілю */}
                </div>
            )}

            {activeTab === 'orders' && (
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
                                    onPay={handlePayOrder}
                                    onCancel={handleCancelOrder}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            <Modal
                isOpen={Boolean(errorMessage)}
                onClose={() => setErrorMessage(null)}
                title="Помилка"
                actions={
                    <Button
                        variant="primary"
                        size="small"
                        onClick={() => setErrorMessage(null)}
                    >
                        Зрозуміло
                    </Button>
                }
            >
                <p>{errorMessage}</p>
            </Modal>
        </div>
    );
};

export default ProfilePage;