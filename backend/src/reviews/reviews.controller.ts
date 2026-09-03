import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
    constructor(private readonly reviews: ReviewsService) {}

    @Post()
    @ApiBearerAuth('JWT-auth')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.CUSTOMER)
    @ApiOperation({ summary: 'Create a review for a completed purchase' })
    @ApiBody({ type: CreateReviewDto })
    @ApiResponse({ status: 201, description: 'Review created' })
    @ApiResponse({ status: 400, description: 'Invalid review data' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Customer role required' })
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto) {
        return this.reviews.create(user.id, dto);
    }

    @Get('products/:productId')
    @Public()
    @ApiOperation({ summary: 'Get product reviews and rating aggregation' })
    @ApiParam({ name: 'productId', description: 'Product ID' })
    @ApiResponse({ status: 200, description: 'Product reviews' })
    @ApiResponse({ status: 404, description: 'Product not found' })
    findByProduct(@Param('productId') productId: string) {
        return this.reviews.findByProduct(productId);
    }

    @Get('my')
    @ApiBearerAuth('JWT-auth')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.CUSTOMER)
    @ApiOperation({ summary: 'Get reviews authored by current user' })
    @ApiResponse({ status: 200, description: 'User reviews' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Customer role required' })
    findMine(@CurrentUser() user: AuthUser) {
        return this.reviews.findByAuthor(user.id);
    }
}
