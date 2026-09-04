import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { BiddingService } from '../src/bidding/bidding.service';
import { OrdersService } from '../src/orders/orders.service';
import { OrdersProcessor } from '../src/orders/orders.processor';
import { ProductsService } from '../src/products/products.service';
import { JwtService } from '@nestjs/jwt';
import {
    AuctionStatus,
    BidStatus,
    OrderStatus,
    PaymentStatus,
    ProductStatus,
    ProductType,
    Role,
    SellerOrderStatus,
} from '@prisma/client';

describe('Critical marketplace flows (integration)', () => {
    let module: TestingModule;
    let app: INestApplication;
    let prisma: PrismaService;
    let bidding: BiddingService;
    let orders: OrdersService;
    let products: ProductsService;
    let processor: OrdersProcessor;
    let jwt: JwtService;

    const suffix = `e2e-${Date.now()}`;
    const createdUserIds: string[] = [];
    const createdProductIds: string[] = [];
    const createdAuctionIds: string[] = [];
    const createdOrderIds: string[] = [];
    const createdOutboxIds: string[] = [];
    const createdCategoryIds: string[] = [];

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        
        app = module.createNestApplication();
        prisma = module.get(PrismaService);
        
        await prisma.$connect();
        await app.init();

        bidding = module.get(BiddingService);
        orders = module.get(OrdersService);
        products = module.get(ProductsService);
        processor = module.get(OrdersProcessor);
        jwt = module.get(JwtService);
    });

    afterAll(async () => {
        await prisma.eventConsumerReceipt.deleteMany({
            where: { eventId: { in: createdOutboxIds } },
        });
        await prisma.outboxEvent.deleteMany({
            where: {
                OR: [
                    { id: { in: createdOutboxIds } },
                    { orderId: { in: createdOrderIds } },
                    { aggregateId: { in: createdAuctionIds } },
                    { aggregateId: { in: createdProductIds } },
                ],
            },
        });
        await prisma.refund.deleteMany({
            where: {
                sellerOrder: { orderId: { in: createdOrderIds } },
            },
        });
        await prisma.ledgerEntry.deleteMany({
            where: {
                OR: [
                    { sellerOrder: { orderId: { in: createdOrderIds } } },
                    { payment: { orderId: { in: createdOrderIds } } },
                ],
            },
        });
        await prisma.orderItem.deleteMany({
            where: {
                OR: [
                    { productId: { in: createdProductIds } },
                    { sellerOrder: { orderId: { in: createdOrderIds } } },
                ],
            },
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
            where: {
                OR: [
                    { bidderId: { in: createdUserIds } },
                    { auctionId: { in: createdAuctionIds } },
                ],
            },
        });
        await prisma.auction.deleteMany({
            where: { id: { in: createdAuctionIds } },
        });
        await prisma.product.deleteMany({
            where: { id: { in: createdProductIds } },
        });
        await prisma.category.deleteMany({
            where: {
                OR: [
                    { id: { in: createdCategoryIds } },
                    { name: { startsWith: `E2E ${suffix}` } },
                ],
            },
        });
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

    async function createCategory(label: string) {
        const category = await prisma.category.create({
            data: {
                name: `E2E ${suffix} ${label}`,
                slug: `e2e-${suffix}-${label}`,
            },
        });
        createdCategoryIds.push(category.id);
        return category;
    }

    it('creates one SellerOrder per seller and decrements every product atomically', async () => {
        const { token } = await createCustomerThroughHttp('customer');
        const sellerA = await createUser(Role.SELLER, 'seller-a');
        const sellerB = await createUser(Role.SELLER, 'seller-b');
        const category = await createCategory('checkout');
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

        await request(app.getHttpServer() as SupertestApp)
            .post('/cart/items')
            .set('Authorization', `Bearer ${token}`)
            .send({ productId: productA.id, quantity: 2 })
            .expect(201);
        await request(app.getHttpServer() as SupertestApp)
            .post('/cart/items')
            .set('Authorization', `Bearer ${token}`)
            .send({ productId: productB.id, quantity: 3 })
            .expect(201);

        const checkoutResponse = await request(
            app.getHttpServer() as SupertestApp,
        )
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
            where: { id: { in: [productA.id, productB.id] } },
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
        const category = await createCategory('auction');
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

    it('accepts a last-second bid and rejects bids after endAuction claims the lot', async () => {
        const seller = await createUser(Role.SELLER, 'last-second-seller');
        const bidder = await createUser(Role.CUSTOMER, 'last-second-bidder');
        const lateBidder = await createUser(Role.CUSTOMER, 'late-bidder');
        const category = await createCategory('last-second');
        const product = await prisma.product.create({
            data: {
                sellerId: seller.id,
                categoryId: category.id,
                name: 'E2E last-second product',
                slug: `e2e-last-second-${suffix}`,
                description: 'Last-second auction product',
                type: ProductType.AUCTION,
                status: ProductStatus.ACTIVE,
                price: 50,
                stock: 1,
            },
        });
        createdProductIds.push(product.id);
        const auction = await prisma.auction.create({
            data: {
                productId: product.id,
                startingPrice: 50,
                currentPrice: 50,
                minBidIncrement: 5,
                startsAt: new Date(Date.now() - 1_000),
                endsAt: new Date(Date.now() + 250),
                status: AuctionStatus.ACTIVE,
            },
        });
        createdAuctionIds.push(auction.id);

        await bidding.placeBid(
            bidder.id,
            auction.id,
            55,
            `e2e-last-second-bid-${suffix}`,
        );

        await new Promise((resolve) => setTimeout(resolve, 300));
        const race = await Promise.allSettled([
            bidding.endAuction(auction.id),
            bidding.placeBid(
                lateBidder.id,
                auction.id,
                60,
                `e2e-late-bid-${suffix}`,
            ),
        ]);

        const ended = await prisma.auction.findUniqueOrThrow({
            where: { id: auction.id },
        });
        const bids = await prisma.bid.findMany({
            where: { auctionId: auction.id },
        });
        const lateResult = race[1];

        expect(ended.status).toBe(AuctionStatus.SOLD);
        expect(ended.winnerId).toBe(bidder.id);
        expect(bids).toHaveLength(1);
        expect(lateResult.status).toBe('rejected');
    });

    it('accepts only one concurrent winner checkout and ignores expiry after claim', async () => {
        const seller = await createUser(Role.SELLER, 'window-seller');
        const winner = await createUser(Role.CUSTOMER, 'window-winner');
        const category = await createCategory('window');
        const product = await prisma.product.create({
            data: {
                sellerId: seller.id,
                categoryId: category.id,
                name: 'E2E winner-window product',
                slug: `e2e-window-${suffix}`,
                description: 'Winner checkout window product',
                type: ProductType.AUCTION,
                status: ProductStatus.ACTIVE,
                price: 80,
                stock: 1,
            },
        });
        createdProductIds.push(product.id);
        const auction = await prisma.auction.create({
            data: {
                productId: product.id,
                startingPrice: 80,
                currentPrice: 90,
                minBidIncrement: 10,
                startsAt: new Date(Date.now() - 60_000),
                endsAt: new Date(Date.now() - 1_000),
                status: AuctionStatus.SOLD,
                winnerId: winner.id,
                checkoutExpiresAt: new Date(Date.now() + 60_000),
            },
        });
        createdAuctionIds.push(auction.id);

        const results = await Promise.allSettled([
            bidding.checkoutWinner(
                winner.id,
                auction.id,
                `e2e-winner-checkout-a-${suffix}`,
            ),
            bidding.checkoutWinner(
                winner.id,
                auction.id,
                `e2e-winner-checkout-b-${suffix}`,
            ),
        ]);
        const accepted = results.filter(
            (result) => result.status === 'fulfilled',
        );
        const current = await prisma.auction.findUniqueOrThrow({
            where: { id: auction.id },
        });
        const orderCount = await prisma.order.count({
            where: {
                userId: winner.id,
                sellerOrders: {
                    some: {
                        items: { some: { productId: product.id } },
                    },
                },
            },
        });
        expect(accepted.length).toBeGreaterThanOrEqual(1);
        expect(current.checkoutOrderId).toBeTruthy();
        expect(orderCount).toBe(1);
        createdOrderIds.push(current.checkoutOrderId!);

        await prisma.auction.update({
            where: { id: auction.id },
            data: { checkoutExpiresAt: new Date(Date.now() - 1_000) },
        });
        await bidding.expireWinnerCheckout(auction.id);
        const afterExpiry = await prisma.auction.findUniqueOrThrow({
            where: { id: auction.id },
        });
        expect(afterExpiry.status).toBe(AuctionStatus.SOLD);
        expect(afterExpiry.checkoutOrderId).toBe(current.checkoutOrderId);
    });

    it('expires an unused winner checkout window and then rejects checkout', async () => {
        const seller = await createUser(Role.SELLER, 'expired-window-seller');
        const winner = await createUser(Role.CUSTOMER, 'expired-window-winner');
        const category = await createCategory('expired-window');
        const product = await prisma.product.create({
            data: {
                sellerId: seller.id,
                categoryId: category.id,
                name: 'E2E expired-window product',
                slug: `e2e-expired-window-${suffix}`,
                description: 'Expired winner checkout window',
                type: ProductType.AUCTION,
                status: ProductStatus.ACTIVE,
                price: 70,
                stock: 1,
            },
        });
        createdProductIds.push(product.id);
        const auction = await prisma.auction.create({
            data: {
                productId: product.id,
                startingPrice: 70,
                currentPrice: 75,
                minBidIncrement: 5,
                startsAt: new Date(Date.now() - 60_000),
                endsAt: new Date(Date.now() - 1_000),
                status: AuctionStatus.SOLD,
                winnerId: winner.id,
                checkoutExpiresAt: new Date(Date.now() - 1_000),
            },
        });
        createdAuctionIds.push(auction.id);

        await bidding.expireWinnerCheckout(auction.id);
        await expect(
            bidding.checkoutWinner(
                winner.id,
                auction.id,
                `e2e-expired-checkout-${suffix}`,
            ),
        ).rejects.toThrow();

        const current = await prisma.auction.findUniqueOrThrow({
            where: { id: auction.id },
        });
        expect(current.status).toBe(AuctionStatus.EXPIRED);
        expect(current.checkoutOrderId).toBeNull();
        expect(current.winnerId).toBeNull();
    });

    it('serializes concurrent partial refunds so refunded quantity never exceeds purchased quantity', async () => {
        const customer = await createUser(Role.CUSTOMER, 'refund-customer');
        const seller = await createUser(Role.SELLER, 'refund-seller');
        const category = await createCategory('refund');
        const product = await prisma.product.create({
            data: {
                sellerId: seller.id,
                categoryId: category.id,
                name: 'E2E refund product',
                slug: `e2e-refund-${suffix}`,
                description: 'Concurrent refund product',
                type: ProductType.FIXED_PRICE,
                status: ProductStatus.ACTIVE,
                price: 40,
                stock: 10,
            },
        });
        createdProductIds.push(product.id);

        const order = await prisma.order.create({
            data: {
                userId: customer.id,
                status: OrderStatus.PROCESSING,
                subtotal: 80,
                totalAmount: 80,
                payments: {
                    create: {
                        provider: 'mock',
                        status: PaymentStatus.PAID,
                        amount: 80,
                        idempotencyKey: `e2e-refund-payment-${suffix}`,
                        paidAt: new Date(),
                    },
                },
                sellerOrders: {
                    create: {
                        sellerId: seller.id,
                        status: SellerOrderStatus.PROCESSING,
                        subtotal: 80,
                        commissionRate: 0.1,
                        commissionAmount: 8,
                        sellerEarnings: 72,
                        items: {
                            create: {
                                productId: product.id,
                                productName: product.name,
                                quantity: 2,
                                unitPrice: 40,
                                totalAmount: 80,
                            },
                        },
                    },
                },
            },
            include: {
                sellerOrders: { include: { items: true } },
            },
        });
        createdOrderIds.push(order.id);
        const orderItemId = order.sellerOrders[0].items[0].id;

        const results = await Promise.allSettled([
            orders.refundOrderItem(
                customer.id,
                orderItemId,
                2,
                'race-a',
                `e2e-refund-a-${suffix}`,
            ),
            orders.refundOrderItem(
                customer.id,
                orderItemId,
                2,
                'race-b',
                `e2e-refund-b-${suffix}`,
            ),
        ]);

        const accepted = results.filter(
            (result) => result.status === 'fulfilled',
        );
        const rejected = results.filter(
            (result) => result.status === 'rejected',
        );
        const refunds = await prisma.refund.findMany({
            where: { orderItemId },
        });
        const refundedQuantity = refunds.reduce(
            (sum, refund) => sum + refund.quantity,
            0,
        );

        expect(accepted).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(refundedQuantity).toBe(2);
    });

    it('cancels one seller order without cancelling sibling seller orders', async () => {
        const customer = await createUser(Role.CUSTOMER, 'partial-customer');
        const sellerA = await createUser(Role.SELLER, 'partial-seller-a');
        const sellerB = await createUser(Role.SELLER, 'partial-seller-b');
        const category = await createCategory('partial-cancel');
        const [productA, productB] = await Promise.all([
            prisma.product.create({
                data: {
                    sellerId: sellerA.id,
                    categoryId: category.id,
                    name: 'E2E partial A',
                    slug: `e2e-partial-a-${suffix}`,
                    description: 'Partial cancel A',
                    type: ProductType.FIXED_PRICE,
                    status: ProductStatus.ACTIVE,
                    price: 25,
                    stock: 3,
                },
            }),
            prisma.product.create({
                data: {
                    sellerId: sellerB.id,
                    categoryId: category.id,
                    name: 'E2E partial B',
                    slug: `e2e-partial-b-${suffix}`,
                    description: 'Partial cancel B',
                    type: ProductType.FIXED_PRICE,
                    status: ProductStatus.ACTIVE,
                    price: 35,
                    stock: 4,
                },
            }),
        ]);
        createdProductIds.push(productA.id, productB.id);

        const order = await prisma.order.create({
            data: {
                userId: customer.id,
                status: OrderStatus.PROCESSING,
                subtotal: 60,
                totalAmount: 60,
                payments: {
                    create: {
                        provider: 'mock',
                        status: PaymentStatus.PAID,
                        amount: 60,
                        idempotencyKey: `e2e-partial-payment-${suffix}`,
                        paidAt: new Date(),
                    },
                },
                sellerOrders: {
                    create: [
                        {
                            sellerId: sellerA.id,
                            status: SellerOrderStatus.PROCESSING,
                            subtotal: 25,
                            commissionRate: 0.1,
                            commissionAmount: 2.5,
                            sellerEarnings: 22.5,
                            items: {
                                create: {
                                    productId: productA.id,
                                    productName: productA.name,
                                    quantity: 1,
                                    unitPrice: 25,
                                    totalAmount: 25,
                                },
                            },
                        },
                        {
                            sellerId: sellerB.id,
                            status: SellerOrderStatus.PROCESSING,
                            subtotal: 35,
                            commissionRate: 0.1,
                            commissionAmount: 3.5,
                            sellerEarnings: 31.5,
                            items: {
                                create: {
                                    productId: productB.id,
                                    productName: productB.name,
                                    quantity: 1,
                                    unitPrice: 35,
                                    totalAmount: 35,
                                },
                            },
                        },
                    ],
                },
            },
            include: { sellerOrders: true },
        });
        createdOrderIds.push(order.id);
        const target = order.sellerOrders.find(
            (item) => item.sellerId === sellerA.id,
        );
        expect(target).toBeDefined();

        await orders.cancelSellerOrder(
            sellerA.id,
            target!.id,
            `e2e-partial-cancel-${suffix}`,
        );

        const sellerOrders = await prisma.sellerOrder.findMany({
            where: { orderId: order.id },
        });
        const parent = await prisma.order.findUniqueOrThrow({
            where: { id: order.id },
        });
        const stockA = await prisma.product.findUniqueOrThrow({
            where: { id: productA.id },
        });

        expect(
            sellerOrders.find((item) => item.sellerId === sellerA.id)?.status,
        ).toBe(SellerOrderStatus.CANCELLED);
        expect(
            sellerOrders.find((item) => item.sellerId === sellerB.id)?.status,
        ).toBe(SellerOrderStatus.PROCESSING);
        expect(parent.status).toBe(OrderStatus.PROCESSING);
        expect(stockA.stock).toBe(4);
    });

    it('removes an archived product from another customer cart', async () => {
        const seller = await createUser(Role.SELLER, 'archive-seller');
        const customer = await createUser(Role.CUSTOMER, 'archive-customer');
        const category = await createCategory('archive');
        const product = await prisma.product.create({
            data: {
                sellerId: seller.id,
                categoryId: category.id,
                name: 'E2E archive product',
                slug: `e2e-archive-${suffix}`,
                description: 'Archived while in foreign cart',
                type: ProductType.FIXED_PRICE,
                status: ProductStatus.ACTIVE,
                price: 15,
                stock: 2,
            },
        });
        createdProductIds.push(product.id);
        const cart = await prisma.cart.findUniqueOrThrow({
            where: { userId: customer.id },
        });
        await prisma.cartItem.create({
            data: {
                cartId: cart.id,
                productId: product.id,
                quantity: 1,
            },
        });

        await products.remove(product.id, seller.id);

        const remaining = await prisma.cartItem.count({
            where: { productId: product.id },
        });
        const archived = await prisma.product.findUniqueOrThrow({
            where: { id: product.id },
        });
        expect(remaining).toBe(0);
        expect(archived.isArchived).toBe(true);
        expect(archived.status).toBe(ProductStatus.ARCHIVED);
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