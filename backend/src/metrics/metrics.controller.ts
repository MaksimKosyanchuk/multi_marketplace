import { Controller, Get, Header } from '@nestjs/common';
import {
    ApiOperation,
    ApiProduces,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { MetricsService } from './metrics.service';

@Controller()
@ApiTags('Metrics')
@SkipThrottle()
export class MetricsController {
    constructor(private readonly metrics: MetricsService) {}

    @Get('metrics')
    @Header('Content-Type', 'text/plain; version=0.0.4')
    @ApiOperation({
        summary: 'Prometheus metrics (orders, bids, queue, HTTP)',
    })
    @ApiProduces('text/plain')
    @ApiResponse({
        status: 200,
        description: 'Application metrics in Prometheus text format',
        schema: { type: 'string' },
    })
    getMetrics(): string {
        return this.metrics.snapshot();
    }
}
