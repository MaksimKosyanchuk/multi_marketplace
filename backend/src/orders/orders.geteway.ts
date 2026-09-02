import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { OnGatewayInit } from '@nestjs/websockets';

interface JwtPayload {
    sub?: string;
    id?: string;
    [key: string]: unknown;
}

@Injectable()
@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class OrdersGateway
    implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(OrdersGateway.name);

    constructor(
        private readonly jwtService: JwtService,
        private readonly notifications: NotificationsService,
    ) {}

    afterInit(server: Server): void {
        this.notifications.registerServer(server);
    }

    async handleConnection(client: Socket) {
        try {
            const token = client.handshake.auth?.token as string | undefined;
            if (!token) {
                client.disconnect();
                return;
            }

            const payload =
                await this.jwtService.verifyAsync<JwtPayload>(token);
            const userId = payload.sub ?? payload.id;

            if (!userId) {
                client.disconnect();
                return;
            }

            client.data.userId = userId;
            await client.join(`user:${userId}`);
            const role = typeof payload.role === 'string' ? payload.role : undefined;
            if (role) await client.join(`role:${role}`);
            if (role === 'SELLER') await client.join(`seller:${userId}`);
            this.logger.log(`Client connected: ${client.id} (User: ${userId})`);
        } catch (err: unknown) {
            const errorMessage =
                err instanceof Error ? err.message : 'Unknown error';
            this.logger.error(`Socket connection error: ${errorMessage}`);
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    emitOrderStatusUpdate(userId: string, orderId: string, status: string) {
        this.server.to(`user:${userId}`).emit('order_status_updated', {
            orderId,
            status,
        });
    }

    emitStockUpdate(productId: string, quantity: number) {
        this.server.emit('product_stock_updated', { productId, quantity });
    }
}
