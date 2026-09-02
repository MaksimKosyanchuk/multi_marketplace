import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface AuthResponseDto {
    accessToken?: string;
    token?: string;
    user?: {
        id: string;
    };
    id?: string;
}

interface CartItemResponseDto {
    productId: string;
    quantity: number;
}

interface CartResponseDto {
    items?: CartItemResponseDto[];
}

interface OrderResponseDto {
    id: string;
    items?: unknown[];
}

describe('Order Creation Flow (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let userToken: string;
    let testCategoryId: string;
    let testProductId: string;

    const INITIAL_STOCK = 10;
    const BUY_QUANTITY = 3;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({ whitelist: true, transform: true }),
        );
        await app.init();

        prisma = app.get<PrismaService>(PrismaService);

        await prisma.orderItem.deleteMany();
        await prisma.order.deleteMany();
        await prisma.cartItem.deleteMany();
        await prisma.product.deleteMany();
        await prisma.category.deleteMany();
        await prisma.user.deleteMany();

        const authRes = await request(app.getHttpServer() as object)
            .post('/auth/register')
            .send({
                email: 'customer@example.com',
                password: 'Password123!',
                nickName: 'Test Customer',
            })
            .expect(201);

        const body = authRes.body as AuthResponseDto;
        userToken = (body.accessToken || body.token) as string;

        const category = await prisma.category.create({
            data: { name: 'E2E Category' },
        });
        testCategoryId = category.id;

        const product = await prisma.product.create({
            data: {
                name: 'E2E Test Smartphone',
                description: 'Test Description',
                price: 500,
                stock: INITIAL_STOCK,
                categoryId: testCategoryId,
            },
        });
        testProductId = product.id;
    });

    afterAll(async () => {
        await prisma.orderItem.deleteMany();
        await prisma.order.deleteMany();
        await prisma.cartItem.deleteMany();
        await prisma.product.deleteMany();
        await prisma.category.deleteMany();
        await prisma.user.deleteMany();
        await app.close();
    });

    it('Критичний флоу: додавання в кошик -> оформлення замовлення -> списування stock', async () => {
        await request(app.getHttpServer() as object)
            .post('/cart/items')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                productId: testProductId,
                quantity: BUY_QUANTITY,
            })
            .expect(201);

        const cartRes = await request(app.getHttpServer() as object)
            .get('/cart')
            .set('Authorization', `Bearer ${userToken}`)
            .expect(200);

        const cartBody = cartRes.body as CartResponseDto;
        const items = cartBody.items ?? [];

        expect(items).toHaveLength(1);
        expect(items[0].productId).toBe(testProductId);
        expect(items[0].quantity).toBe(BUY_QUANTITY);

        const orderRes = await request(app.getHttpServer() as object)
            .post('/orders/checkout')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                shippingAddress: 'Main St 123, Kyiv',
            })
            .expect(201);

        const orderBody = orderRes.body as OrderResponseDto;
        expect(orderBody.id).toBeDefined();
        expect(orderBody.items).toHaveLength(1);

        const cartAfterOrder = await request(app.getHttpServer() as object)
            .get('/cart')
            .set('Authorization', `Bearer ${userToken}`)
            .expect(200);

        const cartAfterBody = cartAfterOrder.body as CartResponseDto;
        expect(cartAfterBody.items || []).toHaveLength(0);

        const updatedProduct = await prisma.product.findUnique({
            where: { id: testProductId },
        });

        const expectedStock = INITIAL_STOCK - BUY_QUANTITY;
        expect(updatedProduct?.stock).toBe(expectedStock);
    });
});
