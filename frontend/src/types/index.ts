export enum Role {
    CUSTOMER = 'CUSTOMER',
    SELLER = 'SELLER',
    ADMIN = 'ADMIN',
}

export enum OrderStatus {
    NEW = 'NEW',
    PROCESSING = 'PROCESSING',
    SHIPPED = 'SHIPPED',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED',
}

export interface User {
    id: string;
    email: string;
    nickName: string;
    role: Role;
    createdAt: string;
    updatedAt: string;
}

export interface Category {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
}

export interface Product {
    id: string;
    name: string;
    description: string;
    price: number;
    stock: number;
    imageUrl?: string | null;
    categoryId: string;
    category?: Category;
    createdAt: string;
    updatedAt: string;
}

export interface CartItem {
    id: string;
    cartId: string;
    productId: string;
    quantity: number;
    product: Product;
    createdAt: string;
    updatedAt: string;
}

export interface Cart {
    id: string;
    userId: string;
    items: CartItem[];
    createdAt: string;
    updatedAt: string;
}

export interface OrderItem {
    id: string;
    orderId: string;
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    product?: Product;
    createdAt: string;
}

export interface Order {
    id: string;
    userId: string;
    status: OrderStatus;
    totalAmount: number;
    items: OrderItem[];
    user?: User;
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

export interface ProductQueryParams {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    minPrice?: number;
    maxPrice?: number;
    sortBy?: 'price' | 'createdAt';
    sortOrder?: 'asc' | 'desc';
}

export interface PaginatedProductsResponse {
    data: Product[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface CreateCategoryDto {
    name: string;
}

export interface UpdateCategoryDto {
    name: string;
}

export interface AddToCartDto {
    productId: string;
    quantity: number;
}

export interface UpdateCartItemDto {
    quantity: number;
}

export interface UpdateOrderStatusDto {
    status: OrderStatus;
}

export interface CheckoutDto {
    paymentMethod?: string;
}

export interface TopProduct {
    id: string;
    name: string;
    totalSold: number;
    revenue: number;
}

export interface SalesByDay {
    date: string;
    sales: number;
    ordersCount: number;
}

export interface AnalyticsSummary {
    totalRevenue: number;
    totalOrders: number;
    topProducts: TopProduct[];
    salesChart: SalesByDay[];
}
