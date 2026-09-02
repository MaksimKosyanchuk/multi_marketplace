import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
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

@ApiTags('Analytics')
@ApiBearerAuth('JWT-auth')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AnalyticsController {
    constructor(private readonly analyticsService: AnalyticsService) {}

    @Get('dashboard')
    @ApiOperation({
        summary: 'Получить сводку аналитики (KPI, Top 5 товаров, Timeline)',
        description:
            'Доступно только пользователям с ролью ADMIN. Возвращает финансовую статистику за выбранный период.',
    })
    @ApiResponse({
        status: 200,
        description: 'Успешное получение данных дашборда',
        type: DashboardResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: 'Неавторизован (отсутствует или невалиден JWT)',
    })
    @ApiResponse({
        status: 403,
        description: 'Доступ запрещен (требуется роль ADMIN)',
    })
    async getDashboard(@Query() query: DateFilterDto) {
        return this.analyticsService.getDashboardData(query);
    }

    @Get('export/csv')
    @ApiOperation({
        summary: 'Экспортировать отчет по заказам в CSV',
        description:
            'Скачивает CSV-файл со списком заказов за выбранный интервал дат.',
    })
    @ApiProduces('text/csv')
    @ApiResponse({
        status: 200,
        description:
            'CSV-файл успешно сгенерирован и отправлен в виде скачиваемого вложения.',
        schema: {
            type: 'string',
            format: 'binary',
        },
    })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 403, description: 'Доступ запрещен' })
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
}
