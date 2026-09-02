import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';

export class OrderItemResponseDto {
    @ApiProperty({ example: 'item_123abc', description: 'ID позиции заказа' })
    id: string;

    @ApiProperty({ example: 'prod_456def', description: 'ID товара' })
    productId: string;

    @ApiProperty({
        example: 'Беспроводная мышь',
        description: 'Название товара на момент заказа',
    })
    productName: string;

    @ApiProperty({ example: 49.99, description: 'Цена за единицу товара' })
    price: number;

    @ApiProperty({ example: 2, description: 'Количество' })
    quantity: number;
}

export class OrderResponseDto {
    @ApiProperty({ example: 'ord_789ghi', description: 'ID заказа' })
    id: string;

    @ApiProperty({ example: 'user_123abc', description: 'ID покупателя' })
    userId: string;

    @ApiProperty({
        enum: OrderStatus,
        example: OrderStatus.NEW,
        description: 'Текущий статус заказа',
    })
    status: OrderStatus;

    @ApiProperty({ example: 99.98, description: 'Общая сумма заказа' })
    totalAmount: number;

    @ApiProperty({
        type: [OrderItemResponseDto],
        description: 'Содержимое заказа',
    })
    items: OrderItemResponseDto[];

    @ApiProperty({
        example: '2026-08-01T12:00:00.000Z',
        description: 'Дата создания',
    })
    createdAt: Date;

    @ApiProperty({
        example: '2026-08-01T12:00:00.000Z',
        description: 'Дата обновления',
    })
    updatedAt: Date;
}

export class PaginatedOrdersResponseDto {
    @ApiProperty({ type: [OrderResponseDto] })
    data: OrderResponseDto[];

    @ApiProperty({ example: 100, description: 'Всего элементов' })
    total: number;

    @ApiProperty({ example: 1, description: 'Текущая страница' })
    page: number;

    @ApiProperty({ example: 20, description: 'Размер страницы' })
    limit: number;

    @ApiProperty({ example: 5, description: 'Всего страниц' })
    totalPages: number;
}
