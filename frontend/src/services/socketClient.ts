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

export interface MarketplaceSocketEvents {
    order_status_updated: (payload: {
        orderId: string;
        status: string;
    }) => void;
    product_stock_updated: (payload: StockUpdate) => void;
    auction_bid_updated: (payload: BidUpdate) => void;
    auction_event: (payload: AuctionEvent) => void;
    notification_created: (payload: {
        eventId: string;
        type: string;
        payload: Record<string, unknown>;
    }) => void;
}

interface MarketplaceSocketCommands {
    auction_subscribe: (
        payload: { auctionId: string },
        callback: (response: { subscribed: boolean }) => void,
    ) => void;
    auction_unsubscribe: (payload: { auctionId: string }) => void;
}

let socket: Socket<MarketplaceSocketCommands, MarketplaceSocketEvents> | null =
    null;
let hasConnected = false;
const activeAuctionRooms = new Set<string>();

export function connectMarketplaceSocket(
    token: string,
    onReconnect?: () => void | Promise<void>,
): Socket<MarketplaceSocketCommands, MarketplaceSocketEvents> {
    if (socket) {
        socket.auth = { token };
        if (!socket.connected) socket.connect();
        return socket;
    }

    socket = io<MarketplaceSocketCommands, MarketplaceSocketEvents>(
        import.meta.env.VITE_API_URL || 'http://localhost:3001',
        {
            auth: { token },
            transports: ['websocket'],
            reconnection: true,
        },
    );
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
        socket.emit('auction_subscribe', { auctionId }, (response) => {
            if (response?.subscribed) activeAuctionRooms.add(auctionId);
            resolve(response ?? { subscribed: false });
        });
    });
}

export function unsubscribeFromAuction(auctionId: string): void {
    socket?.emit('auction_unsubscribe', { auctionId });
    activeAuctionRooms.delete(auctionId);
}

export function onStockUpdate(
    handler: MarketplaceSocketEvents['product_stock_updated'],
): () => void {
    socket?.on('product_stock_updated', handler);
    return () => socket?.off('product_stock_updated', handler);
}

export function onOrderStatusUpdate(
    handler: MarketplaceSocketEvents['order_status_updated'],
): () => void {
    socket?.on('order_status_updated', handler);
    return () => socket?.off('order_status_updated', handler);
}

export function onBidUpdate(
    handler: MarketplaceSocketEvents['auction_bid_updated'],
): () => void {
    socket?.on('auction_bid_updated', handler);
    return () => socket?.off('auction_bid_updated', handler);
}

export function onNotification(
    handler: MarketplaceSocketEvents['notification_created'],
): () => void {
    socket?.on('notification_created', handler);
    return () => socket?.off('notification_created', handler);
}

export function getActiveAuctionRooms(): string[] {
    return [...activeAuctionRooms];
}

export function getMarketplaceSocket(): Socket<
    MarketplaceSocketCommands,
    MarketplaceSocketEvents
> | null {
    return socket;
}
export function disconnectMarketplaceSocket(): void {
    socket?.disconnect();
    socket = null;
    hasConnected = false;
    activeAuctionRooms.clear();
}
