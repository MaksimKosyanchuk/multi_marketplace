import React from 'react';
import styles from '../../ProfilePage.module.css';
import { OrderStatusBadge } from '../../../../components/OrderStatusBadge/OrderStatusBadge';
import type { SellerOrder } from '../../../../types';
import type {
    SellerAnalytics,
    SalesTimelineItem,
} from '../../../../services/analyticsService';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
} from 'recharts';

interface SellerSalesTabProps {
    sellerAnalytics: SellerAnalytics | null;
    activeAuctionBids: number;
    sellerComparison: { revenueChange: number | null; ordersChange: number | null } | null;
    sellerTimeline: SalesTimelineItem[];
    isLoadingSales: boolean;
    sales: SellerOrder[];
    onNavigateToProduct: (productId: string) => void;
    onStatusChange: (
        sellerOrderId: string,
        status: 'PROCESSING' | 'SHIPPED' | 'COMPLETED',
    ) => Promise<void>;
    onCancelOwnSellerOrder: (sellerOrderId: string) => Promise<void>;
}

export const SellerSalesTab: React.FC<SellerSalesTabProps> = ({
    sellerAnalytics,
    activeAuctionBids,
    sellerComparison,
    sellerTimeline,
    isLoadingSales,
    sales,
    onNavigateToProduct,
    onStatusChange,
    onCancelOwnSellerOrder,
}) => (
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
                                            void onCancelOwnSellerOrder(sale.id);
                                        } else {
                                            void onStatusChange(sale.id, nextStatus);
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
                                <div key={item.id} className={styles.saleItemRow}>
                                    <button
                                        type="button"
                                        className={styles.productLink}
                                        onClick={() => onNavigateToProduct(item.productId)}
                                    >
                                        {item.product?.type === 'AUCTION' ? 'Аукціон' : 'Товар'}:{' '}
                                        {item.productName}
                                    </button>
                                    <span>× {item.quantity}</span>
                                    <span>${Number(item.totalAmount).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
);
