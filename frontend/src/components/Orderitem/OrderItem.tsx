import React, { useState } from 'react';
import type { Order, OrderStatus } from '../../services/orderService';
import type { SellerOrder } from '../../types';
import { Button } from '../Ui/Button/Button';
import { Modal } from '../Modal/Modal';
import { OrderStatusBadge } from '../OrderStatusBadge/OrderStatusBadge';
import styles from './OrderItem.module.css';

interface OrderItemProps {
    order: Order;
    onPay?: (orderId: string) => Promise<void>;
    onCancel?: (orderId: string) => Promise<void>;
    onSellerCancel?: (sellerOrderId: string) => Promise<void>;
    onStatusChange?: (orderId: string, status: OrderStatus) => Promise<void>;
    onReview?: (orderItemId: string) => Promise<void>;
    onOpenDispute?: (sellerOrderId: string) => Promise<void>;
    reviewedProductIds?: Set<string>;
    isAdmin?: boolean;
}

const VALID_STATUSES: OrderStatus[] = [
    'NEW',
    'PAYMENT_PENDING',
    'PROCESSING',
    'SHIPPED',
    'COMPLETED',
    'CANCELLED',
    'PARTIALLY_SHIPPED',
    'PARTIALLY_COMPLETED',
    'PARTIALLY_CANCELLED',
];

export const OrderItemCard: React.FC<OrderItemProps> = ({
    order,
    onPay,
    onCancel,
    onSellerCancel,
    onStatusChange,
    onReview,
    onOpenDispute,
    reviewedProductIds,
    isAdmin = false,
}) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    if (!order || typeof order !== 'object' || !order.id || !Array.isArray(order.items)) {
        return (
            <div className={styles.cardError}>
                <p>Помилка: Некоректні дані замовлення.</p>
            </div>
        );
    }

    const handlePay = async () => {
        if (!onPay || !order.id) return;
        setValidationError(null);
        setIsProcessing(true);
        try {
            await onPay(order.id);
        } catch {
            setValidationError('Не вдалося провести оплату. Спробуйте пізніше.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleConfirmCancel = async () => {
        if (!onCancel || !order.id) return;
        setValidationError(null);
        setIsConfirmModalOpen(false);
        setIsProcessing(true);
        try {
            await onCancel(order.id);
        } catch {
            setValidationError('Не вдалося скасувати замовлення.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleStatusSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (!onStatusChange || !order.id) return;
        setValidationError(null);

        const newStatus = e.target.value as OrderStatus;
        
        if (!VALID_STATUSES.includes(newStatus)) {
            setValidationError('Обрано некоректний статус');
            return;
        }

        if (newStatus === order.status) return;

        setIsProcessing(true);
        try {
            await onStatusChange(order.id, newStatus);
        } catch {
            setValidationError('Не вдалося змінити статус замовлення.');
        } finally {
            setIsProcessing(false);
        }
    };

    const isCancelable =
        order.status !== 'CANCELLED' &&
        order.status !== 'COMPLETED' &&
        ['NEW', 'PAYMENT_PENDING', 'PROCESSING', 'SHIPPED'].includes(order.status);

    const isTerminalState =
        order.status === 'CANCELLED' || order.status === 'COMPLETED';

    const isPendingPayment = order.status === 'PAYMENT_PENDING';

    const getAdminOptions = () => {
        if (order.status === 'NEW') {
            return [{ value: 'CANCELLED', label: 'Скасувати' }];
        }

        return [
            { value: 'PROCESSING', label: 'Обробляється' },
            { value: 'SHIPPED', label: 'Відправлено' },
            { value: 'COMPLETED', label: 'Завершено' },
            { value: 'CANCELLED', label: 'Скасувати' },
        ];
    };

    const totalAmount = Number(order.totalAmount);
    const isValidTotal = !isNaN(totalAmount) && totalAmount >= 0;

    const sellerOrders = order.sellerOrders ?? [];
    const unpaidAmount = sellerOrders
        .filter(
            (sellerOrder) =>
                sellerOrder.status === 'NEW' ||
                sellerOrder.status === 'PAYMENT_PENDING',
        )
        .reduce((total, sellerOrder) => total + Number(sellerOrder.subtotal), 0);
    const amountDue = sellerOrders.length > 0 ? unpaidAmount : totalAmount;
    const sellerCanCancel = (sellerOrder: SellerOrder) =>
        sellerOrder.status !== 'CANCELLED' &&
        sellerOrder.status !== 'COMPLETED' &&
        ['NEW', 'PAYMENT_PENDING', 'PROCESSING', 'SHIPPED'].includes(sellerOrder.status);
    const hasUnpaidSellerOrder = sellerOrders.some(
        (sellerOrder) =>
            sellerOrder.status === 'NEW' ||
            sellerOrder.status === 'PAYMENT_PENDING',
    );

    return (
        <>
            <div className={styles.card}>
                {validationError && (
                    <div className={styles.errorAlert}>
                        {validationError}
                    </div>
                )}

                <div className={styles.header}>
                    <div>
                        <span className={styles.orderId}>
                            Замовлення #{order.id.slice(0, 8)}
                        </span>
                        <span className={styles.date}>
                            {order.createdAt
                                ? new Date(order.createdAt).toLocaleDateString('uk-UA', {
                                    day: '2-digit',
                                    month: 'long',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })
                                : 'Дата невідома'}
                        </span>
                    </div>

                    <div className={styles.statusSection}>
                        <OrderStatusBadge status={order.status} scope="root" />

                        {isAdmin && !isTerminalState && !isPendingPayment && onStatusChange && (
                            <select
                                className={styles.statusSelect}
                                value={order.status}
                                onChange={handleStatusSelect}
                                disabled={isProcessing}
                            >
                                <option value={order.status} disabled>
                                    Змінити статус...
                                </option>
                                {getAdminOptions().map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                {!sellerOrders.length && <div className={styles.itemsList}>
                    {order.items.map((item) => {
                        const price = Number((item as { price?: string | number }).price ?? item.unitPrice ?? 0);
                        const quantity = Number(item.quantity);
                        return (
                            <div key={item.id} className={styles.itemRow}>
                                <span className={styles.itemName}>
                                    {item.productName || 'Товар'}
                                </span>
                                <span className={styles.itemDetails}>
                                    {!isNaN(quantity) ? quantity : 0} шт. × $
                                    {!isNaN(price) ? price.toFixed(2) : '0.00'}
                                </span>
                            </div>
                        );
                    })}
                </div>}

                {sellerOrders.length > 0 && (
                    <div className={styles.sellerOrders}>
                        {sellerOrders.map((sellerOrder) => (
                            <div className={styles.sellerOrder} key={sellerOrder.id}>
                                <div>
                                    <strong>
                                        {sellerOrder.seller?.nickName ??
                                            sellerOrder.seller?.email ??
                                            `Продавець ${sellerOrder.sellerId.slice(0, 8)}`}
                                    </strong>
                                    <OrderStatusBadge status={sellerOrder.status} scope="suborder" />
                                </div>
                                <div className={styles.sellerOrderItems}>
                                    {sellerOrder.items.map((item) => (
                                        <div className={styles.itemRow} key={item.id}>
                                            <span className={styles.itemName}>{item.productName}</span>
                                            <span className={styles.itemDetails}>
                                                {item.quantity} шт. × ${Number(item.unitPrice).toFixed(2)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div className={styles.sellerOrderMeta}>
                                    ${Number(sellerOrder.subtotal).toFixed(2)}
                                </div>
                                {sellerOrder.status === 'COMPLETED' && (
                                    <div className={styles.sellerOrderActions}>
                                        {onReview && sellerOrder.items.filter((item) => !reviewedProductIds?.has(item.productId)).map((item) => (
                                            <Button key={item.id} variant="secondary" size="small" onClick={() => void onReview(item.id)}>
                                                Залишити відгук
                                            </Button>
                                        ))}
                                        {onOpenDispute && (
                                            <Button variant="secondary" size="small" onClick={() => void onOpenDispute(sellerOrder.id)}>
                                                Почати спір
                                            </Button>
                                        )}
                                    </div>
                                )}
                                {onSellerCancel && sellerCanCancel(sellerOrder) && (
                                    <div className={styles.sellerOrderActions}>
                                        <Button
                                            variant="secondary"
                                            size="small"
                                            onClick={() => void onSellerCancel(sellerOrder.id)}
                                            disabled={isProcessing}
                                        >
                                            Скасувати субзамовлення
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className={styles.footer}>
                    <div className={styles.total}>
                        <span>{isAdmin ? 'Загальна сума:' : 'Сума до сплати:'}</span>
                        <strong>
                            {isAdmin
                                ? isValidTotal
                                    ? totalAmount.toFixed(2)
                                    : '0.00'
                                : amountDue.toFixed(2)}
                                $
                        </strong>
                        
                    </div>

                    {!isAdmin && (
                        <div className={styles.actions}>
                            {(order.status === 'NEW' ||
                                order.status === 'PAYMENT_PENDING' ||
                                hasUnpaidSellerOrder) &&
                                onPay && (
                                <Button
                                    variant="primary"
                                    size="small"
                                    onClick={handlePay}
                                    disabled={isProcessing}
                                >
                                    {isProcessing ? 'Обробка...' : 'Оплатити'}
                                </Button>
                            )}

                            {isCancelable && onCancel && (
                                <Button
                                    variant="secondary"
                                    size="small"
                                    onClick={() => setIsConfirmModalOpen(true)}
                                    disabled={isProcessing}
                                >
                                    Скасувати
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {!isAdmin && (
                <Modal
                    isOpen={isConfirmModalOpen}
                    onClose={() => setIsConfirmModalOpen(false)}
                    title="Підтвердження скасування"
                    actions={
                        <>
                            <Button
                                variant="secondary"
                                size="small"
                                onClick={() => setIsConfirmModalOpen(false)}
                                disabled={isProcessing}
                            >
                                Назад
                            </Button>
                            <Button
                                variant="primary"
                                size="small"
                                onClick={handleConfirmCancel}
                                disabled={isProcessing}
                            >
                                Скасувати замовлення
                            </Button>
                        </>
                    }
                >
                    <p>
                        Ви дійсно бажаєте скасувати замовлення{' '}
                        <strong>#{order.id.slice(0, 8)}</strong>?
                    </p>
                </Modal>
            )}
        </>
    );
};