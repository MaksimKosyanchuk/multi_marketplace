// Re-export all types from marketplace.type.ts
export type {
    ProductType,
    ProductStatus,
    PaymentStatus,
    SellerOrderStatus,
    OrderStatus,
    AuctionStatus,
    BidStatus,
    DisputeStatus,
    SellerSummary,
    Product,
    CartItem,
    Cart,
    OrderItem,
    SellerOrder,
    Payment,
    Order,
    Auction,
    Bid,
    Review,
    ReviewSummary,
    Dispute,
    Notification,
    ProductSearchResponse,
} from './marketplace.type';

// Re-export product types
export type {
    ProductSort,
    CreateProductInput,
    UpdateProductInput,
    QueryProductParams,
    ProductsResponse,
    Category,
} from './product.type';

// Auth & common enums/interfaces
export enum Role {
    CUSTOMER = 'CUSTOMER',
    SELLER = 'SELLER',
    ADMIN = 'ADMIN',
}

export enum SellerStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    SUSPENDED = 'SUSPENDED',
}

export interface User {
    id: string;
    email: string;
    nickName: string;
    role: Role;
    createdAt: string;
    updatedAt: string;
}

export interface AuthResponse {
    accessToken: string;
    user?: User;
}

export interface LoginDto {
    email: string;
    password: string;
}

export interface RegisterDto {
    email: string;
    password: string;
    nickName: string;
}

export interface CreateProductDto {
    name: string;
    description: string;
    price: number;
    stock: number;
    categoryId: string;
    imageUrl?: string;
}

export interface UpdateProductDto extends Partial<CreateProductDto> {
    [key: string]: unknown;
}

export interface AddToCartDto {
    productId: string;
    quantity: number;
}

export interface UpdateCartItemDto {
    quantity: number;
}

export interface CheckoutDto {
    idempotencyKey: string;
}

export interface PaymentDto {
    orderId: string;
    idempotencyKey: string;
}

export interface RefundDto {
    orderItemId: string;
    sellerOrderId: string;
    quantity: number;
    reason: string;
    idempotencyKey: string;
}

export interface CreateBidDto {
    amount: number;
    idempotencyKey: string;
}

export interface CreateReviewDto {
    orderItemId: string;
    rating: number;
    comment?: string;
}

export interface CreateDisputeDto {
    sellerOrderId: string;
    description: string;
}

export interface TopProduct {
    id: string;
    name: string;
    totalSold: number;
    revenue: number;
    rating?: number;
}

export interface TopSeller {
    id: string;
    displayName: string;
    totalOrders: number;
    revenue: number;
    rating?: number;
}

export interface SalesByDay {
    date: string;
    sales: number;
    ordersCount: number;
}
