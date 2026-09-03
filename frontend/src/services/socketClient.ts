import { io, type Socket } from 'socket.io-client';
import { realtimeStore } from './realtimeStore';

export interface StockUpdate {
    productId: string;
    quantity: number;
    eventId?: string;
}

export interface BidUpdate {
    auctionId: string;
    currentPrice: string;
    bidderId: string;
    eventId?: string;
}

export interface AuctionEvent {
    type: string;
    payload: Record<string, unknown>;
    eventId?: string;
}

let socket: Socket | null = null;
let hasConnected = false;
const activeAuctionRooms = new Set<string>();

export function connectMarketplaceSocket(
    token: string,
    onReconnect?: () => void | Promise<void>,
): Socket {
    if (socket) {
        socket.auth = { token };
        if (!socket.connected) socket.connect();
        return socket;
    }

    socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3001', {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
    });

    socket.on('connect', () => {
        if (hasConnected) {
            void Promise.all([
                onReconnect?.(),
                ...[...activeAuctionRooms].map((auctionId) =>
                    subscribeToAuction(auctionId),
                ),
            ]);
        }
        hasConnected = true;
    });

    return socket;
}

export function subscribeToAuction(
    auctionId: string,
): Promise<{ subscribed: boolean }> {
    return new Promise((resolve) => {
        if (!socket) {
            resolve({ subscribed: false });
            return;
        }
        socket.emit('auction_subscribe', { auctionId }, (response: unknown) => {
            const res = response as { subscribed?: boolean } | undefined;
            if (res?.subscribed) activeAuctionRooms.add(auctionId);
            resolve({ subscribed: res?.subscribed === true });
        });
    });
}

export function unsubscribeFromAuction(auctionId: string): void {
    socket?.emit('auction_unsubscribe', { auctionId });
    activeAuctionRooms.delete(auctionId);
}

export function onStockUpdate(
    handler: (payload: StockUpdate) => void,
): () => void {
    const wrapped = (payload: StockUpdate) => {
        if (realtimeStore.applyStock(payload)) handler(payload);
    };
    socket?.on('product_stock_updated', wrapped);
    return () => socket?.off('product_stock_updated', wrapped);
}

export function onOrderStatusUpdate(
    handler: (payload: { orderId: string; status: string; eventId?: string }) => void,
): () => void {
    const wrapped = (payload: { orderId: string; status: string; eventId?: string }) => {
        if (realtimeStore.applyOrderStatus(payload)) handler(payload);
    };
    socket?.on('order_status_updated', wrapped);
    return () => socket?.off('order_status_updated', wrapped);
}

export function onBidUpdate(handler: (payload: BidUpdate) => void): () => void {
    const wrapped = (payload: BidUpdate) => {
        if (realtimeStore.applyBid(payload)) handler(payload);
    };
    socket?.on('auction_bid_updated', wrapped);
    return () => socket?.off('auction_bid_updated', wrapped);
}

export function onAuctionEvent(
    handler: (payload: AuctionEvent) => void,
): () => void {
    const wrapped = (payload: AuctionEvent) => {
        if (realtimeStore.applyAuctionEvent(payload)) handler(payload);
    };
    socket?.on('auction_event', wrapped);
    return () => socket?.off('auction_event', wrapped);
}

export function onNotification(
    handler: (payload: Record<string, unknown> & { eventId?: string }) => void,
): () => void {
    const wrapped = (
        payload: Record<string, unknown> & { eventId?: string },
    ) => {
        if (realtimeStore.applyNotification(payload.eventId)) handler(payload);
    };
    socket?.on('notification_created', wrapped);
    return () => socket?.off('notification_created', wrapped);
}

export function getActiveAuctionRooms(): string[] {
    return [...activeAuctionRooms];
}

export function getMarketplaceSocket(): Socket | null {
    return socket;
}

export function disconnectMarketplaceSocket(): void {
    socket?.disconnect();
    socket = null;
    hasConnected = false;
    activeAuctionRooms.clear();
}
