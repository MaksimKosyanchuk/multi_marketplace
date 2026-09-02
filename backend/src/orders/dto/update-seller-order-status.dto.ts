import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SellerOrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSellerOrderStatusDto {
    @ApiProperty({
        enum: [
            SellerOrderStatus.PROCESSING,
            SellerOrderStatus.SHIPPED,
            SellerOrderStatus.COMPLETED,
        ],
        example: SellerOrderStatus.SHIPPED,
    })
    @IsEnum(SellerOrderStatus)
    status: SellerOrderStatus;

    @ApiPropertyOptional({
        example: 'UA123456789',
        description: 'Required when moving a seller order to SHIPPED.',
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    trackingNumber?: string;
}
