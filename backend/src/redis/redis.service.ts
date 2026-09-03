import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private client: Redis;

    constructor(private readonly config: ConfigService) {}

    onModuleInit(): void {
        this.client = new Redis({
            host: this.config.get<string>('REDIS_HOST', 'localhost'),
            port: Number(this.config.get<string>('REDIS_PORT', '6379')),
            maxRetriesPerRequest: null,
        });
    }

    async onModuleDestroy(): Promise<void> {
        await this.client.quit();
    }

    getClient(): Redis {
        return this.client;
    }

    async get(key: string): Promise<string | null> {
        return this.client.get(key);
    }

    async set(key: string, value: string, ttlSeconds: number): Promise<void> {
        await this.client.set(key, value, 'EX', ttlSeconds);
    }

    async setIfAbsent(
        key: string,
        value: string,
        ttlSeconds: number,
    ): Promise<boolean> {
        const result = await this.client.set(
            key,
            value,
            'EX',
            ttlSeconds,
            'NX',
        );
        return result === 'OK';
    }

    async incr(key: string): Promise<number> {
        return this.client.incr(key);
    }

    async del(...keys: string[]): Promise<void> {
        if (keys.length) await this.client.del(...keys);
    }

    async keys(pattern: string): Promise<string[]> {
        const keys: string[] = [];
        let cursor = '0';
        do {
            const [nextCursor, batch] = await this.client.scan(
                cursor,
                'MATCH',
                pattern,
                'COUNT',
                100,
            );
            cursor = nextCursor;
            keys.push(...batch);
        } while (cursor !== '0');
        return keys;
    }

    async delByPattern(pattern: string): Promise<void> {
        try {
            const keys = await this.keys(pattern);
            if (keys.length) {
                await this.client.del(...keys);
            }
        } catch (error: unknown) {
            this.logger.warn(
                `Redis cache invalidation unavailable: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    async getCache(key: string): Promise<string | null> {
        try {
            return await this.get(key);
        } catch (error: unknown) {
            this.logger.warn(
                `Redis cache read unavailable: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return null;
        }
    }

    async setCache(key: string, value: string, ttlSeconds: number): Promise<void> {
        try {
            await this.set(key, value, ttlSeconds);
        } catch (error: unknown) {
            this.logger.warn(
                `Redis cache write unavailable: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }
}
