import { io, type Socket } from 'socket.io-client';

export interface StockUpdate {
    productId: string;
    quantity: number;
}

export interface BidUpdate {
    auctionId: string;
    currentPrice: string;
    bidderId: string;
}

export interface AuctionEvent {
    type: string;
    payload: Record<string, unknown>;
}

let socket: Socket | null = null;
let hasConnected = false;
const activeAuctionRooms = new Set<string>();

export function connectMarketplaceSocket(
    token: string,
    onReconnect?: () => void | Promise<void>,
): Socket {
    if (socket) {
        (socket as any).auth = { token };
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
    socket?.on('product_stock_updated', handler);
    return () => socket?.off('product_stock_updated', handler);
}

export function onOrderStatusUpdate(
    handler: (payload: { orderId: string; status: string }) => void,
): () => void {
    socket?.on('order_status_updated', handler);
    return () => socket?.off('order_status_updated', handler);
}

export function onBidUpdate(handler: (payload: BidUpdate) => void): () => void {
    socket?.on('auction_bid_updated', handler);
    return () => socket?.off('auction_bid_updated', handler);
}

export function onAuctionEvent(
    handler: (payload: AuctionEvent) => void,
): () => void {
    socket?.on('auction_event', handler);
    return () => socket?.off('auction_event', handler);
}

export function onNotification(
    handler: (payload: Record<string, unknown>) => void,
): () => void {
    socket?.on('notification_created', handler);
    return () => socket?.off('notification_created', handler);
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
