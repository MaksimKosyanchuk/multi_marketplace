import { Controller, Get, Header } from '@nestjs/common';
import {
    ApiOperation,
    ApiProduces,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

@Controller()
@ApiTags('Metrics')
export class MetricsController {
    constructor(private readonly metrics: MetricsService) {}

    @Get('metrics')
    @Header('Content-Type', 'text/plain; version=0.0.4')
    @ApiOperation({ summary: 'Get Prometheus metrics' })
    @ApiProduces('text/plain')
    @ApiResponse({
        status: 200,
        description: 'Application metrics in Prometheus format',
        schema: { type: 'string' },
    })
    getMetrics(): string {
        return this.metrics.snapshot();
    }
}
