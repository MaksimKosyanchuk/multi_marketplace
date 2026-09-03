import {
    ConnectedSocket,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';

interface JwtPayload {
    sub?: string;
    role?: string;
}

@WebSocketGateway({ cors: { origin: process.env.CLIENT_URL ?? false } })
export class BiddingGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    constructor(
        private readonly notifications: NotificationsService,
        private readonly prisma: PrismaService,
        private readonly jwt: JwtService,
        private readonly logger: LoggerService,
    ) {}

    async handleConnection(client: Socket): Promise<void> {
        try {
            const token = client.handshake.auth?.token as string | undefined;

            if (!token) {
                client.disconnect();
                return;
            }

            const payload = await this.jwt.verifyAsync<JwtPayload>(token);

            if (!payload.sub) {
                client.disconnect();
                return;
            }

            client.data.userId = payload.sub;
            client.data.role = payload.role;

            await client.join(`user:${payload.sub}`);

            if (payload.role === 'SELLER') {
                await client.join(`seller:${payload.sub}`);
            }
        } catch (error: unknown) {
            void this.logger.warn(
                BiddingGateway.name,
                'WebSocket connection rejected',
                {
                    socketId: client.id,
                    error:
                        error instanceof Error
                            ? error.message
                            : 'invalid token',
                },
            );

            client.disconnect();
        }
    }

    handleDisconnect(client: Socket): void {
        void this.logger.audit(
            BiddingGateway.name,
            'WebSocket disconnected',
            {
                socketId: client.id,
                userId: client.data.userId,
            },
        );
    }

    @SubscribeMessage('auction_subscribe')
    async subscribe(
        @ConnectedSocket() client: Socket,
        payload: { auctionId?: string },
    ): Promise<{ subscribed: boolean }> {
        const auctionId = payload?.auctionId;
        if (!client.data.userId || !auctionId) return { subscribed: false };
        const auction = await this.prisma.auction.findUnique({
            where: { id: auctionId },
            select: {
                id: true,
                status: true,
                product: { select: { sellerId: true, isArchived: true } },
            },
        });
        if (
            !auction ||
            auction.product.isArchived ||
            auction.status === 'CANCELLED'
        )
            return { subscribed: false };
        if (auction.product.sellerId === client.data.userId) {
            await client.join(`auction:${auctionId}`);
            return { subscribed: true };
        }
        await client.join(`auction:${auctionId}`);
        return { subscribed: true };
    }

    @SubscribeMessage('auction_unsubscribe')
    async unsubscribe(
        @ConnectedSocket() client: Socket,
        payload: { auctionId?: string },
    ): Promise<{ subscribed: boolean }> {
        if (payload?.auctionId)
            await client.leave(`auction:${payload.auctionId}`);
        return { subscribed: false };
    }

    afterInit(server: Server): void {
        this.notifications.registerServer(server);
    }

    emitBidUpdate(auctionId: string, currentPrice: string, bidderId: string) {
        this.server.to(`auction:${auctionId}`).emit('auction_bid_updated', {
            auctionId,
            currentPrice,
            bidderId,
        });
    }

    emitAuctionEvent(type: string, payload: Record<string, unknown>) {
        const auctionId =
            typeof payload.auctionId === 'string'
                ? payload.auctionId
                : undefined;
        (auctionId ? this.server.to(`auction:${auctionId}`) : this.server).emit(
            'auction_event',
            { type, payload },
        );
    }
}
