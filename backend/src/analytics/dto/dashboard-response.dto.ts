import { ApiProperty } from '@nestjs/swagger';

export class KpiSummaryDto {
    @ApiProperty({
        example: 12500.5,
        description: 'Total revenue for the period',
    })
    totalRevenue: number;

    @ApiProperty({ example: 42, description: 'Total number of orders' })
    totalOrders: number;

    @ApiProperty({ example: 297.63, description: 'Average order value' })
    averageOrderValue: number;
}

export class TopProductDto {
    @ApiProperty({ example: 'prod_123', description: 'Product ID' })
    productId: string;

    @ApiProperty({
        example: 'Nike Air sneakers',
        description: 'Product name',
    })
    productName: string;

    @ApiProperty({ example: 15, description: 'Units sold' })
    totalSold: number;

    @ApiProperty({
        example: 2250,
        description: 'Total revenue for the product',
    })
    totalRevenue: number;
}

export class TimelinePointDto {
    @ApiProperty({ example: '2026-08-15', description: 'Date (Europe/Kyiv)' })
    date: string;

    @ApiProperty({ example: 1450.0, description: 'Revenue for the day' })
    revenue: number;

    @ApiProperty({ example: 5, description: 'Number of orders for the day' })
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
