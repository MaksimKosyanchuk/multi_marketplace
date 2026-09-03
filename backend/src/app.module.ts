import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { AnalyticsModule } from './analytics/analytics.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BiddingModule } from './bidding/bidding.module';
import { CartModule } from './cart/cart.module';
import { CategoriesModule } from './categories/categories.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { CorrelationMiddleware } from './common/correlation/correlation.middleware';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';
import { DatabaseModule } from './database/database.module';
import { DisputesModule } from './disputes/disputes.module';
import { LoggerModule } from './logger/logger.module';
import { MetricsModule } from './metrics/metrics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ProductsModule } from './products/products.module';
import { QueueModule } from './queue/queue.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SearchModule } from './search/search.module';
import { SellersModule } from './sellers/sellers.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: [
                `.env.${process.env.NODE_ENV || 'development'}`,
                '.env',
            ],
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
        // Generous default so checkout load tests are not blocked; login/bids stay stricter via @Throttle.
        // THROTTLE_DISABLED=true (or NODE_ENV=test) turns throttling off entirely for load/e2e runs.
        ThrottlerModule.forRoot({
            throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
            skipIf: () =>
                process.env.THROTTLE_DISABLED === 'true' ||
                process.env.NODE_ENV === 'test',
        }),
    ],
    controllers: [AppController],
    providers: [
        AppService,
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
    ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(CorrelationMiddleware).forRoutes('*');
    }
}
