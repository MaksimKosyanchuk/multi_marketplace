import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { BiddingService } from '../src/bidding/bidding.service';
import { OrdersProcessor } from '../src/orders/orders.processor';
import { JwtService } from '@nestjs/jwt';
import {
    AuctionStatus,
    BidStatus,
    ProductStatus,
    ProductType,
    Role,
} from '@prisma/client';

describe('Critical marketplace flows (integration)', () => {
    let module: TestingModule;
    let app: INestApplication;
    let prisma: PrismaService;
    let bidding: BiddingService;
    let processor: OrdersProcessor;
    let jwt: JwtService;

    const suffix = `e2e-${Date.now()}`;
    const createdUserIds: string[] = [];
    const createdProductIds: string[] = [];
    const createdAuctionIds: string[] = [];
    const createdOrderIds: string[] = [];
    const createdOutboxIds: string[] = [];

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = module.createNestApplication();
        await app.init();
        prisma = module.get(PrismaService);
        bidding = module.get(BiddingService);
        processor = module.get(OrdersProcessor);
        jwt = module.get(JwtService);
    });

    afterAll(async () => {
        await prisma.eventConsumerReceipt.deleteMany({
            where: { eventId: { in: createdOutboxIds } },
        });
        await prisma.outboxEvent.deleteMany({
            where: { id: { in: createdOutboxIds } },
        });
        await prisma.orderItem.deleteMany({
            where: { productId: { in: createdProductIds } },
        });
        await prisma.orderItem.deleteMany({
            where: { sellerOrder: { orderId: { in: createdOrderIds } } },
        });
        await prisma.ledgerEntry.deleteMany({
            where: { sellerOrder: { orderId: { in: createdOrderIds } } },
        });
        await prisma.payment.deleteMany({
            where: { orderId: { in: createdOrderIds } },
        });
        await prisma.sellerOrder.deleteMany({
            where: { orderId: { in: createdOrderIds } },
        });
        await prisma.order.deleteMany({
            where: { id: { in: createdOrderIds } },
        });
        await prisma.cartItem.deleteMany({
            where: { cart: { userId: { in: createdUserIds } } },
        });
        await prisma.cart.deleteMany({
            where: { userId: { in: createdUserIds } },
        });
        await prisma.bid.deleteMany({
            where: { bidderId: { in: createdUserIds } },
        });
        await prisma.auction.deleteMany({
            where: { id: { in: createdAuctionIds } },
        });
        await prisma.product.deleteMany({
            where: { id: { in: createdProductIds } },
        });
        await prisma.category.deleteMany({ where: { name: `E2E ${suffix}` } });
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
        await app.close();
    });

    async function createUser(role: Role, name: string) {
        const user = await prisma.user.create({
            data: {
                email: `${name}-${suffix}@example.com`,
                nickName: name,
                role,
                cart: { create: {} },
            },
        });
        createdUserIds.push(user.id);
        return user;
    }

    async function createCustomerThroughHttp(name: string) {
        const user = await createUser(Role.CUSTOMER, name);
        const token = await jwt.signAsync({
            sub: user.id,
            email: user.email,
            role: user.role,
        });
        return {
            user,
            token,
        };
    }

    it('creates one SellerOrder per seller and decrements every product atomically', async () => {
        const { user: customer, token } =
            await createCustomerThroughHttp('customer');
        const sellerA = await createUser(Role.SELLER, 'seller-a');
        const sellerB = await createUser(Role.SELLER, 'seller-b');
        const category = await prisma.category.create({
            data: { name: `E2E ${suffix}`, slug: `e2e-${suffix}` },
        });
        const [productA, productB] = await Promise.all([
            prisma.product.create({
                data: {
                    sellerId: sellerA.id,
                    categoryId: category.id,
                    name: 'E2E product A',
                    slug: `e2e-product-a-${suffix}`,
                    description: 'Integration product A',
                    type: ProductType.FIXED_PRICE,
                    status: ProductStatus.ACTIVE,
                    price: 100,
                    stock: 5,
                },
            }),
            prisma.product.create({
                data: {
                    sellerId: sellerB.id,
                    categoryId: category.id,
                    name: 'E2E product B',
                    slug: `e2e-product-b-${suffix}`,
                    description: 'Integration product B',
                    type: ProductType.FIXED_PRICE,
                    status: ProductStatus.ACTIVE,
                    price: 200,
                    stock: 7,
                },
            }),
        ]);
        createdProductIds.push(productA.id, productB.id);

        await request(app.getHttpServer())
            .post('/cart/items')
            .set('Authorization', `Bearer ${token}`)
            .send({ productId: productA.id, quantity: 2 })
            .expect(201);
        await request(app.getHttpServer())
            .post('/cart/items')
            .set('Authorization', `Bearer ${token}`)
            .send({ productId: productB.id, quantity: 3 })
            .expect(201);

        const checkoutResponse = await request(app.getHttpServer())
            .post('/orders/checkout')
            .set('Authorization', `Bearer ${token}`)
            .set('Idempotency-Key', `e2e-checkout-${suffix}`)
            .expect(201);
        const order = checkoutResponse.body as { id: string };
        createdOrderIds.push(order.id);
        const persisted = await prisma.order.findUniqueOrThrow({
            where: { id: order.id },
            include: { sellerOrders: true },
        });
        const products = await prisma.product.findMany({
            where: { id: { in: createdProductIds } },
        });

        expect(persisted.sellerOrders).toHaveLength(2);
        expect(
            new Set(persisted.sellerOrders.map((item) => item.sellerId)),
        ).toEqual(new Set([sellerA.id, sellerB.id]));
        expect(products.find((item) => item.id === productA.id)?.stock).toBe(3);
        expect(products.find((item) => item.id === productB.id)?.stock).toBe(4);
    });

    it('accepts only one concurrent bid at each optimistic version', async () => {
        const seller = await createUser(Role.SELLER, 'auction-seller');
        const bidderA = await createUser(Role.CUSTOMER, 'bidder-a');
        const bidderB = await createUser(Role.CUSTOMER, 'bidder-b');
        const category = await prisma.category.create({
            data: {
                name: `E2E auction ${suffix}`,
                slug: `e2e-auction-${suffix}`,
            },
        });
        const product = await prisma.product.create({
            data: {
                sellerId: seller.id,
                categoryId: category.id,
                name: 'E2E auction product',
                slug: `e2e-auction-product-${suffix}`,
                description: 'Integration auction product',
                type: ProductType.AUCTION,
                status: ProductStatus.ACTIVE,
                price: 100,
                stock: 1,
            },
        });
        createdProductIds.push(product.id);
        const auction = await prisma.auction.create({
            data: {
                productId: product.id,
                startingPrice: 100,
                currentPrice: 100,
                minBidIncrement: 10,
                startsAt: new Date(Date.now() - 1_000),
                endsAt: new Date(Date.now() + 60_000),
                status: AuctionStatus.ACTIVE,
            },
        });
        createdAuctionIds.push(auction.id);

        const results = await Promise.allSettled([
            bidding.placeBid(
                bidderA.id,
                auction.id,
                110,
                `e2e-bid-a-${suffix}`,
            ),
            bidding.placeBid(
                bidderB.id,
                auction.id,
                110,
                `e2e-bid-b-${suffix}`,
            ),
        ]);
        const accepted = results.filter(
            (result) => result.status === 'fulfilled',
        );
        const rejected = results.filter(
            (result) => result.status === 'rejected',
        );
        const current = await prisma.auction.findUniqueOrThrow({
            where: { id: auction.id },
        });
        const bids = await prisma.bid.findMany({
            where: { auctionId: auction.id },
        });

        expect(accepted).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(bids).toHaveLength(1);
        expect(bids[0].status).toBe(BidStatus.ACTIVE);
        expect(current.currentPrice.toString()).toBe('110');
        expect(current.version).toBe(1);
    });

    it('processes the same outbox event idempotently', async () => {
        const event = await prisma.outboxEvent.create({
            data: {
                aggregateType: 'Product',
                aggregateId: 'e2e-idempotency',
                type: 'product.stock-changed',
                payload: { productId: 'e2e-idempotency', quantity: -1 },
                idempotencyKey: `e2e-outbox-${suffix}`,
            },
        });
        createdOutboxIds.push(event.id);
        const job = {
            id: `job-${suffix}`,
            name: 'deliver-outbox-event',
            data: { outboxEventId: event.id },
            attemptsMade: 0,
        } as never;

        await processor.process(job);
        await processor.process(job);

        const receiptCount = await prisma.eventConsumerReceipt.count({
            where: {
                eventId: event.id,
                consumerName: 'orders-websocket',
            },
        });
        const processed = await prisma.outboxEvent.findUniqueOrThrow({
            where: { id: event.id },
        });
        expect(receiptCount).toBe(1);
        expect(processed.status).toBe('PROCESSED');
    });
});
