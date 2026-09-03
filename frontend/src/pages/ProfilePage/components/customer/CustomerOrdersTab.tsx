import React from 'react';
import styles from '../../ProfilePage.module.css';
import { OrderItemCard } from '../../../../components/Orderitem/OrderItem';
import type { Order } from '../../../../services/orderService';

interface CustomerOrdersTabProps {
    orders: Order[];
    isLoadingOrders: boolean;
    reviewedProductIds: Set<string>;
    onPay: (orderId: string) => Promise<void>;
    onCancel: (orderId: string) => Promise<void>;
    onSellerCancel: (sellerOrderId: string) => Promise<void>;
    onReview: (orderItemId: string) => Promise<void>;
    onOpenDispute: (sellerOrderId: string) => Promise<void>;
}

export const CustomerOrdersTab: React.FC<CustomerOrdersTabProps> = ({
    orders,
    isLoadingOrders,
    reviewedProductIds,
    onPay,
    onCancel,
    onSellerCancel,
    onReview,
    onOpenDispute,
}) => (
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
