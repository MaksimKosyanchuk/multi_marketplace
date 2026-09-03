import { ApiProperty } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';

export class ProductCategoryResponseDto {
    @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
    id: string;

    @ApiProperty({ example: 'Электроника' })
    name: string;
}

export class ProductResponseDto {
    @ApiProperty({ example: 'prod_999xyz', description: 'ID товара' })
    id: string;

    @ApiProperty({ example: 'Беспроводные наушники Sony WH-1000XM5' })
    name: string;

    @ApiProperty({
        example: 'Флагманские наушники с отличным шумоподавлением.',
        nullable: true,
    })
    description?: string;

    @ApiProperty({ example: 399.99 })
    price: number;

    @ApiProperty({ example: 50 })
    stock: number;

    @ApiProperty({
        example: 4.5,
        description: 'Средний рейтинг по подтверждённым отзывам',
        minimum: 0,
        maximum: 5,
    })
    rating: number;

    @ApiProperty({ example: '/uploads/products/image-123.jpg', nullable: true })
    imageUrl?: string;

    @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
    categoryId: string;

    @ApiProperty({ enum: ProductStatus, example: ProductStatus.PENDING_APPROVAL })
    status: ProductStatus;

    @ApiProperty({ type: ProductCategoryResponseDto, nullable: true })
    category?: ProductCategoryResponseDto;

    @ApiProperty({
        example: false,
        description: 'Флаг мягкого удаления (в архиве)',
    })
    isArchived: boolean;

    @ApiProperty({ example: '2026-08-01T12:00:00.000Z' })
    createdAt: Date;

    @ApiProperty({ example: '2026-08-01T12:00:00.000Z' })
    updatedAt: Date;
}

export class PaginatedProductsResponseDto {
    @ApiProperty({ type: [ProductResponseDto] })
    data: ProductResponseDto[];

    @ApiProperty({
        example: 150,
        description: 'Общее количество найденных товаров',
    })
    total: number;

    @ApiProperty({ example: 1, description: 'Текущая страница' })
    page: number;

    @ApiProperty({ example: 10, description: 'Размер страницы' })
    limit: number;

    @ApiProperty({ example: 15, description: 'Всего страниц' })
    totalPages: number;
}
