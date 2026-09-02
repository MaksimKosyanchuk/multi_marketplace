import React, { useState } from 'react';
import type { Order, OrderStatus } from '../../services/orderService';
import { Button } from '../Ui/Button/Button';
import { Modal } from '../Modal/Modal';
import styles from './OrderItem.module.css';

interface OrderItemProps {
    order: Order;
    onPay?: (orderId: string) => Promise<void>;
    onCancel?: (orderId: string) => Promise<void>;
    onStatusChange?: (orderId: string, status: OrderStatus) => Promise<void>;
    isAdmin?: boolean;
}

const VALID_STATUSES: OrderStatus[] = [
    'NEW',
    'PAYMENT_PENDING',
    'PROCESSING',
    'SHIPPED',
    'COMPLETED',
    'CANCELLED',
];

const statusLabels: Record<OrderStatus, { text: string; className: string }> = {
    NEW: { text: 'Очікує оплати', className: styles.statusNew },
    PAYMENT_PENDING: { text: 'Оплата обробляється', className: styles.statusPending },
    PROCESSING: { text: 'Обробляється', className: styles.statusProcessing },
    SHIPPED: { text: 'Відправлено', className: styles.statusShipped },
    COMPLETED: { text: 'Завершено', className: styles.statusCompleted },
    CANCELLED: { text: 'Скасовано', className: styles.statusCancelled },
};

export const OrderItemCard: React.FC<OrderItemProps> = ({
    order,
    onPay,
    onCancel,
    onStatusChange,
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

    const statusInfo = statusLabels[order.status] || {
        text: order.status ?? 'Невідомий',
        className: '',
    };

    const isCancelable =
        order.status === 'NEW' ||
        order.status === 'PROCESSING' ||
        order.status === 'SHIPPED';

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
                        <span className={`${styles.statusBadge} ${statusInfo.className}`}>
                            {statusInfo.text}
                        </span>

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

                <div className={styles.itemsList}>
                    {order.items.map((item) => {
                        const price = Number(item.price);
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
                </div>

                <div className={styles.footer}>
                    <div className={styles.total}>
                        <span>{isAdmin ? 'Загальна сума:' : 'Сума до сплати:'}</span>
                        <strong>${isValidTotal ? totalAmount.toFixed(2) : '0.00'}</strong>
                    </div>

                    {!isAdmin && (
                        <div className={styles.actions}>
                            {order.status === 'NEW' && onPay && (
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