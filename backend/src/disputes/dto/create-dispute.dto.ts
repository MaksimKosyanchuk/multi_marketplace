import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateDisputeDto {
    @ApiProperty()
    @IsUUID()
    sellerOrderId: string;

    @ApiProperty({ example: 'Product was not delivered' })
    @IsString()
    @MaxLength(150)
    subject: string;

    @ApiProperty({
        example: 'Order did not arrive within the promised timeframe',
    })
    @IsString()
    @MaxLength(2000)
    description: string;
}
