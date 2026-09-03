import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
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
    @ApiQuery({ name: 'search', required: false, description: 'Search text' })
    @ApiResponse({ status: 200, description: 'Search results' })
    @ApiResponse({ status: 400, description: 'Invalid search parameters' })
    searchProducts(@Query() query: QueryProductDto) {
        return this.search.search(query);
    }
}
