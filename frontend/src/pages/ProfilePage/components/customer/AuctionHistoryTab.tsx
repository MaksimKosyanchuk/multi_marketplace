import React from 'react';
import { Link } from 'react-router-dom';
import styles from '../../ProfilePage.module.css';
import type { Auction } from '../../../../types';

interface AuctionHistoryTabProps {
    auctionHistory: Auction[];
}

export const AuctionHistoryTab: React.FC<AuctionHistoryTabProps> = ({
    auctionHistory,
}) => (
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
