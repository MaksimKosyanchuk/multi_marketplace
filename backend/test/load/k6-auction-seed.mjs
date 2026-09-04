import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const __dirname = dirname(fileURLToPath(import.meta.url));

const prisma = new PrismaClient();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'insiders_jwt';
const bidderCount = Number(process.env.K6_BIDDERS || 8);

async function main() {
    const now = new Date();
    const category = await prisma.category.create({
        data: {
            name: `K6 Auction Category ${runId}`,
            slug: `k6-cat-${runId}`,
        },
    });
    const seller = await prisma.user.create({
        data: {
            email: `k6-seller-${runId}@example.com`,
            nickName: `k6-seller-${runId}`,
            role: 'SELLER',
        },
    });
    const product = await prisma.product.create({
        data: {
            sellerId: seller.id,
            categoryId: category.id,
            name: `K6 Auction Product ${runId}`,
            slug: `k6-prod-${runId}`,
            description: 'k6 concurrent bid load product',
            type: 'AUCTION',
            status: 'ACTIVE',
            price: 100,
            stock: 1,
        },
    });
    const auction = await prisma.auction.create({
        data: {
            productId: product.id,
            startingPrice: 100,
            currentPrice: 100,
            minBidIncrement: 1,
            startsAt: new Date(now.getTime() - 60_000),
            endsAt: new Date(now.getTime() + 30 * 60_000),
            status: 'ACTIVE',
        },
    });

    const tokens = [];
    for (let i = 0; i < bidderCount; i += 1) {
        const customer = await prisma.user.create({
            data: {
                email: `k6-bidder-${i}-${runId}@example.com`,
                nickName: `k6-bidder-${i}-${runId}`,
                role: 'CUSTOMER',
                cart: { create: {} },
            },
        });
        tokens.push(
            jwt.sign(
                {
                    sub: customer.id,
                    email: customer.email,
                    role: customer.role,
                },
                JWT_SECRET,
                { expiresIn: '1h' },
            ),
        );
    }

    const fixture = {
        auctionId: auction.id,
        startingPrice: 100,
        minBidIncrement: 1,
        tokens,
        baseUrl: process.env.LOAD_BASE_URL || 'http://localhost:3001',
    };
    const outPath = join(__dirname, '.k6-auction-fixture.json');
    writeFileSync(outPath, JSON.stringify(fixture, null, 2));
    console.log(`k6 auction fixture written: ${outPath}`);
    console.log(`auctionId=${auction.id} bidders=${tokens.length}`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
