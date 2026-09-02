import { ApiProperty } from '@nestjs/swagger';

export class KpiSummaryDto {
    @ApiProperty({ example: 12500.5, description: 'Общая выручка за период' })
    totalRevenue: number;

    @ApiProperty({ example: 42, description: 'Общее количество заказов' })
    totalOrders: number;

    @ApiProperty({ example: 297.63, description: 'Средний чек заказа' })
    averageOrderValue: number;
}

export class TopProductDto {
    @ApiProperty({ example: 'prod_123', description: 'ID товара' })
    productId: string;

    @ApiProperty({
        example: 'Кроссовки Nike Air',
        description: 'Название товара',
    })
    productName: string;

    @ApiProperty({ example: 15, description: 'Продано штук' })
    totalSold: number;

    @ApiProperty({ example: 2250, description: 'Суммарная выручка по товару' })
    totalRevenue: number;
}

export class TimelinePointDto {
    @ApiProperty({ example: '2026-08-15', description: 'Дата (Europe/Kyiv)' })
    date: string;

    @ApiProperty({ example: 1450.0, description: 'Выручка за день' })
    revenue: number;

    @ApiProperty({ example: 5, description: 'Количество заказов за день' })
    orders: number;
}

export class DashboardResponseDto {
    @ApiProperty({ type: KpiSummaryDto })
    summary: KpiSummaryDto;

    @ApiProperty({ type: [TopProductDto] })
    topProducts: TopProductDto[];

    @ApiProperty({ type: [TimelinePointDto] })
    salesTimeline: TimelinePointDto[];
}
