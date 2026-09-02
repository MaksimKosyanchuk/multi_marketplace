import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSellerApplicationDto {
    @ApiProperty({ example: 'Vintage Kyiv' })
    @IsString()
    @MinLength(2)
    @MaxLength(80)
    displayName: string;

    @ApiPropertyOptional({ example: 'Vintage clothing and accessories.' })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string;
}
