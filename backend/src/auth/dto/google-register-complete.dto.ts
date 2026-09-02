import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class GoogleRegisterCompleteDto {
    @ApiProperty()
    @IsString()
    @MinLength(20)
    accessToken: string;

    @ApiProperty()
    @IsString()
    @MinLength(32)
    registrationToken: string;

    @ApiProperty({ minLength: 2, maxLength: 40 })
    @IsString()
    @MinLength(2)
    @MaxLength(40)
    nickName: string;

    @ApiProperty({ minLength: 8, maxLength: 72 })
    @IsString()
    @MinLength(8)
    @MaxLength(72)
    password: string;
}
