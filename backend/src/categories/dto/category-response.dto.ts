import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
    @ApiProperty({ example: 'cat_123abc456', description: 'Category ID' })
    id: string;

    @ApiProperty({ example: 'Electronics', description: 'Category name' })
    name: string;

    @ApiProperty({
        example: '2026-08-01T10:00:00.000Z',
        description: 'Creation date',
    })
    createdAt: Date;

    @ApiProperty({
        example: '2026-08-01T10:00:00.000Z',
        description: 'Last update date',
    })
    updatedAt: Date;
}
