import React from 'react';
import styles from '../../ProfilePage.module.css';
import { AuctionCard } from '../../../../components/AuctionCard/AuctionCard';
import type { Auction } from '../../../../types';
import type { Product } from '../../../../types/product.type';

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
                    <AuctionCard
                        key={auction.id}
                        product={toAuctionProduct(auction)}
                    />
                ))}
            </div>
        )}
    </div>
);

const toAuctionProduct = (auction: Auction): Product => ({
    ...(auction.product ?? {
        id: auction.productId,
        name: 'Аукціон',
        description: '',
        sellerId: '',
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
});
