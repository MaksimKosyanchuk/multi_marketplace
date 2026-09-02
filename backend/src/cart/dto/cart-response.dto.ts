import { ApiProperty } from '@nestjs/swagger';

export class CartItemProductDto {
    @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
    id: string;

    @ApiProperty({ example: 'Беспроводные наушники' })
    title: string;

    @ApiProperty({ example: 149.99 })
    price: number;

    @ApiProperty({ example: 'https://example.com/image.jpg', nullable: true })
    imageUrl?: string;
}

export class CartItemDto {
    @ApiProperty({
        example: 'b5f928c1-1234-5678-9abc-def123456789',
        description: 'ID позиции в корзине',
    })
    id: string;

    @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
    productId: string;

    @ApiProperty({
        type: CartItemProductDto,
        description: 'Краткие данные товара',
    })
    product: CartItemProductDto;

    @ApiProperty({ example: 2, description: 'Количество' })
    quantity: number;

    @ApiProperty({
        example: 299.98,
        description: 'Итоговая стоимость позиций (price * quantity)',
    })
    totalPrice: number;
}

export class CartResponseDto {
    @ApiProperty({
        example: 'c8d7e6f5-4321-8765-4321-fedcba987654',
        description: 'ID корзины',
    })
    id: string;

    @ApiProperty({
        type: [CartItemDto],
        description: 'Список элементов корзины',
    })
    items: CartItemDto[];

    @ApiProperty({ example: 299.98, description: 'Общая сумма всей корзины' })
    totalAmount: number;

    @ApiProperty({
        example: 2,
        description: 'Общее количество товаров в корзине',
    })
    totalItems: number;
}
