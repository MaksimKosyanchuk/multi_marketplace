import { ApiProperty } from '@nestjs/swagger';

export class AuthTokenResponseDto {
    @ApiProperty({
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        description: 'JWT access token',
    })
    accessToken: string;
}

export class UserProfileResponseDto {
    @ApiProperty({ example: 'clr123abc456', description: 'User ID' })
    id: string;

    @ApiProperty({ example: 'user@example.com', description: 'Email' })
    email: string;

    @ApiProperty({ example: 'JohnDoe', description: 'Nickname' })
    nickName: string;

    @ApiProperty({
        example: 'USER',
        description: 'User role in the system',
    })
    role: string;

    @ApiProperty({
        example: '2026-08-01T12:00:00.000Z',
        description: 'Creation date',
    })
    createdAt: Date;
}
