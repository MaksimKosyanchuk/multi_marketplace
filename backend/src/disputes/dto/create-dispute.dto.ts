import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateDisputeDto {
    @ApiProperty()
    @IsUUID()
    sellerOrderId: string;

    @ApiProperty({ example: 'Товар не доставлен' })
    @IsString()
    @MaxLength(150)
    subject: string;

    @ApiProperty({ example: 'Заказ не прибыл в обещанный срок' })
    @IsString()
    @MaxLength(2000)
    description: string;
}
