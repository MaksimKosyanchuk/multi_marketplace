import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto) {
        return this.reviews.create(user.id, dto);
    }

    @Get('products/:productId')
    @Public()
    @ApiOperation({ summary: 'Get product reviews and rating aggregation' })
    findByProduct(@Param('productId') productId: string) {
        return this.reviews.findByProduct(productId);
    }

    @Get('my')
    @ApiBearerAuth('JWT-auth')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.CUSTOMER)
    findMine(@CurrentUser() user: AuthUser) {
        return this.reviews.findByAuthor(user.id);
    }
}
