import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateCategoryDto {
    @ApiProperty({
        example: 'Электроника',
        description: 'Название категории (от 2 до 50 символов)',
        minLength: 2,
        maxLength: 50,
    })
    @IsString()
    @MinLength(2)
    @MaxLength(50)
    name: string;
}
