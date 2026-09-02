import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class BiddingGateway {
    @WebSocketServer()
    server: Server;

    emitBidUpdate(auctionId: string, currentPrice: string, bidderId: string) {
        this.server.emit('auction_bid_updated', {
            auctionId,
            currentPrice,
            bidderId,
        });
    }

    emitAuctionEvent(type: string, payload: object) {
        this.server.emit('auction_event', { type, payload });
    }
}
