import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
    @ApiProperty({ example: 'cat_123abc456', description: 'ID категории' })
    id: string;

    @ApiProperty({ example: 'Электроника', description: 'Название категории' })
    name: string;

    @ApiProperty({
        example: '2026-08-01T10:00:00.000Z',
        description: 'Дата создания',
    })
    createdAt: Date;

    @ApiProperty({
        example: '2026-08-01T10:00:00.000Z',
        description: 'Дата обновления',
    })
    updatedAt: Date;
}
