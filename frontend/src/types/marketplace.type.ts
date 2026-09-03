export type ProductType = 'FIXED_PRICE' | 'AUCTION';
export type ProductStatus =
    | 'DRAFT'
    | 'PENDING_APPROVAL'
    | 'ACTIVE'
    | 'REJECTED'
    | 'ARCHIVED'
    | 'SOLD';
export type PaymentStatus =
    | 'PENDING'
    | 'AUTHORIZED'
    | 'PAID'
    | 'PARTIALLY_REFUNDED'
    | 'REFUNDED'
    | 'FAILED'
    | 'CANCELLED';
export type SellerOrderStatus =
    | 'NEW'
    | 'PAYMENT_PENDING'
    | 'PROCESSING'
    | 'SHIPPED'
    | 'COMPLETED'
    | 'CANCELLED';
export type OrderStatus =
    | 'NEW'
    | 'PAYMENT_PENDING'
    | 'PROCESSING'
    | 'PARTIALLY_SHIPPED'
    | 'SHIPPED'
    | 'PARTIALLY_COMPLETED'
    | 'COMPLETED'
    | 'PARTIALLY_CANCELLED'
    | 'CANCELLED';
export type AuctionStatus =
    | 'DRAFT'
    | 'ACTIVE'
    | 'ENDED'
    | 'SOLD'
    | 'EXPIRED'
    | 'CANCELLED';
export type BidStatus = 'ACTIVE' | 'OUTBID' | 'WON' | 'CANCELLED';
export type DisputeStatus =
    | 'OPEN'
    | 'UNDER_REVIEW'
    | 'RESOLVED_FOR_CUSTOMER'
    | 'RESOLVED_FOR_SELLER'
    | 'CLOSED';

export interface SellerSummary {
    id: string;
    email: string;
    nickName: string;
}
export interface Product {
    id: string;
    sellerId: string;
    categoryId: string;
    name: string;
    title?: string;
    description: string;
    type: ProductType;
    status: ProductStatus;
    price: number;
    stock: number;
    imageUrl?: string | null;
    isArchived: boolean;
    rating?: number;
    category?: { id: string; name: string };
    createdAt: string;
    updatedAt: string;
}
export interface CartItem {
    id: string;
    cartId: string;
    productId: string;
    quantity: number;
    totalPrice?: number | string;
    product?: Product;
    createdAt: string;
    updatedAt: string;
}
export interface Cart {
    cartId?: string;
    id?: string;
    userId?: string;
    items: CartItem[];
    total?: number;
    totalAmount?: number | string;
    totalItems?: number;
}
export interface OrderItem {
    id: string;
    sellerOrderId: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number | string;
    totalAmount: number | string;
    product?: Product;
    createdAt: string;
}
export interface SellerOrder {
    id: string;
    orderId: string;
    sellerId: string;
    seller?: SellerSummary;
    status: SellerOrderStatus;
    subtotal: number | string;
    commissionAmount: number | string;
    sellerEarnings: number | string;
    refundedAmount: number | string;
    trackingNumber?: string | null;
    items: OrderItem[];
    createdAt: string;
    updatedAt: string;
}
export interface Payment {
    id: string;
    orderId: string;
    provider: string;
    providerRef?: string | null;
    status: PaymentStatus;
    amount: number;
    currency: string;
    createdAt: string;
    updatedAt: string;
}
export interface Order {
    id: string;
    userId: string;
    status: OrderStatus;
    subtotal?: number | string;
    totalAmount: number | string;
    currency: string;
    sellerOrders: SellerOrder[];
    payments?: Payment[];
    createdAt: string;
    updatedAt: string;
}
export interface Auction {
    id: string;
    productId: string;
    product: Product;
    startingPrice: number;
    currentPrice: number;
    minBidIncrement: number;
    startsAt: string;
    endsAt: string;
    status: AuctionStatus;
    version: number;
    winnerId?: string | null;
    checkoutExpiresAt?: string | null;
    checkoutOrderId?: string | null;
    bids: Bid[];
}
export interface Bid {
    id: string;
    auctionId: string;
    bidderId: string;
    amount: number;
    status: BidStatus;
    createdAt: string;
}
export interface Review {
    id: string;
    productId: string;
    authorId: string;
    orderItemId: string;
    rating: number;
    comment?: string | null;
    createdAt: string;
    author?: { id: string; nickName: string };
}
export interface ReviewSummary {
    productId: string;
    averageRating: number;
    reviewCount: number;
    reviews: Review[];
}
export interface Dispute {
    id: string;
    sellerOrderId: string;
    openedById: string;
    resolvedById?: string | null;
    status: DisputeStatus;
    subject: string;
    description: string;
    resolution?: string | null;
    createdAt: string;
    updatedAt: string;
    sellerOrder?: {
        id: string;
        orderId: string;
        subtotal: number | string;
        currency: string;
        seller?: { id: string; nickName?: string | null };
        items?: Array<{ productName: string; quantity: number }>;
        order?: {
            id: string;
            user?: { id: string; nickName?: string | null };
        };
    };
    openedBy?: { id: string; nickName?: string | null };
}
export interface Notification {
    id: string;
    userId: string;
    eventId: string;
    type: string;
    payload: Record<string, unknown>;
    readAt?: string | null;
    createdAt: string;
}
export interface ProductSearchResponse {
    hits: Product[];
    estimatedTotalHits: number;
    page?: number;
    limit?: number;
    facetDistribution?: Record<string, Record<string, number>>;
}
export interface SellerAnalytics {
    sellerId: string;
    revenue: number;
    commission: number;
    refunded: number;
    orders: number;
    completedOrders: number;
    conversion: number;
    topProducts: Array<{
        productId: string;
        productName: string;
        quantity: number;
        revenue: number;
    }>;
}
