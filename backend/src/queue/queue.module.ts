import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
    imports: [
        BullModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                connection: {
                    host: config.get<string>('REDIS_HOST', 'localhost'),
                    port: Number(config.get<string>('REDIS_PORT', '6379')),
                    maxRetriesPerRequest: null,
                    enableReadyCheck: false,
                },
            }),
        }),
        BullModule.registerQueue(
            { name: 'orders' },
            { name: 'auctions' },
            { name: 'search' },
            { name: 'notifications' },
        ),
    ],
    exports: [BullModule],
})
export class QueueModule {}
