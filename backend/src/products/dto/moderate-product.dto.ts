import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ModerateProductDto {
    @ApiProperty({
        example: 'Product complies with marketplace rules',
        description: 'Administrator comment about the review result',
        required: false,
    })
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    comment?: string;
}
