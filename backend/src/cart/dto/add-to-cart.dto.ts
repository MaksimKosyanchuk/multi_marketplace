import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsInt, Min } from 'class-validator';

export class AddToCartDto {
    @ApiProperty({
        example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        description: 'UUID of the product to add to the cart',
    })
    @IsUUID()
    productId: string;

    @ApiProperty({
        example: 2,
        description: 'Product quantity (minimum 1)',
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    quantity: number;
}
