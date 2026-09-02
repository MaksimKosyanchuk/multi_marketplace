import { ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsOptional,
    IsString,
    IsUUID,
    IsNumber,
    Min,
    IsIn,
    IsInt,
    Max,
    IsBoolean,
    IsEnum,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ProductType } from '@prisma/client';

export enum ProductSort {
    PRICE_ASC = 'price_asc',
    PRICE_DESC = 'price_desc',
    NEWEST = 'newest',
}

export class QueryProductDto {
    @ApiPropertyOptional({
        description: 'Поисковая строка по названию или описанию',
        example: 'Sony',
    })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({
        description: 'Фильтр по UUID категории',
        example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    })
    @IsOptional()
    @IsUUID()
    categoryId?: string;

    @ApiPropertyOptional({
        description: 'Минимальная цена',
        example: 100,
        minimum: 0,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    minPrice?: number;

    @ApiPropertyOptional({
        description: 'Максимальная цена',
        example: 500,
        minimum: 0,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    maxPrice?: number;

    @ApiPropertyOptional({
        enum: ProductSort,
        description: 'Сортировка списка товаров',
        example: ProductSort.NEWEST,
    })
    @IsOptional()
    @IsIn(Object.values(ProductSort))
    sort?: ProductSort;

    @ApiPropertyOptional({
        description: 'Номер страницы',
        default: 1,
        minimum: 1,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page: number = 1;

    @ApiPropertyOptional({
        description: 'Количество товаров на странице',
        default: 10,
        minimum: 1,
        maximum: 100,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit: number = 10;

    @ApiPropertyOptional({
        description: 'Включить ли архивные (мягко удаленные) товары в выдачу',
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    includeArchived?: boolean;

    @ApiPropertyOptional({ description: 'Фильтр по seller UUID' })
    @IsOptional()
    @IsUUID()
    sellerId?: string;

    @ApiPropertyOptional({
        description: 'Минимальный рейтинг товара',
        minimum: 0,
        maximum: 5,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @Max(5)
    minRating?: number;

    @ApiPropertyOptional({ description: 'Только товары в наличии' })
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    inStock?: boolean;

    @ApiPropertyOptional({ enum: ProductType, description: 'Тип товара' })
    @IsOptional()
    @IsEnum(ProductType)
    type?: ProductType;
}
