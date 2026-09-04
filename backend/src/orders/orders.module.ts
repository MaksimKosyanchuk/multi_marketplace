import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersProcessor } from './orders.processor';
import { OrdersDispatcher } from './orders.dispatcher';
import { OrdersGateway } from './orders.geteway';
import { AuthModule } from 'src/auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [AuthModule, PaymentsModule, NotificationsModule],
    controllers: [OrdersController],
    providers: [
        OrdersService,
        OrdersProcessor,
        OrdersDispatcher,
        OrdersGateway,
    ],
})
export class OrdersModule {}
