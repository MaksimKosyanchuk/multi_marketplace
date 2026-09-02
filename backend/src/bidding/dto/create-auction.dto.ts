import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsPositive, IsUUID } from 'class-validator';

export class CreateAuctionDto {
    @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
    @IsUUID()
    productId: string;

    @ApiProperty({ example: 100 })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    startingPrice: number;

    @ApiProperty({ example: 5 })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    minBidIncrement: number;

    @ApiProperty({ example: '2026-09-02T12:00:00.000Z' })
    @IsDateString()
    startsAt: string;

    @ApiProperty({ example: '2026-09-09T12:00:00.000Z' })
    @IsDateString()
    endsAt: string;
}
