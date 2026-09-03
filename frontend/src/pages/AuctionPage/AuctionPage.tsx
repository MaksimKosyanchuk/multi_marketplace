import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AxiosError } from 'axios';
import { auctionService } from '../../services/auctionService';
import {
    onBidUpdate,
    subscribeToAuction,
    unsubscribeFromAuction,
} from '../../services/socketClient';
import { useAuth } from '../../context/AuthContext/useAuth';
import type { Auction } from '../../types/marketplace.type';
import { Button } from '../../components/Ui/Button/Button';
import styles from './AuctionPage.module.css';

const formatDate = (value: string) => new Date(value).toLocaleString();

const AuctionPage: React.FC = () => {
    const { auctionId } = useParams<{ auctionId: string }>();
    const navigate = useNavigate();
    const { isAuthenticated, socket, user } = useAuth();
    const [auction, setAuction] = useState<Auction | null>(null);
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(true);
    const [bidding, setBidding] = useState(false);
    const [error, setError] = useState('');

    const loadAuction = useCallback(async () => {
        if (!auctionId) return;
        setLoading(true);
        try {
            setAuction(await auctionService.get(auctionId));
            setError('');
        } catch {
            setError('Не вдалося завантажити аукціон');
        } finally {
            setLoading(false);
        }
    }, [auctionId]);

    useEffect(() => {
        void loadAuction();
    }, [loadAuction]);

    useEffect(() => {
        if (!socket || !auctionId) return;
        void subscribeToAuction(auctionId);
        const unsubscribe = onBidUpdate((update) => {
            if (update.auctionId !== auctionId) return;
            setAuction((current) =>
                current
                    ? { ...current, currentPrice: Number(update.currentPrice) }
                    : current,
            );
        });
        const handleReconnect = () => {
            void loadAuction();
        };
        socket.on('connect', handleReconnect);
        return () => {
            unsubscribe();
            socket.off('connect', handleReconnect);
            unsubscribeFromAuction(auctionId);
        };
    }, [socket, auctionId, loadAuction]);

    const minimumBid = useMemo(
        () =>
            auction
                ? auction.currentPrice + auction.minBidIncrement
                : undefined,
        [auction],
    );

    const placeBid = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!auction || !auctionId || minimumBid === undefined) return;
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        const bidAmount = Number(amount);
        if (!Number.isFinite(bidAmount) || bidAmount < minimumBid) {
            setError(`Мінімальна ставка: ${minimumBid.toFixed(2)}`);
            return;
        }
        const previousPrice = auction.currentPrice;
        setBidding(true);
        setError('');
        setAuction({ ...auction, currentPrice: bidAmount });
        try {
            await auctionService.bid(auctionId, bidAmount);
            setAmount('');
        } catch (err: unknown) {
            setAuction({ ...auction, currentPrice: previousPrice });
            const message =
                err instanceof AxiosError && err.response?.data?.message;
            setError(
                Array.isArray(message)
                    ? message[0]
                    : message || 'Ставку не прийнято',
            );
        } finally {
            setBidding(false);
            void loadAuction();
        }
    };

    if (loading) return <div className={styles.status}>Завантаження...</div>;
    if (!auction) return <div className={styles.statusError}>{error}</div>;

    const closed = auction.status !== 'ACTIVE' || new Date(auction.endsAt) <= new Date();

    return (
        <main className={styles.container}>
            <button className={styles.back} onClick={() => navigate(-1)}>
                ← До каталогу
            </button>
            <h1>{auction.product.name}</h1>
            <p>{auction.product.description}</p>
            <div className={styles.panel}>
                <div>
                    <span>Поточна ставка</span>
                    <strong>${auction.currentPrice.toFixed(2)}</strong>
                </div>
                <div>
                    <span>Мінімальна наступна ставка</span>
                    <strong>${minimumBid?.toFixed(2)}</strong>
                </div>
                <div>
                    <span>Дедлайн</span>
                    <strong>{formatDate(auction.endsAt)}</strong>
                </div>
            </div>
            {closed ? (
                <p className={styles.status}>Аукціон завершено: {auction.status}</p>
            ) : (
                <form onSubmit={placeBid} className={styles.form}>
                    <input
                        type="number"
                        min={minimumBid}
                        step="0.01"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        placeholder={`Не менше ${minimumBid?.toFixed(2)}`}
                    />
                    <Button type="submit" disabled={bidding}>
                        {bidding ? 'Відправлення...' : 'Зробити ставку'}
                    </Button>
                </form>
            )}
            {auction.status === 'SOLD' &&
                auction.winnerId === user?.id &&
                auction.checkoutExpiresAt &&
                new Date(auction.checkoutExpiresAt) > new Date() && (
                    <Button
                        onClick={async () => {
                            try {
                                await auctionService.checkoutWinner(auction.id);
                                await loadAuction();
                            } catch {
                                setError('Не вдалося оформити замовлення');
                            }
                        }}
                    >
                        Оформити замовлення переможця
                    </Button>
                )}
            {error && <p className={styles.error}>{error}</p>}
            <h2>Історія ставок</h2>
            <ul className={styles.bids}>
                {auction.bids.map((bid) => (
                    <li key={bid.id}>
                        <span>${bid.amount.toFixed(2)}</span>
                        <small>{formatDate(bid.createdAt)}</small>
                    </li>
                ))}
            </ul>
        </main>
    );
};

export default AuctionPage;
