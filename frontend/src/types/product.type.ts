export enum ProductSort {
    PRICE_ASC = 'price_asc',
    PRICE_DESC = 'price_desc',
    NEWEST = 'newest',
}

export interface Category {
    id: string;
    name: string;
}

export interface Product {
    id: string;
    sellerId: string;
    name: string;
    description?: string;
    stock: number;
    price: number;
    imageUrl?: string | null;
    categoryId: string;
    category?: Category;
    createdAt: string;
    updatedAt: string;
    isArchived: boolean;
    type?: 'FIXED_PRICE' | 'AUCTION';
    status?:
        | 'DRAFT'
        | 'PENDING_APPROVAL'
        | 'ACTIVE'
        | 'REJECTED'
        | 'ARCHIVED'
        | 'SOLD';
    rating?: number;
}

export interface QueryProductParams {
    search?: string;
    categoryId?: string;
    minPrice?: number;
    maxPrice?: number;
    sort?: ProductSort;
    page?: number;
    limit?: number;
    includeArchived?: boolean;
    sellerId?: string;
    minRating?: number;
    inStock?: boolean;
    type?: 'FIXED_PRICE' | 'AUCTION';
}

export interface ProductsResponse {
    items: Product[];
    meta: {
        total: number;
        page: number;
        limit: number;
        pageCount: number;
    };
    facetDistribution?: Record<string, Record<string, number>>;
}

export interface CreateProductInput {
    name: string;
    price: number;
    categoryId: string;
    description?: string;
    imageUrl?: string | null;
    image?: File | null;
}

export type UpdateProductInput = Partial<CreateProductInput>;
