import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Injectable, Logger } from '@nestjs/common';

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
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(OrdersGateway.name);

    constructor(private readonly jwtService: JwtService) {}

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

            await client.join(`user_${userId}`);
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
        this.server.to(`user_${userId}`).emit('order_status_updated', {
            orderId,
            status,
        });
    }

    emitStockUpdate(productId: string, quantity: number) {
        this.server.emit('product_stock_updated', { productId, quantity });
    }
}
