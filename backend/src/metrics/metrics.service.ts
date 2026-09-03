import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
    private httpRequests = 0;
    private httpErrors = 0;
    private httpDurationMsSum = 0;
    private httpDurationMsCount = 0;

    private ordersCreated = 0;
    private checkoutsTotal = 0;
    private bidsAccepted = 0;
    private bidsRejected = 0;
    private refundsTotal = 0;

    private queueJobsProcessed = 0;
    private queueJobsFailed = 0;
    private queueDurationMsSum = 0;
    private queueDurationMsCount = 0;

    recordRequest(durationMs?: number): void {
        this.httpRequests += 1;
        if (typeof durationMs === 'number' && Number.isFinite(durationMs)) {
            this.httpDurationMsSum += durationMs;
            this.httpDurationMsCount += 1;
        }
    }

    recordError(): void {
        this.httpErrors += 1;
    }

    recordCheckout(): void {
        this.checkoutsTotal += 1;
        this.ordersCreated += 1;
    }

    recordOrderCreated(): void {
        this.ordersCreated += 1;
    }

    recordBidAccepted(): void {
        this.bidsAccepted += 1;
    }

    recordBidRejected(): void {
        this.bidsRejected += 1;
    }

    recordRefund(): void {
        this.refundsTotal += 1;
    }

    recordQueueJob(durationMs: number, failed = false): void {
        if (failed) {
            this.queueJobsFailed += 1;
        } else {
            this.queueJobsProcessed += 1;
        }
        if (Number.isFinite(durationMs)) {
            this.queueDurationMsSum += Math.max(durationMs, 0);
            this.queueDurationMsCount += 1;
        }
    }

    snapshot(): string {
        const avgHttp =
            this.httpDurationMsCount === 0
                ? 0
                : this.httpDurationMsSum / this.httpDurationMsCount;
        const avgQueue =
            this.queueDurationMsCount === 0
                ? 0
                : this.queueDurationMsSum / this.queueDurationMsCount;

        return (
            [
                '# HELP marketplace_http_requests_total Total HTTP requests',
                '# TYPE marketplace_http_requests_total counter',
                `marketplace_http_requests_total ${this.httpRequests}`,
                '# HELP marketplace_http_errors_total Total HTTP 5xx responses',
                '# TYPE marketplace_http_errors_total counter',
                `marketplace_http_errors_total ${this.httpErrors}`,
                '# HELP marketplace_http_request_duration_ms_avg Average HTTP request duration in ms',
                '# TYPE marketplace_http_request_duration_ms_avg gauge',
                `marketplace_http_request_duration_ms_avg ${avgHttp.toFixed(2)}`,
                '# HELP marketplace_orders_created_total Orders created (checkout and auction winner)',
                '# TYPE marketplace_orders_created_total counter',
                `marketplace_orders_created_total ${this.ordersCreated}`,
                '# HELP marketplace_checkouts_total Fixed-price checkout attempts that succeeded',
                '# TYPE marketplace_checkouts_total counter',
                `marketplace_checkouts_total ${this.checkoutsTotal}`,
                '# HELP marketplace_bids_accepted_total Accepted auction bids',
                '# TYPE marketplace_bids_accepted_total counter',
                `marketplace_bids_accepted_total ${this.bidsAccepted}`,
                '# HELP marketplace_bids_rejected_total Rejected auction bids',
                '# TYPE marketplace_bids_rejected_total counter',
                `marketplace_bids_rejected_total ${this.bidsRejected}`,
                '# HELP marketplace_refunds_total Processed item refunds',
                '# TYPE marketplace_refunds_total counter',
                `marketplace_refunds_total ${this.refundsTotal}`,
                '# HELP marketplace_queue_jobs_processed_total Successful queue jobs',
                '# TYPE marketplace_queue_jobs_processed_total counter',
                `marketplace_queue_jobs_processed_total ${this.queueJobsProcessed}`,
                '# HELP marketplace_queue_jobs_failed_total Failed queue jobs',
                '# TYPE marketplace_queue_jobs_failed_total counter',
                `marketplace_queue_jobs_failed_total ${this.queueJobsFailed}`,
                '# HELP marketplace_queue_job_duration_ms_avg Average queue job duration in ms',
                '# TYPE marketplace_queue_job_duration_ms_avg gauge',
                `marketplace_queue_job_duration_ms_avg ${avgQueue.toFixed(2)}`,
            ].join('\n') + '\n'
        );
    }
}
