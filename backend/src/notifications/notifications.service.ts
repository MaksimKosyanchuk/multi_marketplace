import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
    private server?: Server;

    constructor(private readonly prisma: PrismaService) {}

    registerServer(server: Server): void {
        this.server = server;
    }

    notifyUser(userId: string, event: string, payload: object): void {
        this.server?.to(`user:${userId}`).emit(event, payload);
    }

    notifySeller(sellerId: string, event: string, payload: object): void {
        this.server?.to(`seller:${sellerId}`).emit(event, payload);
    }

    notifyAdmins(event: string, payload: object): void {
        this.server?.to('role:ADMIN').emit(event, payload);
    }

    async listForUser(userId: string, unreadOnly = false) {
        return this.prisma.notification.findMany({
            where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
            orderBy: { createdAt: 'desc' },
        });
    }

    async markRead(userId: string, notificationId: string) {
        return this.prisma.notification.updateMany({
            where: { id: notificationId, userId, readAt: null },
            data: { readAt: new Date() },
        });
    }
}
