import { NotificationsProcessor } from './notifications.processor';

describe('NotificationsProcessor queue metrics', () => {
    it('records a failed queue job when the outbox event is missing', async () => {
        const metrics = { recordQueueJob: jest.fn() };
        const processor = new NotificationsProcessor(
            {
                outboxEvent: {
                    findUnique: jest.fn().mockResolvedValue(null),
                },
            } as never,
            {} as never,
            { debug: jest.fn(), error: jest.fn() } as never,
            metrics as never,
        );

        await expect(
            processor.process({
                id: 'job-1',
                data: { outboxEventId: 'event-1' },
                attemptsMade: 0,
            } as never),
        ).rejects.toThrow('Outbox event event-1 not found');

        expect(metrics.recordQueueJob).toHaveBeenCalledWith(
            expect.any(Number),
            true,
        );
    });
});
