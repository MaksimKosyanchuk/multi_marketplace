import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
    @ApiProperty({
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        description: 'Refresh токен для обновления сессии',
        minLength: 20,
    })
    @IsString()
    @MinLength(20)
    refreshToken: string;
}
