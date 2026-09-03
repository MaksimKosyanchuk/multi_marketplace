import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export class CreateReviewDto {
    @ApiProperty({ description: 'Completed order item being reviewed' })
    @IsUUID()
    orderItemId: string;

    @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
    @IsInt()
    @Min(1)
    @Max(5)
    rating: number;

    @ApiPropertyOptional({ maxLength: 2000 })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    comment?: string;
}
