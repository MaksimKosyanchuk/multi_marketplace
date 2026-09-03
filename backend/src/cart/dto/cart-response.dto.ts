import { ApiProperty } from '@nestjs/swagger';

export class CartItemProductDto {
    @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
    id: string;

    @ApiProperty({ example: 'Wireless headphones' })
    title: string;

    @ApiProperty({ example: 149.99 })
    price: number;

    @ApiProperty({ example: 'https://example.com/image.jpg', nullable: true })
    imageUrl?: string;
}

export class CartItemDto {
    @ApiProperty({
        example: 'b5f928c1-1234-5678-9abc-def123456789',
        description: 'Cart item ID',
    })
    id: string;

    @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
    productId: string;

    @ApiProperty({
        type: CartItemProductDto,
        description: 'Brief product data',
    })
    product: CartItemProductDto;

    @ApiProperty({ example: 2, description: 'Quantity' })
    quantity: number;

    @ApiProperty({
        example: 299.98,
        description: 'Total item cost (price * quantity)',
    })
    totalPrice: number;
}

export class CartResponseDto {
    @ApiProperty({
        example: 'c8d7e6f5-4321-8765-4321-fedcba987654',
        description: 'Cart ID',
    })
    id: string;

    @ApiProperty({
        type: [CartItemDto],
        description: 'Cart item list',
    })
    items: CartItemDto[];

    @ApiProperty({ example: 299.98, description: 'Total cart amount' })
    totalAmount: number;

    @ApiProperty({
        example: 2,
        description: 'Total number of products in the cart',
    })
    totalItems: number;
}
