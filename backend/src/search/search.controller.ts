import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryProductDto } from '../products/dto/query-product.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
    constructor(private readonly search: SearchService) {}

    @Get('products')
    @ApiOperation({
        summary: 'Search products with Meilisearch/PostgreSQL fallback',
    })
    searchProducts(@Query() query: QueryProductDto) {
        return this.search.search(query);
    }
}
