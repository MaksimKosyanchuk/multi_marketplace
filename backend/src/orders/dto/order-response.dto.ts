import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';

export class OrderItemResponseDto {
    @ApiProperty({ example: 'item_123abc', description: 'Order item ID' })
    id: string;

    @ApiProperty({ example: 'prod_456def', description: 'Product ID' })
    productId: string;

    @ApiProperty({
        example: 'Беспроводная мышь',
        description: 'Product name at the time of ordering',
    })
    productName: string;

    @ApiProperty({ example: 49.99, description: 'Price per product unit' })
    price: number;

    @ApiProperty({ example: 2, description: 'Quantity' })
    quantity: number;
}

export class OrderResponseDto {
    @ApiProperty({ example: 'ord_789ghi', description: 'Order ID' })
    id: string;

    @ApiProperty({ example: 'user_123abc', description: 'Customer ID' })
    userId: string;

    @ApiProperty({
        enum: OrderStatus,
        example: OrderStatus.NEW,
        description: 'Current order status',
    })
    status: OrderStatus;

    @ApiProperty({ example: 99.98, description: 'Total order amount' })
    totalAmount: number;

    @ApiProperty({
        type: [OrderItemResponseDto],
        description: 'Order contents',
    })
    items: OrderItemResponseDto[];

    @ApiProperty({
        example: '2026-08-01T12:00:00.000Z',
        description: 'Creation date',
    })
    createdAt: Date;

    @ApiProperty({
        example: '2026-08-01T12:00:00.000Z',
        description: 'Last update date',
    })
    updatedAt: Date;
}

export class PaginatedOrdersResponseDto {
    @ApiProperty({ type: [OrderResponseDto] })
    data: OrderResponseDto[];

    @ApiProperty({ example: 100, description: 'Total items' })
    total: number;

    @ApiProperty({ example: 1, description: 'Current page' })
    page: number;

    @ApiProperty({ example: 20, description: 'Page size' })
    limit: number;

    @ApiProperty({ example: 5, description: 'Total pages' })
    totalPages: number;
}
