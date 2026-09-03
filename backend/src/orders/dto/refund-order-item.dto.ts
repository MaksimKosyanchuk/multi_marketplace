import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsInt,
    IsOptional,
    IsPositive,
    IsString,
    MaxLength,
} from 'class-validator';

export class RefundOrderItemDto {
    @ApiProperty({ example: 1, minimum: 1 })
    @IsInt()
    @IsPositive()
    quantity: number;

    @ApiPropertyOptional({ example: 'Product was damaged' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string;
}
