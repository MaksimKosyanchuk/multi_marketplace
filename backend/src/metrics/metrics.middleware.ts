import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
    constructor(private readonly metrics: MetricsService) {}

    use(req: Request, res: Response, next: NextFunction): void {
        const correlationId = req.header('x-correlation-id') ?? randomUUID();
        res.setHeader('x-correlation-id', correlationId);
        this.metrics.recordRequest();
        res.on('finish', () => {
            if (res.statusCode >= 500) this.metrics.recordError();
        });
        next();
    }
}
