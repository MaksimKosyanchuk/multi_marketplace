import { SearchProcessor } from './search.processor';

describe('SearchProcessor queue metrics', () => {
    it('records a successful queue job when the outbox row is not claimed', async () => {
        const metrics = { recordQueueJob: jest.fn() };
        const processor = new SearchProcessor(
            {} as never,
            {} as never,
            {
                outboxEvent: {
                    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
                },
            } as never,
            { debug: jest.fn(), error: jest.fn() } as never,
            metrics as never,
        );

        await processor.process({
            id: 'job-1',
            data: {
                eventId: 'event-1',
                productId: 'product-1',
                action: 'index',
            },
            attemptsMade: 0,
        } as never);

        expect(metrics.recordQueueJob).toHaveBeenCalledWith(expect.any(Number));
        expect(metrics.recordQueueJob).not.toHaveBeenCalledWith(
            expect.any(Number),
            true,
        );
    });
});
