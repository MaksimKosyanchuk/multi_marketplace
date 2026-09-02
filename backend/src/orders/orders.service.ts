import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
    LedgerEntryType,
    OrderStatus,
    PaymentStatus,
    Prisma,
    ProductStatus,
    ProductType,
    Role,
    SellerOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { RedisService } from '../redis/redis.service';
import { QueryOrderDto } from './dto/query-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

const orderDetails = {
    sellerOrders: {
        include: {
            seller: { select: { id: true, email: true, nickName: true } },
            items: true,
        },
    },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
    constructor(
        private readonly prisma: PrismaService,
        @InjectQueue('orders') private readonly ordersQueue: Queue,
        private readonly logger: LoggerService,
        private readonly redis: RedisService,
    ) {}

    /** Creates all seller sub-orders, stock mutations, ledger entries, and outbox events atomically. */
    async checkout(userId: string, idempotencyKey: string) {
        if (!idempotencyKey?.trim()) {
            throw new BadRequestException('Idempotency-Key header is required');
        }

        const existing = await this.findCheckoutByIdempotencyKey(userId, idempotencyKey);
        if (existing) return existing;

        try {
            const order = await this.prisma.$transaction(async (tx) => {
                const priorPayment = await tx.payment.findUnique({
                    where: { idempotencyKey },
                    include: { order: { include: orderDetails } },
                });
                if (priorPayment) {
                    if (priorPayment.order.userId !== userId) {
                        throw new ForbiddenException('Idempotency key belongs to another user');
                    }
                    return priorPayment.order;
                }

                const cart = await tx.cart.findUnique({ where: { userId } });
                if (!cart) throw new BadRequestException('Cart is empty');

                const cartItems = await tx.cartItem.findMany({
                    where: { cartId: cart.id },
                    include: { product: true },
                    orderBy: { createdAt: 'asc' },
                });
                if (!cartItems.length) throw new BadRequestException('Cart is empty');

                const bySeller = new Map<
                    string,
                    {
                        subtotal: Prisma.Decimal;
                        items: Array<{
                            productId: string;
                            productName: string;
                            quantity: number;
                            unitPrice: Prisma.Decimal;
                            totalAmount: Prisma.Decimal;
                        }>;
                    }
                >();
                let totalAmount = new Prisma.Decimal(0);

                for (const cartItem of cartItems) {
                    const product = cartItem.product;
                    const stockUpdate = await tx.product.updateMany({
                        where: {
                            id: product.id,
                            stock: { gte: cartItem.quantity },
                            status: ProductStatus.ACTIVE,
                            type: ProductType.FIXED_PRICE,
                            isArchived: false,
                        },
                        data: {
                            stock: { decrement: cartItem.quantity },
                            version: { increment: 1 },
                        },
                    });
                    if (!stockUpdate.count) {
                        throw new BadRequestException(
                            `Product "${product.name}" is unavailable or has insufficient stock`,
                        );
                    }

                    const lineTotal = product.price.mul(cartItem.quantity);
                    totalAmount = totalAmount.add(lineTotal);
                    const sellerGroup = bySeller.get(product.sellerId) ?? {
                        subtotal: new Prisma.Decimal(0),
                        items: [],
                    };
                    sellerGroup.subtotal = sellerGroup.subtotal.add(lineTotal);
                    sellerGroup.items.push({
                        productId: product.id,
                        productName: product.name,
                        quantity: cartItem.quantity,
                        unitPrice: product.price,
                        totalAmount: lineTotal,
                    });
                    bySeller.set(product.sellerId, sellerGroup);
                }

                const order = await tx.order.create({
                    data: {
                        userId,
                        status: OrderStatus.NEW,
                        subtotal: totalAmount,
                        totalAmount,
                        payments: {
                            create: {
                                provider: 'mock',
                                status: PaymentStatus.PENDING,
                                amount: totalAmount,
                                idempotencyKey,
                            },
                        },
                        sellerOrders: {
                            create: [...bySeller.entries()].map(([sellerId, group]) => {
                                const commissionRate = new Prisma.Decimal('0.10');
                                const commissionAmount = group.subtotal.mul(commissionRate);
                                const sellerEarnings = group.subtotal.sub(commissionAmount);
                                return {
                                    sellerId,
                                    status: SellerOrderStatus.NEW,
                                    subtotal: group.subtotal,
                                    commissionRate,
                                    commissionAmount,
                                    sellerEarnings,
                                    items: { create: group.items },
                                    ledgerEntries: {
                                        create: [
                                            {
                                                type: LedgerEntryType.PLATFORM_COMMISSION,
                                                amount: commissionAmount,
                                                idempotencyKey: `${idempotencyKey}:commission:${sellerId}`,
                                            },
                                            {
                                                type: LedgerEntryType.SELLER_EARNING,
                                                amount: sellerEarnings,
                                                idempotencyKey: `${idempotencyKey}:earning:${sellerId}`,
                                            },
                                        ],
                                    },
                                };
                            }),
                        },
                    },
                    include: orderDetails,
                });

                await tx.outboxEvent.createMany({
                    data: [
                        {
                            orderId: order.id,
                            aggregateType: 'Order',
                            aggregateId: order.id,
                            type: 'order.created',
                            payload: { userId, sellerCount: order.sellerOrders.length },
                            idempotencyKey: `${idempotencyKey}:order-created`,
                        },
                        ...order.sellerOrders.map((sellerOrder) => ({
                            orderId: order.id,
                            sellerOrderId: sellerOrder.id,
                            aggregateType: 'SellerOrder',
                            aggregateId: sellerOrder.id,
                            type: 'seller-order.created',
                            payload: {
                                sellerId: sellerOrder.sellerId,
                                itemCount: sellerOrder.items.length,
                            },
                            idempotencyKey: `${idempotencyKey}:seller-order:${sellerOrder.id}`,
                        })),
                    ],
                });

                await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
                return order;
            });

            await this.redis.delByPattern('products:list:*');
            await this.logger.log(OrdersService.name, `Order created: ${order.id}`, {
                userId,
                totalAmount: order.totalAmount.toString(),
            });
            return order;
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const existingOrder = await this.findCheckoutByIdempotencyKey(userId, idempotencyKey);
                if (existingOrder) return existingOrder;
            }
            throw error;
        }
    }

    async payOrder(userId: string, orderId: string) {
        const order = await this.prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new NotFoundException('Order not found');
        if (order.userId !== userId) throw new ForbiddenException('You do not have access to this order');
        if (order.status !== OrderStatus.NEW) {
            throw new BadRequestException(`Order cannot be paid in status ${order.status}`);
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            await tx.payment.updateMany({
                where: { orderId, status: PaymentStatus.PENDING },
                data: { status: PaymentStatus.PAID, paidAt: new Date() },
            });
            await tx.sellerOrder.updateMany({
                where: { orderId, status: SellerOrderStatus.NEW },
                data: { status: SellerOrderStatus.PROCESSING },
            });
            return tx.order.update({
                where: { id: orderId },
                data: { status: OrderStatus.PROCESSING },
                include: orderDetails,
            });
        });
        await this.ordersQueue.add('process-order', { orderId });
        return updated;
    }

    async cancelOrder(userId: string, orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: orderDetails,
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.userId !== userId) throw new ForbiddenException('You do not have access to this order');
        if (
            order.status === OrderStatus.PAYMENT_PENDING ||
            order.status === OrderStatus.COMPLETED ||
            order.status === OrderStatus.CANCELLED
        ) {
            throw new BadRequestException(`Order cannot be cancelled in status ${order.status}`);
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            for (const sellerOrder of order.sellerOrders) {
                if (sellerOrder.status === SellerOrderStatus.CANCELLED) continue;
                for (const item of sellerOrder.items) {
                    await tx.product.update({
                        where: { id: item.productId },
                        data: { stock: { increment: item.quantity } },
                    });
                }
                await tx.sellerOrder.update({
                    where: { id: sellerOrder.id },
                    data: {
                        status: SellerOrderStatus.CANCELLED,
                        cancelledAt: new Date(),
                        cancellationReason: 'Cancelled by customer',
                    },
                });
            }
            return tx.order.update({
                where: { id: orderId },
                data: { status: OrderStatus.CANCELLED },
                include: orderDetails,
            });
        });
        await this.redis.delByPattern('products:list:*');
        return updated;
    }

    findMyOrders(userId: string) {
        return this.prisma.order.findMany({
            where: { userId },
            include: orderDetails,
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(userId: string, userRole: Role, orderId: string) {
        const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: orderDetails });
        if (!order) throw new NotFoundException('Order not found');
        const allowed = userRole === Role.ADMIN || order.userId === userId ||
            (userRole === Role.SELLER && order.sellerOrders.some((sellerOrder) => sellerOrder.sellerId === userId));
        if (!allowed) throw new ForbiddenException('You do not have access to this order');
        return order;
    }

    async findAll(query: QueryOrderDto) {
        const { status, page, limit } = query;
        const where: Prisma.OrderWhereInput = { ...(status && { status }) };
        const [items, total] = await this.prisma.$transaction([
            this.prisma.order.findMany({
                where,
                include: { ...orderDetails, user: { select: { id: true, email: true, nickName: true } } },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.order.count({ where }),
        ]);
        return { items, meta: { total, page, limit, pageCount: Math.ceil(total / limit) } };
    }

    async updateStatus(_orderId: string, _dto: UpdateOrderStatusDto) {
        throw new BadRequestException('Parent order status is derived from seller-order statuses and cannot be edited directly');
    }

    private async findCheckoutByIdempotencyKey(userId: string, idempotencyKey: string) {
        const payment = await this.prisma.payment.findUnique({
            where: { idempotencyKey },
            include: { order: { include: orderDetails } },
        });
        if (!payment) return null;
        if (payment.order.userId !== userId) {
            throw new ForbiddenException('Idempotency key belongs to another user');
        }
        return payment.order;
    }
}
