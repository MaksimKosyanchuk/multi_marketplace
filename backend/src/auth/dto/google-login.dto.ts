import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class GoogleLoginDto {
    @ApiProperty({ description: 'Google OAuth access token' })
    @IsString()
    @MinLength(20)
    accessToken: string;
}
