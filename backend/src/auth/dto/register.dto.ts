import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
    @ApiProperty({
        example: 'newuser@example.com',
        description: 'Email address for registration',
    })
    @IsEmail()
    email: string;

    @ApiProperty({
        example: 'StrongPassword123!',
        description: 'Password (8 to 72 characters)',
        minLength: 8,
        maxLength: 72,
    })
    @IsString()
    @MinLength(8)
    @MaxLength(72)
    password: string;

    @ApiProperty({
        example: 'JohnDoe',
        description: 'Display nickname (2 to 40 characters)',
        minLength: 2,
        maxLength: 40,
    })
    @IsString()
    @MinLength(2)
    @MaxLength(40)
    nickName: string;
}
