import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CategoriesService {
    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
    ) {}

    async create(dto: CreateCategoryDto) {
        const exists = await this.prisma.category.findUnique({
            where: { name: dto.name },
        });
        if (exists)
            throw new ConflictException(
                'Category with this name already exists',
            );
        return this.prisma.category.create({ data: dto });
    }

    findAll() {
        return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    }

    async findOne(id: string) {
        const category = await this.prisma.category.findUnique({
            where: { id },
        });
        if (!category) throw new NotFoundException('Category not found');
        return category;
    }

    async update(id: string, dto: UpdateCategoryDto) {
        await this.findOne(id);
        const updatedCategory = await this.prisma.category.update({
            where: { id },
            data: dto,
        });
        await this.redis.delByPattern(`products:list:*`);
        return updatedCategory;
    }

    async remove(id: string) {
        await this.findOne(id);
        const productsCount = await this.prisma.product.count({
            where: { categoryId: id, isArchived: false },
        });
        if (productsCount > 0) {
            throw new ConflictException(
                'Cannot delete category with existing products',
            );
        }
        return this.prisma.category.delete({ where: { id } });
    }
}
