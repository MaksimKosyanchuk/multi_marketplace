import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { BiddingController } from './bidding.controller';
import { BiddingGateway } from './bidding.gateway';
import { BiddingProcessor } from './bidding.processor';
import { BiddingService } from './bidding.service';
import { BiddingDispatcher } from './bidding.dispatcher';

@Module({
    imports: [AuthModule, NotificationsModule],
    controllers: [BiddingController],
    providers: [
        BiddingService,
        BiddingProcessor,
        BiddingDispatcher,
        BiddingGateway,
    ],
})
export class BiddingModule {}
