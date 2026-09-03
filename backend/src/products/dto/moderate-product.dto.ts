import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ModerateProductDto {
    @ApiProperty({
        example: 'Товар соответствует правилам площадки',
        description: 'Комментарий администратора по результату проверки',
        required: false,
    })
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    comment?: string;
}
