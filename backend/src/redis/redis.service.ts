import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
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

    async incr(key: string): Promise<number> {
        return this.client.incr(key);
    }

    async del(...keys: string[]): Promise<void> {
        if (keys.length) await this.client.del(...keys);
    }

    async keys(pattern: string): Promise<string[]> {
        return this.client.keys(pattern);
    }

    async delByPattern(pattern: string): Promise<void> {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
            await this.client.del(...keys);
        }
    }
}
