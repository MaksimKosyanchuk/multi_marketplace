import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { QueueModule } from './queue/queue.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { LoggerModule } from './logger/logger.module';
import { SellersModule } from './sellers/sellers.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'uploads'),
            serveRoot: '/uploads',
        }),
        AuthModule,

        CategoriesModule,

        ProductsModule,

        CartModule,

        OrdersModule,

        QueueModule,

        AnalyticsModule,

        LoggerModule,

        SellersModule,

        PaymentsModule,
    ],

    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
