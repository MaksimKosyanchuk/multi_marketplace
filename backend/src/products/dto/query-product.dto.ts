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
        description: 'Search text matching the name or description',
        example: 'Sony',
    })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({
        description: 'Filter by category UUID',
        example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    })
    @IsOptional()
    @IsUUID()
    categoryId?: string;

    @ApiPropertyOptional({
        description: 'Minimum price',
        example: 100,
        minimum: 0,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    minPrice?: number;

    @ApiPropertyOptional({
        description: 'Maximum price',
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
        description: 'Product list sort order',
        example: ProductSort.NEWEST,
    })
    @IsOptional()
    @IsIn(Object.values(ProductSort))
    sort?: ProductSort;

    @ApiPropertyOptional({
        description: 'Page number',
        default: 1,
        minimum: 1,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page: number = 1;

    @ApiPropertyOptional({
        description: 'Number of products per page',
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
        description: 'Whether to include archived (soft-deleted) products',
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    includeArchived?: boolean;

    @ApiPropertyOptional({ description: 'Filter by seller UUID' })
    @IsOptional()
    @IsUUID()
    sellerId?: string;

    @ApiPropertyOptional({
        description: 'Minimum product rating',
        minimum: 0,
        maximum: 5,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @Max(5)
    minRating?: number;

    @ApiPropertyOptional({ description: 'Only products currently in stock' })
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    inStock?: boolean;

    @ApiPropertyOptional({ enum: ProductType, description: 'Product type' })
    @IsOptional()
    @IsEnum(ProductType)
    type?: ProductType;
}
