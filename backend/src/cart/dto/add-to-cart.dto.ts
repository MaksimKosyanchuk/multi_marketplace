import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsInt, Min } from 'class-validator';

export class AddToCartDto {
    @ApiProperty({
        example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        description: 'UUID товара для добавления в корзину',
    })
    @IsUUID()
    productId: string;

    @ApiProperty({
        example: 2,
        description: 'Количество товара (минимум 1)',
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    quantity: number;
}
