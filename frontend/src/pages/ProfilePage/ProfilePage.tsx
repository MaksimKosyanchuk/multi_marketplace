import React, {
    useState,
    useCallback,
    startTransition,
    useEffect,
} from 'react';
import { AxiosError } from 'axios';
import { Link } from 'react-router-dom';
import { orderService, type Order } from '../../services/orderService';
import { orderApi } from '../../services/orderApi';
import { sellerAdminService } from '../../services/sellerAdminService';
import {
    categoriesService,
    type Category,
} from '../../services/categoryService';
import { productService } from '../../services/productService';
import { auctionService } from '../../services/auctionService';
import { sellerService } from '../../services/sellerService';
import { OrderItemCard } from '../../components/Orderitem/OrderItem';
import { Modal } from '../../components/Modal/Modal';
import { Button } from '../../components/Ui/Button/Button';
import ProductsPage from '../AdminPage/ProductsPage/ProductsPage';
import styles from './ProfilePage.module.css';
import { useAuth } from '../../context/AuthContext/useAuth';
import { Role, type SellerOrder, type Auction } from '../../types';
import type { Dispute } from '../../types/marketplace.type';
import { reviewService } from '../../services/reviewService';
import { disputeService } from '../../services/disputeService';
import { AuctionCard } from '../../components/AuctionCard/AuctionCard';
import { OrderStatusBadge } from '../../components/OrderStatusBadge/OrderStatusBadge';
import { analyticsService, type SellerAnalytics, type SalesTimelineItem } from '../../services/analyticsService';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

type ActiveTab = 'info' | 'orders' | 'sales' | 'disputes' | 'products' | 'auctions' | 'auctionHistory';

export const ProfilePage: React.FC = () => {
    const { user, socket } = useAuth();
    const userRole = user?.role ?? Role.CUSTOMER;
    const isCustomer = userRole === Role.CUSTOMER;
    const isSeller = userRole === Role.SELLER;
    const isAdmin = userRole === Role.ADMIN;

    const [activeTab, setActiveTab] = useState<ActiveTab>('info');
    const [orders, setOrders] = useState<Order[]>([]);
    const [sales, setSales] = useState<SellerOrder[]>([]);
    const [disputes, setDisputes] = useState<Dispute[]>([]);
    const [reviewedProductIds, setReviewedProductIds] = useState<Set<string>>(new Set());
    const [sellerAnalytics, setSellerAnalytics] = useState<SellerAnalytics | null>(null);
    const [sellerTimeline, setSellerTimeline] = useState<SalesTimelineItem[]>([]);
    const [activeAuctionBids, setActiveAuctionBids] = useState(0);
    const [sellerComparison, setSellerComparison] = useState<{ revenueChange: number | null; ordersChange: number | null } | null>(null);
    const [auctionHistory, setAuctionHistory] = useState<Auction[]>([]);
    const [auctionForm, setAuctionForm] = useState({
        name: '',
        description: '',
        categoryId: '',
        startingPrice: '',
        minBidIncrement: '',
        endsAt: '',
    });
    const [isCreatingAuction, setIsCreatingAuction] = useState(false);
    const [isCreateAuctionOpen, setIsCreateAuctionOpen] = useState(false);
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(false);
    const [isLoadingSales, setIsLoadingSales] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [sellerApplicationStatus, setSellerApplicationStatus] = useState<string | null>(null);

    const fetchOrders = useCallback(async () => {
        setIsLoadingOrders(true);

        try {
            const data = await orderService.getMyOrders();

            startTransition(() => {
                setOrders(data);
            });
            if (isCustomer) {
                const reviews = await reviewService.listMine();
                setReviewedProductIds(new Set(reviews.map((review) => review.productId)));
            }
        } catch (err) {
            console.error('Помилка завантаження замовлень:', err);

            startTransition(() => {
                setErrorMessage('Не вдалося завантажити список замовлень.');
            });
        } finally {
            setIsLoadingOrders(false);
        }
    }, [isCustomer]);

    const fetchSales = useCallback(async () => {
        setIsLoadingSales(true);

        try {
            const data = await sellerAdminService.listOrders();

            startTransition(() => {
                setSales(data);
            });
            if (isSeller) {
                const from = new Date();
                from.setDate(from.getDate() - 29);
                const params = { from: from.toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) };
                const [analytics, timeline, comparison] = await Promise.all([
                    analyticsService.getSellerAnalytics(params),
                    analyticsService.getSellerTimeline(params),
                    analyticsService.getSellerComparison(params),
                ]);
                const ownAuctions = await auctionService.getCreated();
                setSellerAnalytics(analytics);
                setSellerTimeline(timeline);
                setSellerComparison(comparison);
                setActiveAuctionBids(
                    ownAuctions.reduce(
                        (total, auction) =>
                            total + (auction.bids?.filter((bid) => bid.status === 'ACTIVE').length ?? 0),
                        0,
                    ),
                );
            }
        } catch (err) {
            console.error('Помилка завантаження продажів:', err);

            startTransition(() => {
                setErrorMessage('Не вдалося завантажити список продажів.');
            });
        } finally {
            setIsLoadingSales(false);
        }
    }, [isSeller]);

    const fetchAuctionHistory = useCallback(async () => {
        try {
            if (isSeller) {
                const auctions = await auctionService.getCreated();
                setAuctionHistory(auctions);
            } else {
                setAuctionHistory(await auctionService.getParticipating());
            }
        } catch {
            setErrorMessage('Не вдалося завантажити історію аукціонів.');
        }
    }, [isSeller]);

    const fetchDisputes = useCallback(async () => {
        try {
            setDisputes(await (isSeller
                ? disputeService.listSeller()
                : disputeService.listCustomer()));
        } catch {
            setErrorMessage('Не вдалося завантажити спори.');
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

    const fetchSellerApplication = useCallback(async () => {
        if (!isCustomer) return;
        try {
            const application = (await sellerService.getMine()) as { status?: string };
            setSellerApplicationStatus(application.status ?? null);
        } catch {
            setSellerApplicationStatus(null);
        }
    }, [isCustomer]);

    const applyForSeller = async () => {
        try {
            const application = (await sellerService.apply(
                user?.nickName ?? '',
                'Заявка на статус продавця',
            )) as { status?: string };
            setSellerApplicationStatus(application.status ?? 'PENDING');
        } catch (err) {
            console.error('Помилка подачі заявки продавця:', err);
            setErrorMessage('Не вдалося подати заявку продавця.');
        }
    };

    const handleTabChange = (tab: ActiveTab) => {
        setActiveTab(tab);

        if (tab === 'orders' && (isCustomer || isSeller)) {
            void fetchOrders();
        }

        if (tab === 'sales' && isSeller) {
            void fetchSales();
        }
        if (tab === 'disputes' && (isCustomer || isSeller)) {
            void fetchDisputes();
        }
        if ((tab === 'auctionHistory' && isCustomer) || (tab === 'auctions' && isSeller)) {
            void fetchAuctionHistory();
        }
    };

    const handleOrderUpdate = useCallback(
        async (payload?: { orderId?: string; status?: string }) => {
            if (payload?.orderId && payload.status) {
                setOrders((current) =>
                    current.map((order) =>
                        order.id === payload.orderId
                            ? { ...order, status: payload.status as Order['status'] }
                            : order,
                    ),
                );
            }
            if (payload?.status === 'PAYMENT_PENDING') {
                return;
            }
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

        const handleOrderStatusUpdate = (payload?: { orderId?: string; status?: string }) => {
            if (isCustomer) void handleOrderUpdate(payload);
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
        void fetchSellerApplication();
    }, [fetchCategories, fetchSellerApplication]);

    const handlePayOrder = async (orderId: string) => {
        try {
            setOrders((current) =>
                current.map((order) =>
                    order.id === orderId
                        ? { ...order, status: 'PAYMENT_PENDING' }
                        : order,
                ),
            );
            await orderService.payOrder(orderId);
            setOrders((current) =>
                current.map((order) =>
                    order.id === orderId
                        ? { ...order, status: 'PROCESSING' }
                        : order,
                ),
            );
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
            const order = orders.find((current) => current.id === orderId);
            if (order?.status === 'PAYMENT_PENDING') {
                await orderApi.cancelPendingPayment(orderId);
            } else {
                await orderService.cancelOrder(orderId);
            }
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

    const handleCancelSellerOrder = async (sellerOrderId: string) => {
        try {
            await orderApi.cancelCustomerSellerOrder(sellerOrderId);
            await fetchOrders();
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                setErrorMessage(
                    Array.isArray(err.response.data.message)
                        ? err.response.data.message[0]
                        : err.response.data.message,
                );
            } else {
                setErrorMessage('Помилка при скасуванні замовлення продавця.');
            }
        }
    };

    const handleCancelOwnSellerOrder = async (sellerOrderId: string) => {
        try {
            await orderApi.cancelSellerOrder(sellerOrderId);
            await fetchSales();
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                setErrorMessage(
                    Array.isArray(err.response.data.message)
                        ? err.response.data.message[0]
                        : err.response.data.message,
                );
            } else {
                setErrorMessage('Помилка при скасуванні субзамовлення.');
            }
        }
    };

    const handleReview = async (orderItemId: string) => {
        const rating = Number(window.prompt('Оцінка від 1 до 5'));
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
        await reviewService.create(orderItemId, rating, window.prompt('Ваш коментар') ?? undefined);
        const productId = orders
            .flatMap((order) => order.sellerOrders ?? [])
            .flatMap((sellerOrder) => sellerOrder.items)
            .find((item) => item.id === orderItemId)?.productId;
        if (productId) {
            setReviewedProductIds((current) => new Set(current).add(productId));
        }
        await fetchOrders();
    };

    const handleOpenDispute = async (sellerOrderId: string) => {
        const subject = window.prompt('Тема спору');
        const description = window.prompt('Опишіть проблему');
        if (!subject || !description) return;
        await disputeService.open(sellerOrderId, subject, description);
        await fetchDisputes();
    };

    const handleSellerOrderStatusChange = async (
        sellerOrderId: string,
        status: 'PROCESSING' | 'SHIPPED' | 'COMPLETED',
        trackingNumber?: string,
    ) => {
        try {
            await orderApi.updateSellerStatus(sellerOrderId, status, trackingNumber);
            await fetchSales();
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                setErrorMessage(
                    Array.isArray(err.response.data.message)
                        ? err.response.data.message[0]
                        : err.response.data.message,
                );
            } else {
                setErrorMessage('Помилка при зміні статусу субзамовлення.');
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
                            onSellerCancel={handleCancelSellerOrder}
                            onReview={handleReview}
                            onOpenDispute={handleOpenDispute}
                            reviewedProductIds={reviewedProductIds}
                        />
                    ))}
                </div>
            )}
        </div>
    );

    const renderDisputes = () => (
        <div className={styles.section}>
            <h2>Мої спори</h2>
            <div className={styles.salesList}>
                {disputes.length === 0 ? <p>Спорів немає.</p> : disputes.map((dispute) => (
                    <article className={styles.saleCard} key={dispute.id}>
                        <div className={styles.saleHeader}>
                            <strong>{dispute.subject}</strong>
                            <span className={`${styles.disputeBadge} ${styles[`dispute${dispute.status}`] ?? ''}`}>
                                {{
                                    OPEN: 'Відкритий',
                                    UNDER_REVIEW: 'На розгляді',
                                    RESOLVED_FOR_CUSTOMER: 'Вирішено на користь покупця',
                                    RESOLVED_FOR_SELLER: 'Вирішено на користь продавця',
                                    CLOSED: 'Закритий',
                                }[dispute.status] ?? dispute.status}
                            </span>
                        </div>
                        <p>{dispute.description}</p>
                        {dispute.resolution && <p><strong>Рішення:</strong> {dispute.resolution}</p>}
                    </article>
                ))}
            </div>
        </div>
    );

    const renderSellerSales = () => (
        <div className={styles.section}>
            <div className={styles.sectionHeader}>
                <h2>Мої продажі</h2>
            </div>
            {sellerAnalytics && (
                <>
                    <div className={styles.kpiGrid}>
                        <div className={styles.kpiCard}>
                            <span className={styles.label}>Власна виручка</span>
                            <strong>${sellerAnalytics.revenue.toFixed(2)}</strong>
                        </div>
                        <div className={styles.kpiCard}>
                            <span className={styles.label}>Суб-замовлення</span>
                            <strong>{sellerAnalytics.orders}</strong>
                        </div>
                        <div className={styles.kpiCard}>
                            <span className={styles.label}>Завершені</span>
                            <strong>{sellerAnalytics.completedOrders}</strong>
                        </div>
                        <div className={styles.kpiCard}>
                            <span className={styles.label}>Поточні ставки на лоти</span>
                            <strong>{activeAuctionBids}</strong>
                        </div>
                        <div className={styles.kpiCard}>
                            <span className={styles.label}>Порівняння виручки</span>
                            <strong>
                                {sellerComparison?.revenueChange == null
                                    ? '—'
                                    : `${sellerComparison.revenueChange >= 0 ? '+' : ''}${(sellerComparison.revenueChange * 100).toFixed(1)}%`}
                            </strong>
                        </div>
                    </div>
                    <div className={styles.chartSection}>
                        <h3>Продажі за останні 30 днів</h3>
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={sellerTimeline}>
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip />
                                <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="#dbeafe" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </>
            )}

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
                                        <OrderStatusBadge status={sale.status} scope="suborder" />
                                    </div>
                                </div>
                                <div className={styles.saleAmount}>
                                    ${Number(sale.sellerEarnings).toFixed(2)}
                                </div>
                            </div>
                            {['NEW', 'PAYMENT_PENDING', 'PROCESSING', 'SHIPPED'].includes(sale.status) ? (
                                <select
                                    className={styles.statusSelect}
                                    value=""
                                    onChange={(event) => {
                                        const nextStatus = event.target.value as
                                            | 'PROCESSING'
                                            | 'SHIPPED'
                                            | 'COMPLETED'
                                            | 'CANCELLED';
                                        if (nextStatus) {
                                            if (nextStatus === 'CANCELLED') {
                                                void handleCancelOwnSellerOrder(sale.id);
                                            } else {
                                                void handleSellerOrderStatusChange(
                                                    sale.id,
                                                    nextStatus,
                                                );
                                            }
                                        }
                                    }}
                                >
                                    <option value="">Змінити статус...</option>
                                    {sale.status === 'NEW' || sale.status === 'PAYMENT_PENDING' ? null : (
                                        <>
                                            {sale.status === 'PROCESSING' && (
                                                <option value="SHIPPED">Відправлено</option>
                                            )}
                                            {sale.status === 'SHIPPED' && (
                                                <option value="COMPLETED">Доставлено</option>
                                            )}
                                        </>
                                    )}
                                    <option value="CANCELLED">Скасувати</option>
                                </select>
                            ) : null}

                            <div className={styles.saleItems}>
                                {sale.items.map((item) => (
                                    <div
                                        key={item.id}
                                        className={styles.saleItemRow}
                                    >
                                        <span>
                                            {item.product?.type === 'AUCTION'
                                                ? 'Аукціон'
                                                : 'Товар'}:{' '}
                                            {item.productName}
                                        </span>
                                        <span>× {item.quantity}</span>
                                        <span>
                                            ${Number(item.totalAmount).toFixed(2)}
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
            <h2>Історія аукціонів</h2>
            {auctionHistory.length === 0 ? (
                <p>Аукціонів немає.</p>
            ) : (
                <div className={styles.ordersList}>
                    {auctionHistory.map((auction) => (
                        <div key={auction.id} className={styles.saleItemRow}>
                            <span>
                                {auction.product?.name ?? 'Аукціон'} —{' '}
                                {auction.status} — $
                                {Number(auction.currentPrice).toFixed(2)}
                            </span>
                            <Link
                                to={`/auction/${auction.id}`}
                                className={styles.adminLink}
                            >
                                Перейти
                            </Link>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const createAuction = async (event: React.FormEvent) => {
        event.preventDefault();
        if (
            !auctionForm.name.trim() ||
            !auctionForm.categoryId ||
            !auctionForm.startingPrice ||
            !auctionForm.minBidIncrement ||
            !auctionForm.endsAt
        ) {
            setErrorMessage('Заповніть усі поля аукціону.');
            return;
        }
        setIsCreatingAuction(true);
        try {
            const productData = new FormData();
            productData.append('name', auctionForm.name.trim());
            productData.append('description', auctionForm.description.trim());
            productData.append('categoryId', auctionForm.categoryId);
            productData.append('type', 'AUCTION');
            productData.append('price', auctionForm.startingPrice);
            productData.append('stock', '1');
            const product = await productService.createProduct(productData);
            await auctionService.create({
                productId: product.id,
                startingPrice: Number(auctionForm.startingPrice),
                minBidIncrement: Number(auctionForm.minBidIncrement),
                startsAt: new Date().toISOString(),
                endsAt: new Date(auctionForm.endsAt).toISOString(),
            });
            setAuctionForm({
                name: '',
                description: '',
                categoryId: '',
                startingPrice: '',
                minBidIncrement: '',
                endsAt: '',
            });
            setIsCreateAuctionOpen(false);
            await fetchAuctionHistory();
        } catch (err) {
            console.error('Помилка створення аукціону:', err);
            const responseMessage =
                err instanceof AxiosError ? err.response?.data?.message : undefined;
            setErrorMessage(
                responseMessage
                    ? Array.isArray(responseMessage)
                        ? responseMessage.join(', ')
                        : String(responseMessage)
                    : 'Не вдалося створити аукціон.',
            );
        } finally {
            setIsCreatingAuction(false);
        }
    };

    const handleDeleteAuction = async (product: { id: string }) => {
        try {
            await productService.deleteProduct(product.id);
            await fetchAuctionHistory();
        } catch (err) {
            console.error('Помилка скасування аукціону:', err);
            setErrorMessage('Не вдалося скасувати аукціон.');
        }
    };

    const handlePublishAuction = async (product: { id: string }) => {
        try {
            await productService.submitForApproval(product.id);
            await fetchAuctionHistory();
        } catch (err) {
            console.error('Помилка публікації аукціону:', err);
            setErrorMessage('Не вдалося відправити аукціон на модерацію.');
        }
    };

    const renderSellerAuctions = () => (
        <div className={styles.section}>
            <div className={styles.sectionHeader}>
                <h2>Мої аукціони</h2>
                <Button type="button" onClick={() => setIsCreateAuctionOpen(true)}>
                    Створити аукціон
                </Button>
            </div>
            {auctionHistory.length === 0 ? (
                <p>Аукціонів немає.</p>
            ) : (
                <div className={styles.salesList}>
                    {auctionHistory.map((auction) => (
                        <AuctionCard
                            key={auction.id}
                            product={{
                                ...(auction.product ?? {
                                    id: auction.productId,
                                    name: 'Аукціон',
                                    description: '',
                                    sellerId: user?.id ?? '',
                                    price: Number(auction.currentPrice),
                                    stock: 1,
                                    categoryId: '',
                                    createdAt: '',
                                    updatedAt: '',
                                    isArchived: false,
                                }),
                                type: 'AUCTION',
                                auctionId: auction.id,
                                auctionStatus: auction.status,
                            }}
                            onDelete={handleDeleteAuction}
                            onPublish={handlePublishAuction}
                        />
                    ))}
                </div>
            )}
        </div>
    );

    const tabs = isSeller
        ? ([
              { key: 'orders', label: 'Історія покупок' },
              { key: 'sales', label: 'Мої продажі' },
              { key: 'disputes', label: 'Мої спори' },
              { key: 'auctions', label: 'Аукціони' },
              { key: 'products', label: 'Товари' },
              { key: 'info', label: 'Мої дані' },
          ] as Array<{ key: ActiveTab; label: string }>)
        : ([
              { key: 'info', label: 'Особисті дані' },
              ...(isCustomer
                  ? [
                        { key: 'orders', label: 'Історія покупок' },
                        { key: 'disputes', label: 'Мої спори' },
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
                            <>
                                <div className={styles.profileHint}>
                                    Ви можете купувати товари в каталозі.
                                </div>
                                {sellerApplicationStatus === 'PENDING' ? (
                                    <div className={styles.profileHint}>
                                        Заявка на статус продавця вже подана та очікує перевірки.
                                    </div>
                                ) : sellerApplicationStatus !== 'APPROVED' ? (
                                    <Button type="button" onClick={() => void applyForSeller()}>
                                        Подати заявку на продавця
                                    </Button>
                                ) : null}
                            </>
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
            {activeTab === 'disputes' && (isCustomer || isSeller) && renderDisputes()}
            {activeTab === 'auctionHistory' && isCustomer && renderAuctionHistory()}
            {activeTab === 'auctions' && isSeller && renderSellerAuctions()}
            {activeTab === 'products' && isSeller && <ProductsPage sellerMode />}

            <Modal
                isOpen={isCreateAuctionOpen}
                onClose={() => setIsCreateAuctionOpen(false)}
                title="Створити аукціон"
                actions={
                    <>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setIsCreateAuctionOpen(false)}
                        >
                            Скасувати
                        </Button>
                        <Button
                            type="submit"
                            form="create-auction-form"
                            disabled={isCreatingAuction}
                        >
                            {isCreatingAuction ? 'Створення...' : 'Створити'}
                        </Button>
                    </>
                }
            >
                <form id="create-auction-form" onSubmit={createAuction} className={styles.form}>
                    <input
                        required
                        placeholder="Назва аукціону"
                        value={auctionForm.name}
                        onChange={(event) =>
                            setAuctionForm((current) => ({ ...current, name: event.target.value }))
                        }
                    />
                    <textarea
                        placeholder="Опис"
                        value={auctionForm.description}
                        onChange={(event) =>
                            setAuctionForm((current) => ({ ...current, description: event.target.value }))
                        }
                    />
                    <select
                        required
                        value={auctionForm.categoryId}
                        onChange={(event) =>
                            setAuctionForm((current) => ({ ...current, categoryId: event.target.value }))
                        }
                    >
                        <option value="">Оберіть категорію</option>
                        {categories.map((category) => (
                            <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                    </select>
                    <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Стартова ціна"
                        value={auctionForm.startingPrice}
                        onChange={(event) =>
                            setAuctionForm((current) => ({ ...current, startingPrice: event.target.value }))
                        }
                    />
                    <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Крок ставки"
                        value={auctionForm.minBidIncrement}
                        onChange={(event) =>
                            setAuctionForm((current) => ({ ...current, minBidIncrement: event.target.value }))
                        }
                    />
                    <input
                        required
                        type="datetime-local"
                        value={auctionForm.endsAt}
                        onChange={(event) =>
                            setAuctionForm((current) => ({ ...current, endsAt: event.target.value }))
                        }
                    />
                </form>
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
