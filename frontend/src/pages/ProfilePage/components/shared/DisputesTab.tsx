import React from 'react';
import styles from '../../ProfilePage.module.css';
import type { Dispute } from '../../../../types/marketplace.type';

interface DisputesTabProps {
    disputes: Dispute[];
}

const DISPUTE_STATUS_LABELS: Record<string, string> = {
    OPEN: 'Відкритий',
    UNDER_REVIEW: 'На розгляді',
    RESOLVED_FOR_CUSTOMER: 'Вирішено на користь покупця',
    RESOLVED_FOR_SELLER: 'Вирішено на користь продавця',
    CLOSED: 'Закритий',
};

export const DisputesTab: React.FC<DisputesTabProps> = ({ disputes }) => (
    <div className={styles.section}>
        <h2>Мої спори</h2>
        <div className={styles.salesList}>
            {disputes.length === 0 ? (
                <p>Спорів немає.</p>
            ) : (
                disputes.map((dispute) => (
                    <article className={styles.saleCard} key={dispute.id}>
                        <div className={styles.saleHeader}>
                            <strong>{dispute.subject}</strong>
                            <span
                                className={`${styles.disputeBadge} ${
                                    styles[`dispute${dispute.status}`] ?? ''
                                }`}
                            >
                                {DISPUTE_STATUS_LABELS[dispute.status] ?? dispute.status}
                            </span>
                        </div>
                        <div className={styles.disputeContext}>
                            <span>
                                <strong>Замовлення:</strong> #
                                {dispute.sellerOrder?.orderId ?? dispute.sellerOrderId}
                            </span>
                            <span>
                                <strong>Продавець:</strong>{' '}
                                {dispute.sellerOrder?.seller?.nickName ?? 'Невідомий'}
                            </span>
                            <span>
                                <strong>Покупець:</strong>{' '}
                                {dispute.sellerOrder?.order?.user?.nickName ??
                                    dispute.openedBy?.nickName ??
                                    'Невідомий'}
                            </span>
                            {dispute.sellerOrder?.items?.length ? (
                                <span>
                                    <strong>Товари:</strong>{' '}
                                    {dispute.sellerOrder.items
                                        .map((item) => `${item.productName} × ${item.quantity}`)
                                        .join(', ')}
                                </span>
                            ) : null}
                        </div>
                        <p>{dispute.description}</p>
                        {dispute.resolution && (
                            <p>
                                <strong>Рішення:</strong> {dispute.resolution}
                            </p>
                        )}
                    </article>
                ))
            )}
        </div>
    </div>
);
