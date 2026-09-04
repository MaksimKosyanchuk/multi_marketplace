import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DatabaseClient } from './database.types';

@Injectable()
export class CategoryRepository {
    constructor(
        @Inject(PrismaService) private readonly prisma: DatabaseClient,
    ) {}

    findById(id: string, db: DatabaseClient = this.prisma) {
        return db.category.findUnique({ where: { id } });
    }

    findByName(name: string, db: DatabaseClient = this.prisma) {
        return db.category.findUnique({ where: { name } });
    }

    findBySlug(slug: string, db: DatabaseClient = this.prisma) {
        return db.category.findUnique({ where: { slug } });
    }

    findAllOrdered(db: DatabaseClient = this.prisma) {
        return db.category.findMany({ orderBy: { name: 'asc' } });
    }

    create(
        data: Prisma.CategoryCreateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.category.create({ data });
    }

    update(
        id: string,
        data: Prisma.CategoryUpdateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.category.update({ where: { id }, data });
    }

    delete(id: string, db: DatabaseClient = this.prisma) {
        return db.category.delete({ where: { id } });
    }
}
