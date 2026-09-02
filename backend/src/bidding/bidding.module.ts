import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module';
import { BiddingController } from './bidding.controller';
import { BiddingGateway } from './bidding.gateway';
import { BiddingProcessor } from './bidding.processor';
import { BiddingService } from './bidding.service';
import { BiddingDispatcher } from './bidding.dispatcher';

@Module({
    imports: [AuthModule, BullModule.registerQueue({ name: 'auctions' })],
    controllers: [BiddingController],
    providers: [
        BiddingService,
        BiddingProcessor,
        BiddingDispatcher,
        BiddingGateway,
    ],
})
export class BiddingModule {}
