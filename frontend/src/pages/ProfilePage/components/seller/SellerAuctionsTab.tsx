import React from 'react';
import styles from '../../ProfilePage.module.css';
import { Button } from '../../../../components/Ui/Button/Button';
import { AuctionCard } from '../../../../components/AuctionCard/AuctionCard';
import type { Auction } from '../../../../types';

interface SellerAuctionsTabProps {
    auctionHistory: Auction[];
    sellerId: string;
    onCreateClick: () => void;
    onDelete: (product: { id: string }) => Promise<void>;
    onPublish: (product: { id: string }) => Promise<void>;
}

export const SellerAuctionsTab: React.FC<SellerAuctionsTabProps> = ({
    auctionHistory,
    sellerId,
    onCreateClick,
    onDelete,
    onPublish,
}) => (
    <div className={styles.section}>
        <div className={styles.sectionHeader}>
            <h2>Мої аукціони</h2>
            <Button type="button" onClick={onCreateClick}>
                Створити аукціон
            </Button>
        </div>
        {auctionHistory.length === 0 ? (
            <p>Аукціонів немає.</p>
        ) : (
            <div className={styles.salesList}>
                {auctionHistory.map((auction) => (
                    <AuctionCard
                        key={auction.id}
                        product={{
                            ...(auction.product ?? {
                                id: auction.productId,
                                name: 'Аукціон',
                                description: '',
                                sellerId,
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
                        }}
                        onDelete={onDelete}
                        onPublish={onPublish}
                    />
                ))}
            </div>
        )}
    </div>
);
