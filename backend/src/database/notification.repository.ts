import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { DatabaseClient } from './database.types';

@Injectable()
export class NotificationRepository {
    constructor(
        @Inject(PrismaService) private readonly prisma: DatabaseClient,
    ) {}

    listForUser(
        userId: string,
        unreadOnly = false,
        db: DatabaseClient = this.prisma,
    ) {
        return db.notification.findMany({
            where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
            orderBy: { createdAt: 'desc' },
        });
    }

    markRead(
        userId: string,
        notificationId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.notification.updateMany({
            where: { id: notificationId, userId, readAt: null },
            data: { readAt: new Date() },
        });
    }
}
