import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { runWithCorrelationId } from './correlation.context';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction): void {
        const correlationId = req.header('x-correlation-id') ?? randomUUID();
        res.setHeader('x-correlation-id', correlationId);
        runWithCorrelationId(correlationId, next);
    }
}
