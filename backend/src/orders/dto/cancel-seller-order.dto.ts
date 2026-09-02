import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelSellerOrderDto {
    @ApiPropertyOptional({ example: 'Товар закончился на складе' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string;
}
