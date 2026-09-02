import { ApiProperty } from '@nestjs/swagger';

export class AuthTokenResponseDto {
    @ApiProperty({
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        description: 'JWT Access токен',
    })
    accessToken: string;
}

export class UserProfileResponseDto {
    @ApiProperty({ example: 'clr123abc456', description: 'ID пользователя' })
    id: string;

    @ApiProperty({ example: 'user@example.com', description: 'Email' })
    email: string;

    @ApiProperty({ example: 'JohnDoe', description: 'Никнейм' })
    nickName: string;

    @ApiProperty({
        example: 'USER',
        description: 'Роль пользователя в системе',
    })
    role: string;

    @ApiProperty({
        example: '2026-08-01T12:00:00.000Z',
        description: 'Дата создания',
    })
    createdAt: Date;
}
