import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { DatabaseClient } from './database.types';

@Injectable()
export class RefreshTokenRepository {
    constructor(
        @Inject(PrismaService) private readonly prisma: DatabaseClient,
    ) {}

    findByTokenHash(tokenHash: string, db: DatabaseClient = this.prisma) {
        return db.refreshToken.findUnique({
            where: { tokenHash },
            include: { user: true },
        });
    }

    deleteById(id: string, db: DatabaseClient = this.prisma) {
        return db.refreshToken.delete({ where: { id } });
    }

    deleteByTokenHash(tokenHash: string, db: DatabaseClient = this.prisma) {
        return db.refreshToken.deleteMany({ where: { tokenHash } });
    }

    deleteByUserId(userId: string, db: DatabaseClient = this.prisma) {
        return db.refreshToken.deleteMany({ where: { userId } });
    }

    create(
        data: { tokenHash: string; userId: string; expiresAt: Date },
        db: DatabaseClient = this.prisma,
    ) {
        return db.refreshToken.create({ data });
    }
}
