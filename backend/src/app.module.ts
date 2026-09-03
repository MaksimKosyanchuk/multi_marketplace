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
import { BiddingModule } from './bidding/bidding.module';
import { SearchModule } from './search/search.module';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { MetricsModule } from './metrics/metrics.module';
import { DisputesModule } from './disputes/disputes.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReviewsModule } from './reviews/reviews.module';
import { DatabaseModule } from './database/database.module';
import { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { CorrelationMiddleware } from './common/correlation/correlation.middleware';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

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

        BiddingModule,

        SearchModule,
        MetricsModule,
        DisputesModule,
        NotificationsModule,
        ReviewsModule,
        DatabaseModule,
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    ],

    controllers: [AppController],
    providers: [
        AppService,
        { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
    ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(CorrelationMiddleware).forRoutes('*');
    }
}
