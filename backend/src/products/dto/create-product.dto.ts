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
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
    @ApiProperty({
        example: 'Беспроводные наушники Sony WH-1000XM5',
        description: 'Название товара (макс. 150 символов)',
        maxLength: 150,
    })
    @IsString()
    @MaxLength(150)
    name: string;

    @ApiPropertyOptional({
        example: 'Флагманские наушники с отличным шумоподавлением.',
        description: 'Описание товара',
    })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({
        example: 399.99,
        description: 'Цена товара (до 2 знаков после запятой)',
        minimum: 0.01,
    })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    price: number;

    @ApiProperty({
        example: 50,
        description: 'Количество на складе',
        minimum: 0,
    })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    stock: number;

    @ApiProperty({
        example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        description: 'UUID категории товара',
    })
    @IsUUID()
    categoryId: string;

    @ApiPropertyOptional({
        example: 'https://example.com/images/headphones.jpg',
        description: 'Внешний URL изображения товара',
        nullable: true,
    })
    @IsOptional()
    @IsUrl({}, { message: 'imageUrl must be a valid URL' })
    imageUrl?: string | null;

    @ApiPropertyOptional({
        type: 'string',
        format: 'binary',
        description: 'Файл изображения для загрузки (multipart/form-data)',
    })
    @IsOptional()
    image?: any;
}
