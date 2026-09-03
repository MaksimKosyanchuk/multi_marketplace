export type ActiveTab =
    | 'info'
    | 'orders'
    | 'sales'
    | 'disputes'
    | 'products'
    | 'auctions'
    | 'auctionHistory';

export interface ProfileTab {
    key: ActiveTab;
    label: string;
}

export interface AuctionFormState {
    name: string;
    description: string;
    categoryId: string;
    startingPrice: string;
    minBidIncrement: string;
    endsAt: string;
}
