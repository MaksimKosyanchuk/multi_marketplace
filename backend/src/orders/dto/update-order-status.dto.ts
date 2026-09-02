import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
    @ApiProperty({
        enum: OrderStatus,
        description: 'Новый статус заказа',
        example: OrderStatus.PROCESSING,
    })
    @IsEnum(OrderStatus)
    status: OrderStatus;
}
