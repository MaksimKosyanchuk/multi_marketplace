import React, {
    useState,
    useCallback,
    startTransition,
    useEffect,
} from 'react';
import { AxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
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
import ProductsPage from '../AdminPage/ProductsPage/ProductsPage';
import styles from './ProfilePage.module.css';
import { useAuth } from '../../context/AuthContext/useAuth';
import { Role, type SellerOrder, type Auction } from '../../types';
import type { Dispute } from '../../types/marketplace.type';
import { reviewService } from '../../services/reviewService';
import { disputeService } from '../../services/disputeService';
import { analyticsService, type SellerAnalytics, type SalesTimelineItem } from '../../services/analyticsService';
import type { ActiveTab, AuctionFormState } from './components/types';
import { ProfileTabsNav } from './components/ProfileTabsNav';
import { InfoTab } from './components/InfoTab';
import { CustomerOrdersTab } from './components/customer/CustomerOrdersTab';
import { AuctionHistoryTab } from './components/customer/AuctionHistoryTab';
import { DisputesTab } from './components/shared/DisputesTab';
import { ErrorModal } from './components/shared/ErrorModal';
import { SellerSalesTab } from './components/seller/SellerSalesTab';
import { SellerAuctionsTab } from './components/seller/SellerAuctionsTab';
import { CreateAuctionModal } from './components/seller/CreateAuctionModal';

export const ProfilePage: React.FC = () => {
    const { user, socket } = useAuth();
    const navigate = useNavigate();
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
    const [auctionForm, setAuctionForm] = useState<AuctionFormState>({
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
        queueMicrotask(() => {
            void fetchCategories();
            void fetchSellerApplication();
        });
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
        try {
            await reviewService.create(orderItemId, rating, window.prompt('Ваш коментар') ?? undefined);
        } catch {
            setErrorMessage('Не вдалося залишити відгук.');
            return;
        }
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
        try {
            await disputeService.open(sellerOrderId, subject, description);
            await fetchDisputes();
        } catch {
            setErrorMessage('Не вдалося відкрити спір.');
        }
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
            <ProfileTabsNav
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={handleTabChange}
            />
            {activeTab === 'info' && (
                <InfoTab
                    user={user}
                    userRole={userRole}
                    isCustomer={isCustomer}
                    isSeller={isSeller}
                    isAdmin={isAdmin}
                    sellerApplicationStatus={sellerApplicationStatus}
                    onApplyForSeller={() => void applyForSeller()}
                />
            )}
            {activeTab === 'orders' && (isCustomer || isSeller) && (
                <CustomerOrdersTab
                    orders={orders}
                    isLoadingOrders={isLoadingOrders}
                    reviewedProductIds={reviewedProductIds}
                    onPay={handlePayOrder}
                    onCancel={handleCancelOrder}
                    onSellerCancel={handleCancelSellerOrder}
                    onReview={handleReview}
                    onOpenDispute={handleOpenDispute}
                />
            )}
            {activeTab === 'sales' && isSeller && (
                <SellerSalesTab
                    sellerAnalytics={sellerAnalytics}
                    activeAuctionBids={activeAuctionBids}
                    sellerComparison={sellerComparison}
                    sellerTimeline={sellerTimeline}
                    isLoadingSales={isLoadingSales}
                    sales={sales}
                    onNavigateToProduct={(productId) => navigate(`/product/${productId}`)}
                    onStatusChange={handleSellerOrderStatusChange}
                    onCancelOwnSellerOrder={handleCancelOwnSellerOrder}
                />
            )}
            {activeTab === 'disputes' && (isCustomer || isSeller) && (
                <DisputesTab disputes={disputes} />
            )}
            {activeTab === 'auctionHistory' && isCustomer && (
                <AuctionHistoryTab auctionHistory={auctionHistory} />
            )}
            {activeTab === 'auctions' && isSeller && (
                <SellerAuctionsTab
                    auctionHistory={auctionHistory}
                    sellerId={user?.id ?? ''}
                    onCreateClick={() => setIsCreateAuctionOpen(true)}
                    onDelete={handleDeleteAuction}
                    onPublish={handlePublishAuction}
                />
            )}
            {activeTab === 'products' && isSeller && <ProductsPage sellerMode />}
            <CreateAuctionModal
                isOpen={isCreateAuctionOpen}
                onClose={() => setIsCreateAuctionOpen(false)}
                auctionForm={auctionForm}
                onFormChange={setAuctionForm}
                categories={categories}
                isCreatingAuction={isCreatingAuction}
                onSubmit={createAuction}
            />
            <ErrorModal message={errorMessage} onClose={() => setErrorMessage(null)} />
        </div>
    );
};

export default ProfilePage;
