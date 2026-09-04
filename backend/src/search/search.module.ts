import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchProcessor } from './search.processor';
import { SearchDispatcher } from './search.dispatcher';

@Module({
    controllers: [SearchController],
    providers: [SearchService, SearchProcessor, SearchDispatcher],
})
export class SearchModule {}
