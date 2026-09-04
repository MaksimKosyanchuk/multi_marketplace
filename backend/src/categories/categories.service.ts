import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { CategoryRepository } from '../database/category.repository';
import { ProductRepository } from '../database/product.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CategoriesService {
    constructor(
        private readonly categories: CategoryRepository,
        private readonly products: ProductRepository,
        private readonly redis: RedisService,
    ) {}

    async create(dto: CreateCategoryDto) {
        const exists = await this.categories.findByName(dto.name);
        if (exists)
            throw new ConflictException(
                'Category with this name already exists',
            );
        return this.categories.create({
            ...dto,
            slug: await this.createUniqueSlug(dto.name),
        });
    }

    findAll() {
        return this.categories.findAllOrdered();
    }

    async findOne(id: string) {
        const category = await this.categories.findById(id);
        if (!category) throw new NotFoundException('Category not found');
        return category;
    }

    async update(id: string, dto: UpdateCategoryDto) {
        await this.findOne(id);
        const slug = dto.name
            ? await this.createUniqueSlug(dto.name, id)
            : undefined;
        const updatedCategory = await this.categories.update(id, {
            ...dto,
            ...(slug && { slug }),
        });
        await this.redis.delByPattern(`products:list:*`);
        return updatedCategory;
    }

    async remove(id: string) {
        await this.findOne(id);
        const productsCount = await this.products.count({
            categoryId: id,
            isArchived: false,
        });
        if (productsCount > 0) {
            throw new ConflictException(
                'Cannot delete category with existing products',
            );
        }
        return this.categories.delete(id);
    }

    private async createUniqueSlug(name: string, categoryId?: string) {
        const base = name
            .normalize('NFKD')
            .toLowerCase()
            .trim()
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\p{L}\p{N}]+/gu, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80);
        const normalizedBase = base || 'category';

        for (let suffix = 1; ; suffix += 1) {
            const slug =
                suffix === 1 ? normalizedBase : `${normalizedBase}-${suffix}`;
            const existing = await this.categories.findBySlug(slug);
            if (!existing || existing.id === categoryId) return slug;
        }
    }
}
