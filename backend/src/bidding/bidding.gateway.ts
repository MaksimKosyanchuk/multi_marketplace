import {
    ConnectedSocket,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class BiddingGateway implements OnGatewayInit {
    @WebSocketServer()
    server: Server;

    constructor(
        private readonly notifications: NotificationsService,
        private readonly prisma: PrismaService,
    ) {}

    @SubscribeMessage('auction_subscribe')
    async subscribe(
        @ConnectedSocket() client: Socket,
        payload: { auctionId?: string },
    ): Promise<{ subscribed: boolean }> {
        const auctionId = payload?.auctionId;
        if (!client.data.userId || !auctionId) return { subscribed: false };
        const auction = await this.prisma.auction.findUnique({
            where: { id: auctionId },
            select: { id: true },
        });
        if (!auction) return { subscribed: false };
        await client.join(`auction:${auctionId}`);
        return { subscribed: true };
    }

    @SubscribeMessage('auction_unsubscribe')
    async unsubscribe(
        @ConnectedSocket() client: Socket,
        payload: { auctionId?: string },
    ): Promise<{ subscribed: boolean }> {
        if (payload?.auctionId) await client.leave(`auction:${payload.auctionId}`);
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

    emitAuctionEvent(type: string, payload: object) {
        const auctionId =
            typeof payload.auctionId === 'string' ? payload.auctionId : undefined;
        (auctionId ? this.server.to(`auction:${auctionId}`) : this.server).emit(
            'auction_event',
            { type, payload },
        );
    }
}
