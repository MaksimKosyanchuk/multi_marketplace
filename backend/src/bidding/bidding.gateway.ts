import {
    OnGatewayInit,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { NotificationsService } from '../notifications/notifications.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class BiddingGateway implements OnGatewayInit {
    @WebSocketServer()
    server: Server;

    constructor(private readonly notifications: NotificationsService) {}

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
