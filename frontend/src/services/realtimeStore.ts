import type { StockUpdate, BidUpdate } from './socketClient';

export interface RealtimeState {
    stock: Record<string, number>;
    bids: Record<string, BidUpdate>;
    orderStatuses: Record<string, string>;
}

let state: RealtimeState = {
    stock: {},
    bids: {},
    orderStatuses: {},
};
const listeners = new Set<() => void>();
const seenEvents = new Set<string>();
const rememberEvent = (eventId: string | undefined): boolean => {
    if (!eventId) return true;
    if (seenEvents.has(eventId)) return false;
    seenEvents.add(eventId);
    if (seenEvents.size > 2000) {
        const oldest = seenEvents.values().next().value;
        if (oldest) seenEvents.delete(oldest);
    }
    return true;
};

export const realtimeStore = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
    applyStock: (update: StockUpdate): boolean => {
        if (!rememberEvent(update.eventId)) return false;
        state = { ...state, stock: { ...state.stock, [update.productId]: update.quantity } };
        listeners.forEach((listener) => listener());
        return true;
    },
    applyBid: (update: BidUpdate): boolean => {
        if (!rememberEvent(update.eventId)) return false;
        state = { ...state, bids: { ...state.bids, [update.auctionId]: update } };
        listeners.forEach((listener) => listener());
        return true;
    },
    applyOrderStatus: (update: { orderId: string; status: string; eventId?: string }): boolean => {
        if (!rememberEvent(update.eventId)) return false;
        state = {
            ...state,
            orderStatuses: { ...state.orderStatuses, [update.orderId]: update.status },
        };
        listeners.forEach((listener) => listener());
        return true;
    },
    reset: () => {
        state = { stock: {}, bids: {}, orderStatuses: {} };
        seenEvents.clear();
        listeners.forEach((listener) => listener());
    },
};
