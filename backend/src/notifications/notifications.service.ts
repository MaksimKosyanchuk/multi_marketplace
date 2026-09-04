import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { NotificationRepository } from '../database/notification.repository';

@Injectable()
export class NotificationsService {
    private server?: Server;

    constructor(private readonly notifications: NotificationRepository) {}

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
        return this.notifications.listForUser(userId, unreadOnly);
    }

    async markRead(userId: string, notificationId: string) {
        return this.notifications.markRead(userId, notificationId);
    }
}
