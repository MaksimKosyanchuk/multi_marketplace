import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
    private requests = 0;
    private errors = 0;

    recordRequest(): void {
        this.requests += 1;
    }
    recordError(): void {
        this.errors += 1;
    }

    snapshot(): string {
        return (
            [
                '# HELP marketplace_http_requests_total Total HTTP requests',
                '# TYPE marketplace_http_requests_total counter',
                `marketplace_http_requests_total ${this.requests}`,
                '# HELP marketplace_http_errors_total Total HTTP errors',
                '# TYPE marketplace_http_errors_total counter',
                `marketplace_http_errors_total ${this.errors}`,
            ].join('\n') + '\n'
        );
    }
}
