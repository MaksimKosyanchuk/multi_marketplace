import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext/useAuth';
import { notificationService } from '../../services/notificationService';
import { onNotification } from '../../services/socketClient';
import type { Notification } from '../../types';
import styles from './NotificationBell.module.css';

const TITLES: Record<string, string> = {
    'product.submitted_for_approval': 'Товар надіслано на модерацію',
    'product.approved': 'Товар схвалено',
    'product.rejected': 'Товар відхилено',
    'product.created': 'Товар створено',
    'product.updated': 'Товар оновлено',
    'product.archived': 'Товар переміщено в архів',
    'product.restored': 'Товар відновлено',
    'product.stock-changed': 'Оновлено залишок товару',
    'product.auction-status-changed': 'Змінився статус аукціону товару',
    'order.created': 'Замовлення створено',
    'order.cancelled': 'Замовлення скасовано',
    'order.status-changed': 'Змінився статус замовлення',
    'seller-order.created': 'Нове замовлення продавця',
    'seller-order.cancelled': 'Замовлення продавця скасовано',
    'seller-order.refunded': 'Оформлено повернення',
    'seller-order.status-changed': 'Змінився статус замовлення продавця',
    'payment.paid': 'Оплату підтверджено',
    'payment.cancelled': 'Оплату скасовано',
    'auction.started': 'Аукціон розпочато',
    'auction.ended': 'Аукціон завершено',
    'auction.bid-placed': 'Нова ставка на аукціоні',
    'auction.checkout-expired': 'Час на оформлення виграшу минув',
    'auction.checkout-created': 'Замовлення з аукціону створено',
    'dispute.opened': 'Відкрито спір',
    'dispute.resolved': 'Спір вирішено',
    'review.created': 'Новий відгук про товар',
};

function normalizeType(type: string): string {
    return type.trim().toLowerCase().replace(/_/g, '-');
}

function categoryFor(type: string): string {
    const key = normalizeType(type);
    if (key.startsWith('order.') || key.startsWith('payment.')) {
        return 'Замовлення';
    }
    if (key.startsWith('seller-order.') || key.includes('seller')) {
        return 'Продавець';
    }
    if (key.startsWith('auction.') || key.includes('bid')) {
        return 'Аукціон';
    }
    if (key.startsWith('dispute.')) {
        return 'Спір';
    }
    if (key.startsWith('review.')) {
        return 'Відгук';
    }
    if (key.startsWith('product.')) {
        return 'Товар';
    }
    return 'Сповіщення';
}

function compactType(type: string): string {
    return type.trim().toLowerCase().replace(/[-_.]/g, '');
}

const COMPACT_TITLES = Object.fromEntries(
    Object.entries(TITLES).map(([key, title]) => [
        compactType(key),
        title,
    ]),
);

function titleFor(type: string): string {
    const raw = type.trim().toLowerCase();
    const dashed = normalizeType(raw);
    return (
        TITLES[raw] ??
        TITLES[dashed] ??
        COMPACT_TITLES[compactType(raw)] ??
        categoryFor(type)
    );
}

export function NotificationBell() {
    const { isAuthenticated, socket } = useAuth();
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<Notification[]>([]);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isAuthenticated) return undefined;
        let cancelled = false;
        notificationService
            .list(false)
            .then((list) => {
                if (!cancelled) setItems(list);
            })
            .catch(() => {
                if (!cancelled) setItems([]);
            });
        return () => {
            cancelled = true;
        };
    }, [isAuthenticated]);

    useEffect(() => {
        if (!socket) return undefined;
        const onConnect = () => {
            notificationService
                .list(false)
                .then((list) => setItems(list))
                .catch(() => setItems([]));
        };
        socket.on('connect', onConnect);
        const unsubscribe = onNotification((payload) => {
            const eventId =
                typeof payload.eventId === 'string' ? payload.eventId : '';
            const type =
                typeof payload.type === 'string' ? payload.type : 'event';
            setItems((current) => {
                if (eventId && current.some((item) => item.eventId === eventId)) {
                    return current;
                }
                return [
                    {
                        id: eventId || `live-${Date.now()}`,
                        userId: '',
                        eventId,
                        type,
                        payload: payload as Record<string, unknown>,
                        readAt: null,
                        createdAt: new Date().toISOString(),
                    },
                    ...current,
                ];
            });
        });
        return () => {
            socket.off('connect', onConnect);
            unsubscribe();
        };
    }, [socket]);

    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    if (!isAuthenticated) return null;

    const unread = items.filter((item) => !item.readAt).length;

    const markOne = async (id: string) => {
        await notificationService.markRead(id);
        setItems((current) =>
            current.map((item) =>
                item.id === id
                    ? { ...item, readAt: new Date().toISOString() }
                    : item,
            ),
        );
    };

    return (
        <div className={styles.wrap} ref={rootRef}>
            <button
                type="button"
                className={styles.bell}
                aria-label="Сповіщення"
                onClick={() => setOpen((value) => !value)}
            >
                Сповіщення
                {unread > 0 ? (
                    <span className={styles.badge}>
                        {unread > 9 ? '9+' : unread}
                    </span>
                ) : null}
            </button>
            {open ? (
                <div className={styles.panel} role="dialog" aria-label="Список сповіщень">
                    <div className={styles.panelHead}>Сповіщення</div>
                    {items.length === 0 ? (
                        <p className={styles.empty}>Немає сповіщень</p>
                    ) : (
                        <ul className={styles.list}>
                            {items.slice(0, 20).map((item) => (
                                <li
                                    key={item.id}
                                    className={
                                        item.readAt ? styles.read : styles.unread
                                    }
                                >
                                    <button
                                        type="button"
                                        className={styles.itemBtn}
                                        onClick={() => void markOne(item.id)}
                                    >
                                        <strong>{titleFor(item.type)}</strong>
                                        <span>{categoryFor(item.type)}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <Link
                        to="/profile"
                        className={styles.footer}
                        onClick={() => setOpen(false)}
                    >
                        Профіль
                    </Link>
                </div>
            ) : null}
        </div>
    );
}
