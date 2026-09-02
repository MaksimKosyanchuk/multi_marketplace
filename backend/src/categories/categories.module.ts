import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { RedisModule } from 'src/redis/redis.module';

@Module({
    imports: [RedisModule],
    controllers: [CategoriesController],
    providers: [CategoriesService],
})
export class CategoriesModule {}
