import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchProcessor } from './search.processor';
import { SearchDispatcher } from './search.dispatcher';

@Module({
    imports: [BullModule.registerQueue({ name: 'search' })],
    controllers: [SearchController],
    providers: [SearchService, SearchProcessor, SearchDispatcher],
})
export class SearchModule {}
