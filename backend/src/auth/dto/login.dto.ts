import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
    @ApiProperty({
        example: 'user@example.com',
        description: 'Email пользователя',
    })
    @IsEmail()
    email: string;

    @ApiProperty({
        example: 'StrongPassword123!',
        description: 'Пароль (минимум 8 символов)',
        minLength: 8,
    })
    @IsString()
    @MinLength(8)
    password: string;
}
