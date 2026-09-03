import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateCategoryDto {
    @ApiProperty({
        example: 'Electronics',
        description: 'Category name (2 to 50 characters)',
        minLength: 2,
        maxLength: 50,
    })
    @IsString()
    @MinLength(2)
    @MaxLength(50)
    name: string;
}
