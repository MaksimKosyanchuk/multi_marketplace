import { api } from './api';
import {
    completeOperationKey,
    createOperationKey,
    withIdempotencyKey,
} from './requestMeta';
import type { Auction, Bid, Order } from '../types/marketplace.type';

export interface CreateAuctionInput {
    productId: string;
    startingPrice: number;
    minBidIncrement: number;
    startsAt: string;
    endsAt: string;
}

const normalizeAuction = (auction: Auction): Auction => ({
    ...auction,
    startingPrice: Number(auction.startingPrice),
    currentPrice: Number(auction.currentPrice),
    minBidIncrement: Number(auction.minBidIncrement),
    bids: (auction.bids ?? []).map((bid) => ({
        ...bid,
        amount: Number(bid.amount),
    })),
});

export const auctionService = {
    async get(auctionId: string): Promise<Auction> {
        const { data } = await api.get<Auction>(`/auctions/${auctionId}`);
        return normalizeAuction(data);
    },
    async getCreated(): Promise<Auction[]> {
        const { data } = await api.get<Auction[]>('/auctions/mine/created');
        return data.map(normalizeAuction);
    },
    async getParticipating(): Promise<Auction[]> {
        const { data } = await api.get<Auction[]>('/auctions/mine/participating');
        return data.map(normalizeAuction);
    },
    async create(input: CreateAuctionInput): Promise<Auction> {
        const { data } = await api.post<Auction>('/auctions', input);
        return normalizeAuction(data);
    },
    async bid(
        auctionId: string,
        amount: number,
        idempotencyKey?: string,
    ): Promise<Bid> {
        const { data } = await api.post<Bid>(
            `/auctions/${auctionId}/bids`,
            { amount },
            {
                headers: withIdempotencyKey(
                    idempotencyKey ??
                        createOperationKey('bid', `${auctionId}:${amount}`),
                ),
            },
        );
        completeOperationKey('bid', `${auctionId}:${amount}`);
        return data;
    },
    async checkoutWinner(
        auctionId: string,
        idempotencyKey?: string,
    ): Promise<Order> {
        const { data } = await api.post<Order>(
            `/auctions/${auctionId}/checkout`,
            undefined,
            {
                headers: withIdempotencyKey(
                    idempotencyKey ??
                        createOperationKey('auction-checkout', auctionId),
                ),
            },
        );
        completeOperationKey('auction-checkout', auctionId);
        return data;
    },
};
