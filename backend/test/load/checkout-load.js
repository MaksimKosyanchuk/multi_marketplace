import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const JWT_SECRET = 'insiders_jwt';

async function main() {
    const baseUrl = process.env.LOAD_BASE_URL || 'http://localhost:3001';
    const quantity = 1;
    const concurrency = 4;
    const initialStock = 2;
    const requests = 4;

    console.log('1. Creating test data in database...');

    const category = await prisma.category.create({
        data: { name: `Load Category ${runId}`, slug: `load-cat-${runId}` },
    });
    const seller = await prisma.user.create({
        data: {
            email: `seller-${runId}@example.com`,
            nickName: `seller-${runId}`,
            role: 'SELLER',
        },
    });

    const product = await prisma.product.create({
        data: {
            sellerId: seller.id,
            categoryId: category.id,
            name: `Load Test Product ${runId}`,
            slug: `load-prod-${runId}`,
            description: 'Automated load test product',
            type: 'FIXED_PRICE',
            status: 'ACTIVE',
            price: 150,
            stock: initialStock,
        },
    });

    const tokens = [];
    const customerIds = [];
    for (let i = 0; i < 4; i++) {
        const customer = await prisma.user.create({
            data: {
                email: `customer-${i}-${runId}@example.com`,
                nickName: `customer-${i}-${runId}`,
                role: 'CUSTOMER',
                cart: { create: {} },
            },
        });
        customerIds.push(customer.id);

        const token = jwt.sign(
            {
                sub: customer.id,
                email: customer.email,
                role: customer.role,
            },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        tokens.push(token);
    }

    console.log('2. Preparing carts for customers...');
    const headers = (token) => ({
        authorization: 'Bearer ' + token,
        'content-type': 'application/json',
    });

    for (const token of tokens) {
        const response = await fetch(baseUrl + '/cart/items', {
            method: 'POST',
            headers: headers(token),
            body: JSON.stringify({ productId: product.id, quantity }),
        });
        if (!response.ok) {
            throw new Error(`Unable to prepare cart: HTTP ${response.status} ${await response.text()}`);
        }
    }

    console.log('3. Running load test (4 concurrent checkouts)...');
    const durations = [];
    let successfulCheckouts = 0;
    let expectedStockRejections = 0;
    let unexpectedErrors = 0;
    let nextRequest = 0;

    async function runCheckout(index) {
        const started = performance.now();
        try {
            const response = await fetch(baseUrl + '/orders/checkout', {
                method: 'POST',
                headers: {
                    ...headers(tokens[index]),
                    'idempotency-key': `load-limited-stock-${runId}-${index}`,
                },
            });
            if (response.status === 201) {
                successfulCheckouts += 1;
                return;
            }
            const body = await response.text();
            if (response.status === 400 && /unavailable|insufficient stock|stock/i.test(body)) {
                expectedStockRejections += 1;
                return;
            }
            unexpectedErrors += 1;
            console.error(JSON.stringify({ request: index, status: response.status, body }));
        } catch {
            unexpectedErrors += 1;
        } finally {
            durations.push(performance.now() - started);
        }
    }

    const started = performance.now();
    async function worker() {
        while (nextRequest < requests) await runCheckout(nextRequest++);
    }
    await Promise.all(
        Array.from({ length: Math.min(concurrency, requests) }, worker),
    );

    const elapsed = performance.now() - started;
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)];
    
    console.log(
        JSON.stringify(
            {
                scenario: 'limited-stock checkout (self-contained)',
                endpoint: '/orders/checkout',
                requests,
                concurrency,
                productId: product.id,
                quantity,
                initialStock,
                rps: Number((requests / (elapsed / 1000)).toFixed(2)),
                p95LatencyMs: Number(p95.toFixed(2)),
                successfulCheckouts,
                expectedStockRejections,
                errors: unexpectedErrors,
            },
            null,
            2,
        ),
    );

    console.log('4. Cleaning up test data...');
    
    const sellerOrders = await prisma.sellerOrder.findMany({
        where: { sellerId: seller.id },
        select: { orderId: true },
    });
    const orderIds = [...new Set(sellerOrders.map(so => so.orderId))];

    if (orderIds.length > 0) {
        await prisma.orderItem.deleteMany({ where: { sellerOrder: { orderId: { in: orderIds } } } });
        await prisma.ledgerEntry.deleteMany({ where: { sellerOrder: { orderId: { in: orderIds } } } });
        await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
        await prisma.sellerOrder.deleteMany({ where: { orderId: { in: orderIds } } });
        await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }

    await prisma.cartItem.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.cart.deleteMany({ where: { userId: { in: customerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [seller.id, ...customerIds] } } });
    await prisma.$disconnect();

    if (
        successfulCheckouts !== initialStock ||
        expectedStockRejections !== requests - initialStock ||
        successfulCheckouts * quantity > initialStock ||
        unexpectedErrors > 0
    ) {
        console.error('Limited-stock invariant failed.');
        process.exitCode = 1;
    }
}

void main();