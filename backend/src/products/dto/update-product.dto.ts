import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';
import { IsOptional, IsUrl, ValidateIf } from 'class-validator';

export class UpdateProductDto extends PartialType(CreateProductDto) {
    @ApiPropertyOptional({
        example: 'https://example.com/images/new-headphones.jpg',
        description: 'External product image URL, or null to remove it',
        nullable: true,
    })
    @IsOptional()
    @ValidateIf(
        (o: { imageUrl?: unknown }) => o.imageUrl !== null && o.imageUrl !== '',
    )
    @IsUrl({}, { message: 'imageUrl must be a valid URL or null' })
    imageUrl?: string | null;
}
