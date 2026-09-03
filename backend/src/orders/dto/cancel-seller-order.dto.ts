import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelSellerOrderDto {
    @ApiPropertyOptional({ example: 'Product is out of stock' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string;
}
