import { OrdersProcessor } from './orders.processor';

describe('OrdersProcessor outbox delivery', () => {
    it('does not emit or create a receipt when the event was already claimed', async () => {
        const prisma = {
            outboxEvent: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        };
        const gateway = { emitOrderStatusUpdate: jest.fn(), emitStockUpdate: jest.fn() };
        const redis = { setIfAbsent: jest.fn() };
        const logger = { debug: jest.fn(), log: jest.fn(), audit: jest.fn(), error: jest.fn() };
        const processor = new OrdersProcessor(
            prisma as never,
            gateway as never,
            redis as never,
            logger as never,
        );

        await processor.process({
            id: 'job-1',
            name: 'deliver-outbox-event',
            data: { outboxEventId: 'event-1' },
            attemptsMade: 0,
        } as never);

        expect(gateway.emitOrderStatusUpdate).not.toHaveBeenCalled();
        expect(redis.setIfAbsent).not.toHaveBeenCalled();
    });

    it('delivers an event only once when a receipt already exists', async () => {
        const prisma = {
            outboxEvent: {
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                findUnique: jest.fn().mockResolvedValue({
                    id: 'event-1',
                    type: 'order.status-changed',
                    payload: {},
                    order: { id: 'order-1', userId: 'user-1', status: 'SHIPPED' },
                    sellerOrder: null,
                }),
                update: jest.fn(),
            },
            eventConsumerReceipt: {
                findUnique: jest.fn().mockResolvedValue({ eventId: 'event-1' }),
                create: jest.fn(),
            },
        };
        const gateway = { emitOrderStatusUpdate: jest.fn(), emitStockUpdate: jest.fn() };
        const redis = { setIfAbsent: jest.fn() };
        const logger = { debug: jest.fn(), log: jest.fn(), audit: jest.fn(), error: jest.fn() };
        const processor = new OrdersProcessor(
            prisma as never,
            gateway as never,
            redis as never,
            logger as never,
        );

        await processor.process({
            id: 'job-1',
            name: 'deliver-outbox-event',
            data: { outboxEventId: 'event-1' },
            attemptsMade: 0,
        } as never);

        expect(gateway.emitOrderStatusUpdate).not.toHaveBeenCalled();
        expect(prisma.eventConsumerReceipt.create).not.toHaveBeenCalled();
        expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'PROCESSED' }),
            }),
        );
    });
});
