import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
    constructor(private readonly metrics: MetricsService) {}

    use(req: Request, res: Response, next: NextFunction): void {
        if (req.path === '/metrics') {
            next();
            return;
        }

        const started = Date.now();
        res.on('finish', () => {
            this.metrics.recordRequest(Date.now() - started);
            if (res.statusCode >= 500) {
                this.metrics.recordError();
            }
        });
        next();
    }
}
