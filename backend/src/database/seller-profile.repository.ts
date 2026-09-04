import { Inject, Injectable } from '@nestjs/common';
import { Prisma, SellerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DatabaseClient } from './database.types';

@Injectable()
export class SellerProfileRepository {
    constructor(
        @Inject(PrismaService) private readonly prisma: DatabaseClient,
    ) {}

    findByUserId(userId: string, db: DatabaseClient = this.prisma) {
        return db.sellerProfile.findUnique({ where: { userId } });
    }

    findById(id: string, db: DatabaseClient = this.prisma) {
        return db.sellerProfile.findUnique({ where: { id } });
    }

    findByIdOrThrow(id: string, db: DatabaseClient = this.prisma) {
        return db.sellerProfile.findUniqueOrThrow({ where: { id } });
    }

    upsertForUser(
        userId: string,
        data: Prisma.SellerProfileUncheckedCreateInput,
        update: Prisma.SellerProfileUncheckedUpdateInput,
        db: DatabaseClient = this.prisma,
    ) {
        return db.sellerProfile.upsert({
            where: { userId },
            create: data,
            update,
        });
    }

    listApplications(status?: SellerStatus, db: DatabaseClient = this.prisma) {
        return db.sellerProfile.findMany({
            where: status ? { status } : undefined,
            include: {
                user: { select: { id: true, email: true, nickName: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    claimPending(
        id: string,
        data: Prisma.SellerProfileUpdateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.sellerProfile.updateMany({
            where: { id, status: SellerStatus.PENDING },
            data,
        });
    }

    update(
        id: string,
        data: Prisma.SellerProfileUpdateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.sellerProfile.update({ where: { id }, data });
    }
}
