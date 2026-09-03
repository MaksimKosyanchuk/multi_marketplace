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
import {
    categoriesService,
    type Category,
} from '../../services/categoryService';
import { productService } from '../../services/productService';
import { auctionService } from '../../services/auctionService';
import { OrderItemCard } from '../../components/Orderitem/OrderItem';
import { Modal } from '../../components/Modal/Modal';
import { Button } from '../../components/Ui/Button/Button';
import ProductsPage from '../AdminPage/ProductsPage/ProductsPage';
import styles from './ProfilePage.module.css';
import { useAuth } from '../../context/AuthContext/useAuth';
import { Role, type SellerOrder, type Auction } from '../../types';

type ActiveTab = 'info' | 'orders' | 'sales' | 'products' | 'createdAuctions' | 'auctionHistory';

export const ProfilePage: React.FC = () => {
    const { user, socket } = useAuth();
    const userRole = user?.role ?? Role.CUSTOMER;
    const isCustomer = userRole === Role.CUSTOMER;
    const isSeller = userRole === Role.SELLER;
    const isAdmin = userRole === Role.ADMIN;

    const [activeTab, setActiveTab] = useState<ActiveTab>('info');
    const [orders, setOrders] = useState<Order[]>([]);
    const [sales, setSales] = useState<SellerOrder[]>([]);
    const [auctionHistory, setAuctionHistory] = useState<Auction[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(false);
    const [isLoadingSales, setIsLoadingSales] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isCreateProductOpen, setIsCreateProductOpen] = useState(false);
    const [isCreatingProduct, setIsCreatingProduct] = useState(false);
    const [productForm, setProductForm] = useState({
        name: '',
        description: '',
        price: '',
        stock: '',
        categoryId: '',
        type: '',
        minBidIncrement: '',
        auctionEndsAt: '',
    });

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

    const fetchAuctionHistory = useCallback(async () => {
        try {
            setAuctionHistory(
                isSeller
                    ? await auctionService.getCreated()
                    : await auctionService.getParticipating(),
            );
        } catch {
            setErrorMessage('Не вдалося завантажити історію аукціонів.');
        }
    }, [isSeller]);

    const fetchCategories = useCallback(async () => {
        if (!isSeller) {
            return;
        }

        try {
            const data = await categoriesService.getAllCategories();
            setCategories(data);
        } catch (err) {
            console.error('Помилка завантаження категорій:', err);
        }
    }, [isSeller]);

    const handleTabChange = (tab: ActiveTab) => {
        setActiveTab(tab);

        if (tab === 'orders' && (isCustomer || isSeller)) {
            void fetchOrders();
        }

        if (tab === 'sales' && isSeller) {
            void fetchSales();
        }
        if (tab === 'createdAuctions' || tab === 'auctionHistory') {
            void fetchAuctionHistory();
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
        if (!socket || (!isCustomer && !isSeller)) {
            return;
        }

        const handleOrderStatusUpdate = () => {
            if (isCustomer) void handleOrderUpdate();
            if (isSeller) void fetchSales();
        };
        const handleReconnect = () => {
            if (isCustomer) void fetchOrders();
            if (isSeller) void fetchSales();
        };

        socket.on('order_status_updated', handleOrderStatusUpdate);
        socket.on('connect', handleReconnect);

        return () => {
            socket.off('order_status_updated', handleOrderStatusUpdate);
            socket.off('connect', handleReconnect);
        };
    }, [
        socket,
        isCustomer,
        isSeller,
        handleOrderUpdate,
        fetchOrders,
        fetchSales,
    ]);

    useEffect(() => {
        void fetchCategories();
    }, [fetchCategories]);

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

    const resetProductForm = () => {
        setProductForm({
            name: '',
            description: '',
            price: '',
            stock: '',
            categoryId: '',
            type: '',
            minBidIncrement: '',
            auctionEndsAt: '',
        });
    };

    const handleCreateProduct = async () => {
        if (!productForm.name.trim()) {
            setErrorMessage('Назва товару є обов’язковою.');
            return;
        }

        if (!productForm.categoryId) {
            setErrorMessage('Оберіть категорію для товару.');
            return;
        }
        if (!productForm.type) {
            setErrorMessage('Оберіть тип товару.');
            return;
        }

        if (!productForm.price || Number(productForm.price) <= 0) {
            setErrorMessage('Ціна повинна бути більшою за 0.');
            return;
        }
        if (
            productForm.type === 'AUCTION' &&
            (!productForm.minBidIncrement ||
                Number(productForm.minBidIncrement) <= 0 ||
                !productForm.auctionEndsAt ||
                new Date(productForm.auctionEndsAt) <= new Date())
        ) {
            setErrorMessage(
                'Для аукціону вкажіть мінімальний крок ставки та майбутній дедлайн.',
            );
            return;
        }

        if (
            productForm.type !== 'AUCTION' &&
            (!productForm.stock || Number(productForm.stock) <= 0)
        ) {
            setErrorMessage('Кількість повинна бути більшою за 0.');
            return;
        }

        setIsCreatingProduct(true);

        try {
            const formData = new FormData();
            formData.append('name', productForm.name.trim());
            formData.append('description', productForm.description.trim());
            formData.append('price', String(productForm.price));
            formData.append(
                'stock',
                productForm.type === 'AUCTION' ? '1' : String(productForm.stock),
            );
            formData.append('categoryId', productForm.categoryId);
            formData.append('type', productForm.type);

            const created = await productService.createProduct(formData);
            if (productForm.type === 'AUCTION') {
                await auctionService.create({
                    productId: created.id,
                    startingPrice: Number(productForm.price),
                    minBidIncrement: Number(productForm.minBidIncrement),
                    startsAt: new Date().toISOString(),
                    endsAt: new Date(productForm.auctionEndsAt).toISOString(),
                });
            }
            setIsCreateProductOpen(false);
            resetProductForm();
            await fetchSales();
        } catch (err) {
            console.error('Помилка створення товару:', err);
            if (err instanceof AxiosError && err.response?.data?.message) {
                setErrorMessage(
                    Array.isArray(err.response.data.message)
                        ? err.response.data.message[0]
                        : err.response.data.message,
                );
            } else {
                setErrorMessage('Не вдалося створити товар.');
            }
        } finally {
            setIsCreatingProduct(false);
        }
    };

    const renderSellerSales = () => (
        <div className={styles.section}>
            <div className={styles.sectionHeader}>
                <h2>Мої продажі</h2>
                <Button
                    variant="primary"
                    size="small"
                    onClick={() => setIsCreateProductOpen(true)}
                >
                    + Створити товар
                </Button>
            </div>

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

    const renderAuctionHistory = () => (
        <div className={styles.section}>
            <h2>{isSeller ? 'Мої створені аукціони' : 'Історія аукціонів'}</h2>
            {auctionHistory.length === 0 ? (
                <p>Аукціонів немає.</p>
            ) : (
                <div className={styles.ordersList}>
                    {auctionHistory.map((auction) => (
                        <Link key={auction.id} to={`/auction/${auction.id}`}>
                            {auction.product.name} — {auction.status} — $
                            {auction.currentPrice.toFixed(2)}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );

    const tabs = isSeller
        ? ([
              { key: 'orders', label: 'Історія покупок' },
              { key: 'sales', label: 'Мої продажі' },
              { key: 'createdAuctions', label: 'Мої аукціони' },
              { key: 'products', label: 'Товари' },
              { key: 'info', label: 'Мої дані' },
          ] as Array<{ key: ActiveTab; label: string }>)
        : ([
              { key: 'info', label: 'Особисті дані' },
              ...(isCustomer
                  ? [
                        { key: 'orders', label: 'Історія покупок' },
                        { key: 'auctionHistory', label: 'Історія аукціонів' },
                    ]
                  : []),
          ] as Array<{ key: ActiveTab; label: string }>);

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

            {activeTab === 'orders' && (isCustomer || isSeller) && renderCustomerOrders()}
            {activeTab === 'sales' && isSeller && renderSellerSales()}
            {activeTab === 'createdAuctions' && isSeller && renderAuctionHistory()}
            {activeTab === 'auctionHistory' && isCustomer && renderAuctionHistory()}
            {activeTab === 'products' && isSeller && <ProductsPage />}

            <Modal
                isOpen={isCreateProductOpen}
                onClose={() => {
                    setIsCreateProductOpen(false);
                    resetProductForm();
                }}
                title="Створити товар"
                actions={
                    <>
                        <Button
                            variant="secondary"
                            size="small"
                            onClick={() => {
                                setIsCreateProductOpen(false);
                                resetProductForm();
                            }}
                        >
                            Скасувати
                        </Button>
                        <Button
                            variant="primary"
                            size="small"
                            onClick={() => {
                                void handleCreateProduct();
                            }}
                            disabled={isCreatingProduct}
                        >
                            {isCreatingProduct ? 'Створення...' : 'Створити'}
                        </Button>
                    </>
                }
            >
                <div className={styles.productForm}>
                    <label className={styles.field}>
                        <span>Тип товару</span>
                        <select
                            value={productForm.type}
                            onChange={(e) =>
                                setProductForm((prev) => ({
                                    ...prev,
                                    type: e.target.value as 'FIXED_PRICE' | 'AUCTION',
                                }))
                            }
                        >
                            <option value="">Оберіть тип товару</option>
                            <option value="FIXED_PRICE">Звичайний товар</option>
                            <option value="AUCTION">Аукціон</option>
                        </select>
                    </label>
                    {productForm.type && (
                        <>
                    <label className={styles.field}>
                        <span>Назва</span>
                        <input
                            value={productForm.name}
                            onChange={(e) =>
                                setProductForm((prev) => ({
                                    ...prev,
                                    name: e.target.value,
                                }))
                            }
                        />
                    </label>
                    {productForm.type === 'AUCTION' && (
                        <div className={styles.rowTwo}>
                            <label className={styles.field}>
                                <span>Мінімальний крок ставки</span>
                                <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={productForm.minBidIncrement}
                                    onChange={(e) =>
                                        setProductForm((prev) => ({
                                            ...prev,
                                            minBidIncrement: e.target.value,
                                        }))
                                    }
                                />
                            </label>
                            <label className={styles.field}>
                                <span>Дедлайн аукціону</span>
                                <input
                                    type="datetime-local"
                                    value={productForm.auctionEndsAt}
                                    onChange={(e) =>
                                        setProductForm((prev) => ({
                                            ...prev,
                                            auctionEndsAt: e.target.value,
                                        }))
                                    }
                                />
                            </label>
                        </div>
                    )}
                    <label className={styles.field}>
                        <span>Опис</span>
                        <textarea
                            rows={3}
                            value={productForm.description}
                            onChange={(e) =>
                                setProductForm((prev) => ({
                                    ...prev,
                                    description: e.target.value,
                                }))
                            }
                        />
                    </label>

                    <div className={styles.rowTwo}>
                        <label className={styles.field}>
                            <span>
                                {productForm.type === 'AUCTION'
                                    ? 'Стартова ціна'
                                    : 'Ціна'}
                            </span>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={productForm.price}
                                onChange={(e) =>
                                    setProductForm((prev) => ({
                                        ...prev,
                                        price: e.target.value,
                                    }))
                                }
                            />
                        </label>

                        {productForm.type !== 'AUCTION' && <label className={styles.field}>
                            <span>Кількість</span>
                            <input
                                type="number"
                                min="1"
                                value={productForm.stock}
                                onChange={(e) =>
                                    setProductForm((prev) => ({
                                        ...prev,
                                        stock: e.target.value,
                                    }))
                                }
                            />
                        </label>}
                    </div>
                    <label className={styles.field}>
                        <span>Категорія</span>
                        <select
                            value={productForm.categoryId}
                            onChange={(e) =>
                                setProductForm((prev) => ({
                                    ...prev,
                                    categoryId: e.target.value,
                                }))
                            }
                        >
                            <option value="">Оберіть категорію</option>
                            {categories.map((category) => (
                                <option key={category.id} value={category.id}>
                                    {category.name}
                                </option>
                            ))}
                        </select>
                    </label>
                        </>
                    )}
                </div>
            </Modal>

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
