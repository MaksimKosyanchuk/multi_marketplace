import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Injectable } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { OnGatewayInit } from '@nestjs/websockets';
import { LoggerService } from '../logger/logger.service';

interface JwtPayload {
    sub?: string;
    id?: string;
    [key: string]: unknown;
}

@Injectable()
@WebSocketGateway({
    cors: {
        origin: process.env.CLIENT_URL ?? false,
    },
})
export class OrdersGateway
    implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
    @WebSocketServer()
    server: Server;

    constructor(
        private readonly jwtService: JwtService,
        private readonly notifications: NotificationsService,
        private readonly logger: LoggerService,
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
            const role =
                typeof payload.role === 'string' ? payload.role : undefined;
            if (role) await client.join(`role:${role}`);
            if (role === 'SELLER') await client.join(`seller:${userId}`);
            void this.logger.audit(OrdersGateway.name, 'WebSocket connected', {
                socketId: client.id,
                userId,
            });
        } catch (err: unknown) {
            const errorMessage =
                err instanceof Error ? err.message : 'Unknown error';
            void this.logger.error(
                OrdersGateway.name,
                'WebSocket connection error',
                {
                    socketId: client.id,
                    error: errorMessage,
                },
            );
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        void this.logger.audit(OrdersGateway.name, 'WebSocket disconnected', {
            socketId: client.id,
            userId: client.data.userId,
        });
    }

    emitOrderStatusUpdate(
        userId: string,
        orderId: string,
        status: string,
        eventId?: string,
    ) {
        this.server.to(`user:${userId}`).emit('order_status_updated', {
            orderId,
            status,
            eventId,
        });
    }

    emitStockUpdate(productId: string, quantity: number, eventId?: string) {
        this.server.emit('product_stock_updated', {
            productId,
            quantity,
            eventId,
        });
    }
}
