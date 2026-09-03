import React from 'react';
import type { OrderStatus } from '../../services/orderService';
import type { SellerOrderStatus } from '../../types';
import styles from './OrderStatusBadge.module.css';

type RootStatus = OrderStatus;
type SubOrderStatus = SellerOrderStatus;

interface OrderStatusBadgeProps {
    status: RootStatus | SubOrderStatus;
    scope?: 'root' | 'suborder';
    className?: string;
}

const rootStatusLabels: Record<RootStatus, string> = {
    NEW: 'Очікує оплати',
    PAYMENT_PENDING: 'Оплата в обробці',
    PROCESSING: 'Оплачено',
    SHIPPED: 'Оплачено',
    COMPLETED: 'Оплачено',
    CANCELLED: 'Скасовано',
    PARTIALLY_SHIPPED: 'Оплачено',
    PARTIALLY_COMPLETED: 'Оплачено',
    PARTIALLY_CANCELLED: 'Оплачено',
};

const subOrderStatusLabels: Record<SubOrderStatus, string> = {
    NEW: 'Очікує оплати',
    PAYMENT_PENDING: 'Оплата в обробці',
    PROCESSING: 'В обробці',
    SHIPPED: 'Відправлено',
    COMPLETED: 'Доставлено',
    CANCELLED: 'Скасовано',
};

const statusClassNames: Record<string, string> = {
    NEW: styles.statusNew,
    PAYMENT_PENDING: styles.statusPending,
    PROCESSING: styles.statusProcessing,
    SHIPPED: styles.statusShipped,
    COMPLETED: styles.statusCompleted,
    CANCELLED: styles.statusCancelled,
    PARTIALLY_SHIPPED: styles.statusShipped,
    PARTIALLY_COMPLETED: styles.statusCompleted,
    PARTIALLY_CANCELLED: styles.statusCancelled,
};

export const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({
    status,
    scope = 'suborder',
    className,
}) => {
    const labels = scope === 'root' ? rootStatusLabels : subOrderStatusLabels;
    const label = labels[status as keyof typeof labels] ?? 'Невідомий статус';

    return (
        <span className={`${styles.statusBadge} ${statusClassNames[status] ?? ''} ${className ?? ''}`}>
            {label}
        </span>
    );
};
