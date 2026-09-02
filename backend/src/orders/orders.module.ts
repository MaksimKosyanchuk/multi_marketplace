import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersProcessor } from './orders.processor';
import { OrdersGateway } from './orders.geteway';
import { AuthModule } from 'src/auth/auth.module';

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'orders',
        }),
        AuthModule,
    ],
    controllers: [OrdersController],
    providers: [OrdersService, OrdersProcessor, OrdersGateway],
})
export class OrdersModule {}
