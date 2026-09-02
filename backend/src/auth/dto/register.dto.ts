import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
    @ApiProperty({
        example: 'newuser@example.com',
        description: 'Email для регистрации',
    })
    @IsEmail()
    email: string;

    @ApiProperty({
        example: 'StrongPassword123!',
        description: 'Пароль (от 8 до 72 символов)',
        minLength: 8,
        maxLength: 72,
    })
    @IsString()
    @MinLength(8)
    @MaxLength(72)
    password: string;

    @ApiProperty({
        example: 'JohnDoe',
        description: 'Отображаемый никнейм (от 2 до 40 символов)',
        minLength: 2,
        maxLength: 40,
    })
    @IsString()
    @MinLength(2)
    @MaxLength(40)
    nickName: string;
}
