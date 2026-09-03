import React, {
    useState,
    useCallback,
    startTransition,
    useEffect,
} from 'react';
import { AxiosError } from 'axios';
import { Link } from 'react-router-dom';
import { orderService, type Order } from '../../services/orderService';
import { sellerAdminService } from '../../services/sellerAdminService';
import { OrderItemCard } from '../../components/Orderitem/OrderItem';
import { Modal } from '../../components/Modal/Modal';
import { Button } from '../../components/Ui/Button/Button';
import styles from './ProfilePage.module.css';
import { useAuth } from '../../context/AuthContext/useAuth';
import { Role, type SellerOrder } from '../../types';

type ActiveTab = 'info' | 'orders' | 'sales';

export const ProfilePage: React.FC = () => {
    const { user, socket } = useAuth();
    const userRole = user?.role ?? Role.CUSTOMER;
    const isCustomer = userRole === Role.CUSTOMER;
    const isSeller = userRole === Role.SELLER;
    const isAdmin = userRole === Role.ADMIN;

    const [activeTab, setActiveTab] = useState<ActiveTab>('info');
    const [orders, setOrders] = useState<Order[]>([]);
    const [sales, setSales] = useState<SellerOrder[]>([]);
    const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(false);
    const [isLoadingSales, setIsLoadingSales] = useState<boolean>(false);
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
                setErrorMessage('Не вдалося завантажити список замовлень.');
            });
        } finally {
            setIsLoadingOrders(false);
        }
    }, []);

    const fetchSales = useCallback(async () => {
        setIsLoadingSales(true);

        try {
            const data = await sellerAdminService.listOrders();

            startTransition(() => {
                setSales(data);
            });
        } catch (err) {
            console.error('Помилка завантаження продажів:', err);

            startTransition(() => {
                setErrorMessage('Не вдалося завантажити список продажів.');
            });
        } finally {
            setIsLoadingSales(false);
        }
    }, []);

    const handleTabChange = (tab: ActiveTab) => {
        setActiveTab(tab);

        if (tab === 'orders' && isCustomer) {
            void fetchOrders();
        }

        if (tab === 'sales' && isSeller) {
            void fetchSales();
        }
    };

    const handleOrderUpdate = useCallback(
        async (_payload?: { orderId?: string; status?: string }) => {
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
        },
        [],
    );

    useEffect(() => {
        if (!socket || !isCustomer) {
            return;
        }

        socket.on('order_status_updated', handleOrderUpdate);

        return () => {
            socket.off('order_status_updated', handleOrderUpdate);
        };
    }, [socket, isCustomer, handleOrderUpdate]);

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

    const renderCustomerOrders = () => (
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
    );

    const renderSellerSales = () => (
        <div className={styles.section}>
            <h2>Мої продажі</h2>

            {isLoadingSales ? (
                <div>Завантаження продажів...</div>
            ) : sales.length === 0 ? (
                <p>У вас поки немає продажів.</p>
            ) : (
                <div className={styles.salesList}>
                    {sales.map((sale) => (
                        <div key={sale.id} className={styles.saleCard}>
                            <div className={styles.saleHeader}>
                                <div>
                                    <div className={styles.saleId}>
                                        Замовлення #{sale.id.slice(0, 8)}
                                    </div>
                                    <div className={styles.saleMeta}>
                                        Статус: {sale.status}
                                    </div>
                                </div>
                                <div className={styles.saleAmount}>
                                    ${sale.sellerEarnings.toFixed(2)}
                                </div>
                            </div>

                            <div className={styles.saleItems}>
                                {sale.items.map((item) => (
                                    <div
                                        key={item.id}
                                        className={styles.saleItemRow}
                                    >
                                        <span>{item.productName}</span>
                                        <span>× {item.quantity}</span>
                                        <span>
                                            ${item.totalAmount.toFixed(2)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const tabs = [] as Array<{ key: ActiveTab; label: string }>;

    tabs.push({ key: 'info', label: 'Особисті дані' });
    if (isCustomer) tabs.push({ key: 'orders', label: 'Мої замовлення' });
    if (isSeller) tabs.push({ key: 'sales', label: 'Мої продажі' });

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Особистий кабінет</h1>

            <div className={styles.tabs}>
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        className={`${styles.tabBtn} ${
                            activeTab === tab.key ? styles.activeTab : ''
                        }`}
                        onClick={() => handleTabChange(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'info' && (
                <div className={styles.section}>
                    <h2>Дані профілю</h2>

                    <div className={styles.profileInfoCard}>
                        <div className={styles.profileRow}>
                            <span className={styles.label}>Email</span>
                            <strong>{user?.email ?? '—'}</strong>
                        </div>
                        <div className={styles.profileRow}>
                            <span className={styles.label}>Нікнейм</span>
                            <strong>{user?.nickName ?? '—'}</strong>
                        </div>
                        <div className={styles.profileRow}>
                            <span className={styles.label}>Роль</span>
                            <strong>{userRole}</strong>
                        </div>

                        {isCustomer && (
                            <div className={styles.profileHint}>
                                Ви можете купувати товари в каталозі.
                            </div>
                        )}
                        {isSeller && (
                            <div className={styles.profileHint}>
                                Ви можете продавати товари і відстежувати
                                продажі.
                            </div>
                        )}
                        {isAdmin && (
                            <div className={styles.profileActions}>
                                <Link to="/admin" className={styles.adminLink}>
                                    Відкрити адмін-панель
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'orders' && isCustomer && renderCustomerOrders()}
            {activeTab === 'sales' && isSeller && renderSellerSales()}

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
