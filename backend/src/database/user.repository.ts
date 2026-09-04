import { Inject, Injectable } from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DatabaseClient } from './database.types';

@Injectable()
export class UserRepository {
    constructor(
        @Inject(PrismaService) private readonly prisma: DatabaseClient,
    ) {}

    findByEmail(email: string, db: DatabaseClient = this.prisma) {
        return db.user.findUnique({ where: { email } });
    }

    findById(id: string, db: DatabaseClient = this.prisma) {
        return db.user.findUnique({ where: { id } });
    }

    count(db: DatabaseClient = this.prisma) {
        return db.user.count();
    }

    create(
        data: {
            email: string;
            passwordHash?: string | null;
            nickName: string;
            role?: Role;
        },
        db: DatabaseClient = this.prisma,
    ): Promise<User> {
        return db.user.create({
            data: {
                ...data,
                cart: { create: {} },
            },
        });
    }

    updateRole(id: string, role: Role, db: DatabaseClient = this.prisma) {
        return db.user.update({
            where: { id },
            data: { role },
        });
    }

    update(
        id: string,
        data: Prisma.UserUpdateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.user.update({ where: { id }, data });
    }
}
