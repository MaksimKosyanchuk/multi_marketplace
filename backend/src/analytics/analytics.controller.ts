import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiProduces,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { DateFilterDto } from './dto/date-filter.dto';
import { DashboardResponseDto } from './dto/dashboard-response.dto';
import type { Request } from 'express';

@ApiTags('Analytics')
@ApiBearerAuth('JWT-auth')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AnalyticsController {
    constructor(private readonly analyticsService: AnalyticsService) {}

    @Get('dashboard')
    @ApiOperation({
        summary: 'Get the analytics dashboard (KPI, top 5 products, timeline)',
        description:
            'Available only to users with the ADMIN role. Returns financial statistics for the selected period.',
    })
    @ApiResponse({
        status: 200,
        description: 'Dashboard data retrieved successfully',
        type: DashboardResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: 'Unauthorized (JWT is missing or invalid)',
    })
    @ApiResponse({
        status: 403,
        description: 'Forbidden (ADMIN role required)',
    })
    async getDashboard(@Query() query: DateFilterDto) {
        return this.analyticsService.getDashboardData(query);
    }

    @Get('export/csv')
    @ApiOperation({
        summary: 'Export the order report as CSV',
        description:
            'Downloads a CSV file containing orders for the selected date range.',
    })
    @ApiProduces('text/csv')
    @ApiResponse({
        status: 200,
        description:
            'CSV file generated successfully and sent as a downloadable attachment.',
        schema: {
            type: 'string',
            format: 'binary',
        },
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async exportCsv(@Res() res: Response, @Query() query: DateFilterDto) {
        const csvData = await this.analyticsService.generateOrdersCsv(query);
        const filename = `sales_report_${new Date().toISOString().slice(0, 10)}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`,
        );
        return res.send(csvData);
    }

    @Get('seller')
    @Roles('SELLER')
    @ApiOperation({ summary: 'Get analytics for the current seller' })
    @ApiResponse({ status: 200, description: 'Seller analytics' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'SELLER role required' })
    async sellerAnalytics(
        @Req() req: Request & { user: { id: string } },
        @Query() query: DateFilterDto,
    ) {
        return this.analyticsService.getSellerAnalytics(req.user.id, query);
    }

    @Get('seller/comparison')
    @Roles('SELLER')
    @ApiOperation({ summary: 'Compare metrics for the current seller' })
    @ApiResponse({ status: 200, description: 'Comparative analytics' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'SELLER role required' })
    async sellerComparison(
        @Req() req: Request & { user: { id: string } },
        @Query() query: DateFilterDto,
    ) {
        return this.analyticsService.getSellerComparison(req.user.id, query);
    }

    @Get('seller/timeline')
    @Roles('SELLER')
    @ApiOperation({ summary: 'Get the seller sales timeline' })
    @ApiResponse({ status: 200, description: 'Timeline' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'SELLER role required' })
    async sellerTimeline(
        @Req() req: Request & { user: { id: string } },
        @Query() query: DateFilterDto,
    ) {
        return this.analyticsService.getSellerTimeline(req.user.id, query);
    }

    @Get('rankings')
    @Roles('ADMIN')
    @ApiOperation({ summary: 'Get seller rankings' })
    @ApiResponse({ status: 200, description: 'Seller rankings' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'ADMIN role required' })
    async sellerRankings(@Query() query: DateFilterDto) {
        return this.analyticsService.getSellerRankings(query);
    }

    @Get('export/json')
    @Roles('ADMIN')
    @ApiProduces('application/json')
    @ApiOperation({ summary: 'Export analytics as JSON' })
    @ApiResponse({ status: 200, description: 'Analytics JSON file', schema: { type: 'object' } })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'ADMIN role required' })
    async exportJson(@Res() res: Response, @Query() query: DateFilterDto) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="analytics_${new Date().toISOString().slice(0, 10)}.json"`,
        );
        return res.send(
            await this.analyticsService.generateDashboardJson(query),
        );
    }
}
