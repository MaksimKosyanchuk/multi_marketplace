import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsNumber,
    IsPositive,
    IsInt,
    Min,
    MaxLength,
    IsUUID,
    IsOptional,
    IsUrl,
    IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductType } from '@prisma/client';

export class CreateProductDto {
    @ApiPropertyOptional({
        enum: ProductType,
        default: ProductType.FIXED_PRICE,
    })
    @IsOptional()
    @IsEnum(ProductType)
    type?: ProductType;
    @ApiProperty({
        example: 'Sony WH-1000XM5 wireless headphones',
        description: 'Product name (maximum 150 characters)',
        maxLength: 150,
    })
    @IsString()
    @MaxLength(150)
    name: string;

    @ApiPropertyOptional({
        example: 'Flagship headphones with excellent noise cancellation.',
        description: 'Product description',
    })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({
        example: 399.99,
        description: 'Product price (up to 2 decimal places)',
        minimum: 0.01,
    })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    price: number;

    @ApiProperty({
        example: 50,
        description: 'Stock quantity',
        minimum: 0,
    })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    stock: number;

    @ApiProperty({
        example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        description: 'Product category UUID',
    })
    @IsUUID()
    categoryId: string;

    @ApiPropertyOptional({
        example: 'https://example.com/images/headphones.jpg',
        description: 'External product image URL',
        nullable: true,
    })
    @IsOptional()
    @IsUrl({}, { message: 'imageUrl must be a valid URL' })
    imageUrl?: string | null;

    @ApiPropertyOptional({
        type: 'string',
        format: 'binary',
        description: 'Image file to upload (multipart/form-data)',
    })
    @IsOptional()
    image?: any;
}
