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
import { UpdateSellerOrderStatusDto } from './dto/update-seller-order-status.dto';
import { MockPaymentService } from '../payments/mock-payment.service';
import { getCorrelationId } from '../common/correlation/correlation.context';

const orderDetails = {
    sellerOrders: {
        include: {
            seller: { select: { id: true, email: true, nickName: true } },
            items: true,
        },
    },
} satisfies Prisma.OrderInclude;

const sellerOrderDetails = {
    order: true,
    items: true,
    seller: { select: { id: true, email: true, nickName: true } },
} satisfies Prisma.SellerOrderInclude;

export function deriveOrderStatus(statuses: SellerOrderStatus[]): OrderStatus {
    if (
        !statuses.length ||
        statuses.every((status) => status === SellerOrderStatus.NEW)
    ) {
        return OrderStatus.NEW;
    }
    if (statuses.every((status) => status === SellerOrderStatus.CANCELLED)) {
        return OrderStatus.CANCELLED;
    }
    if (statuses.some((status) => status === SellerOrderStatus.CANCELLED)) {
        return OrderStatus.PARTIALLY_CANCELLED;
    }
    if (
        statuses.every((status) => status === SellerOrderStatus.PAYMENT_PENDING)
    ) {
        return OrderStatus.PAYMENT_PENDING;
    }
    if (statuses.every((status) => status === SellerOrderStatus.COMPLETED)) {
        return OrderStatus.COMPLETED;
    }
    if (statuses.some((status) => status === SellerOrderStatus.COMPLETED)) {
        return OrderStatus.PARTIALLY_COMPLETED;
    }
    if (statuses.every((status) => status === SellerOrderStatus.SHIPPED)) {
        return OrderStatus.SHIPPED;
    }
    if (statuses.some((status) => status === SellerOrderStatus.SHIPPED)) {
        return OrderStatus.PARTIALLY_SHIPPED;
    }
    if (statuses.some((status) => status === SellerOrderStatus.PROCESSING)) {
        return OrderStatus.PROCESSING;
    }
    return OrderStatus.NEW;
}

@Injectable()
export class OrdersService {
    constructor(
        private readonly prisma: PrismaService,
        @InjectQueue('orders') private readonly ordersQueue: Queue,
        private readonly logger: LoggerService,
        private readonly redis: RedisService,
        private readonly mockPayment: MockPaymentService,
    ) {}

    /** Creates all seller sub-orders, stock mutations, ledger entries, and outbox events atomically. */
    async checkout(userId: string, idempotencyKey: string) {
        if (!idempotencyKey?.trim()) {
            throw new BadRequestException('Idempotency-Key header is required');
        }

        const existing = await this.findCheckoutByIdempotencyKey(
            userId,
            idempotencyKey,
        );
        if (existing) return existing;

        try {
            const order = await this.prisma.$transaction(async (tx) => {
                const priorPayment = await tx.payment.findUnique({
                    where: { idempotencyKey },
                    include: { order: { include: orderDetails } },
                });
                if (priorPayment) {
                    if (priorPayment.order.userId !== userId) {
                        throw new ForbiddenException(
                            'Idempotency key belongs to another user',
                        );
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
                if (!cartItems.length)
                    throw new BadRequestException('Cart is empty');

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
                    await tx.outboxEvent.create({
                        data: {
                            aggregateType: 'Product',
                            aggregateId: product.id,
                            type: 'product.stock-changed',
                            payload: {
                                productId: product.id,
                                quantity: -cartItem.quantity,
                            },
                            idempotencyKey: `${idempotencyKey}:stock:${product.id}`,
                        },
                    });

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
                        status: OrderStatus.PAYMENT_PENDING,
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
                            create: [...bySeller.entries()].map(
                                ([sellerId, group]) => {
                                    const commissionRate = new Prisma.Decimal(
                                        '0.10',
                                    );
                                    const commissionAmount =
                                        group.subtotal.mul(commissionRate);
                                    const sellerEarnings =
                                        group.subtotal.sub(commissionAmount);
                                    return {
                                        sellerId,
                                        status: SellerOrderStatus.PAYMENT_PENDING,
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
                                },
                            ),
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
                            payload: {
                                userId,
                                sellerCount: order.sellerOrders.length,
                            },
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
            await this.logger.log(
                OrdersService.name,
                `Order created: ${order.id}`,
                {
                    userId,
                    totalAmount: order.totalAmount.toString(),
                },
            );
            return order;
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const existingOrder = await this.findCheckoutByIdempotencyKey(
                    userId,
                    idempotencyKey,
                );
                if (existingOrder) return existingOrder;
            }
            throw error;
        }
    }

    async payOrder(userId: string, orderId: string, idempotencyKey: string) {
        if (!idempotencyKey?.trim()) {
            throw new BadRequestException('Idempotency-Key header is required');
        }
        const eventKey = `payment-paid:${idempotencyKey}`;
        const existing = await this.prisma.outboxEvent.findUnique({
            where: { idempotencyKey: eventKey },
            include: { order: { include: orderDetails } },
        });
        if (existing?.order) {
            if (existing.order.userId !== userId) {
                throw new ForbiddenException(
                    'Idempotency key belongs to another user',
                );
            }
            return existing.order;
        }

        try {
            const updated = await this.prisma.$transaction(async (tx) => {
                const order = await tx.order.findUnique({
                    where: { id: orderId },
                    include: { payments: true },
                });
                if (!order) throw new NotFoundException('Order not found');
                if (order.userId !== userId) {
                    throw new ForbiddenException(
                        'You do not have access to this order',
                    );
                }
                if (
                    order.status !== OrderStatus.PAYMENT_PENDING &&
                    order.status !== OrderStatus.NEW
                ) {
                    throw new BadRequestException(
                        `Order cannot be paid in status ${order.status}`,
                    );
                }
                const payment = order.payments.find(
                    ({ status }) => status === PaymentStatus.PENDING,
                );
                if (!payment)
                    throw new BadRequestException('Payment is not pending');
                const charge = this.mockPayment.charge(
                    payment.id,
                    payment.amount,
                );
                await tx.payment.update({
                    where: { id: payment.id },
                    data: {
                        status: PaymentStatus.PAID,
                        providerRef: charge.providerRef,
                        paidAt: new Date(),
                    },
                });
                await tx.ledgerEntry.create({
                    data: {
                        paymentId: payment.id,
                        type: LedgerEntryType.CUSTOMER_CHARGE,
                        amount: charge.amount,
                        idempotencyKey: `${idempotencyKey}:charge-ledger`,
                    },
                });
                await tx.sellerOrder.updateMany({
                    where: {
                        orderId,
                        status: {
                            in: [
                                SellerOrderStatus.PAYMENT_PENDING,
                                SellerOrderStatus.NEW,
                            ],
                        },
                    },
                    data: { status: SellerOrderStatus.PROCESSING },
                });
                const result = await tx.order.update({
                    where: { id: orderId },
                    data: { status: OrderStatus.PROCESSING },
                    include: orderDetails,
                });
                await tx.outboxEvent.create({
                    data: {
                        orderId,
                        aggregateType: 'Payment',
                        aggregateId: payment.id,
                        type: 'payment.paid',
                        payload: {
                            orderId,
                            amount: charge.amount.toString(),
                            correlationId: getCorrelationId(),
                        },
                        idempotencyKey: eventKey,
                    },
                });
                return result;
            });
            await this.ordersQueue.add('process-order', { orderId });
            return updated;
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const retry = await this.prisma.outboxEvent.findUnique({
                    where: { idempotencyKey: eventKey },
                    include: { order: { include: orderDetails } },
                });
                if (retry?.order) return retry.order;
            }
            throw error;
        }
    }

    async cancelPayment(
        userId: string,
        orderId: string,
        idempotencyKey: string,
    ) {
        if (!idempotencyKey?.trim()) {
            throw new BadRequestException('Idempotency-Key header is required');
        }
        const eventKey = `payment-cancelled:${idempotencyKey}`;
        const existing = await this.prisma.outboxEvent.findUnique({
            where: { idempotencyKey: eventKey },
            include: { order: { include: orderDetails } },
        });
        if (existing?.order) return existing.order;

        try {
            const result = await this.prisma.$transaction(async (tx) => {
                const order = await tx.order.findUnique({
                    where: { id: orderId },
                    include: {
                        payments: true,
                        sellerOrders: { include: { items: true } },
                    },
                });
                if (!order) throw new NotFoundException('Order not found');
                if (order.userId !== userId) {
                    throw new ForbiddenException(
                        'You do not have access to this order',
                    );
                }
                const payment = order.payments.find(
                    ({ status }) => status === PaymentStatus.PENDING,
                );
                if (!payment)
                    throw new BadRequestException(
                        'Only pending payments can be cancelled',
                    );
                const cancellation = this.mockPayment.cancel(payment.id);
                await tx.payment.update({
                    where: { id: payment.id },
                    data: {
                        status: PaymentStatus.CANCELLED,
                        providerRef: cancellation.providerRef,
                    },
                });
                for (const sellerOrder of order.sellerOrders) {
                    if (sellerOrder.status === SellerOrderStatus.CANCELLED)
                        continue;
                    const claimed = await tx.sellerOrder.updateMany({
                        where: {
                            id: sellerOrder.id,
                            status: {
                                in: [
                                    SellerOrderStatus.PAYMENT_PENDING,
                                    SellerOrderStatus.NEW,
                                ],
                            },
                        },
                        data: {
                            status: SellerOrderStatus.CANCELLED,
                            cancelledAt: new Date(),
                            cancellationReason: 'Payment cancelled',
                        },
                    });
                    if (!claimed.count) continue;
                    await tx.ledgerEntry.createMany({
                        data: [
                            {
                                sellerOrderId: sellerOrder.id,
                                type: LedgerEntryType.ADJUSTMENT,
                                amount: sellerOrder.commissionAmount.neg(),
                                idempotencyKey: `${eventKey}:commission:${sellerOrder.id}`,
                            },
                            {
                                sellerOrderId: sellerOrder.id,
                                type: LedgerEntryType.ADJUSTMENT,
                                amount: sellerOrder.sellerEarnings.neg(),
                                idempotencyKey: `${eventKey}:earnings:${sellerOrder.id}`,
                            },
                        ],
                    });
                    await tx.outboxEvent.create({
                        data: {
                            orderId,
                            sellerOrderId: sellerOrder.id,
                            aggregateType: 'SellerOrder',
                            aggregateId: sellerOrder.id,
                            type: 'seller-order.cancelled',
                            payload: {
                                sellerId: sellerOrder.sellerId,
                                reason: 'Payment cancelled',
                            },
                            idempotencyKey: `${eventKey}:seller-order:${sellerOrder.id}`,
                        },
                    });
                    for (const item of sellerOrder.items) {
                        await tx.product.update({
                            where: { id: item.productId },
                            data: {
                                stock: { increment: item.quantity },
                                version: { increment: 1 },
                            },
                        });
                        await tx.outboxEvent.create({
                            data: {
                                orderId,
                                aggregateType: 'Product',
                                aggregateId: item.productId,
                                type: 'product.stock-changed',
                                payload: {
                                    productId: item.productId,
                                    quantity: item.quantity,
                                },
                                idempotencyKey: `${eventKey}:stock:${item.productId}`,
                            },
                        });
                    }
                }
                const result = await tx.order.update({
                    where: { id: orderId },
                    data: { status: OrderStatus.CANCELLED },
                    include: orderDetails,
                });
                await tx.outboxEvent.create({
                    data: {
                        orderId,
                        aggregateType: 'Payment',
                        aggregateId: payment.id,
                        type: 'payment.cancelled',
                        payload: {
                            orderId,
                            providerRef: cancellation.providerRef,
                        },
                        idempotencyKey: eventKey,
                    },
                });
                return result;
            });
            return result;
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const retry = await this.prisma.outboxEvent.findUnique({
                    where: { idempotencyKey: eventKey },
                    include: { order: { include: orderDetails } },
                });
                if (retry?.order) return retry.order;
            }
            throw error;
        }
    }

    async cancelOrder(userId: string, orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.userId !== userId)
            throw new ForbiddenException(
                'You do not have access to this order',
            );
        const updated = await this.prisma.$transaction(async (tx) => {
            const currentOrder = await tx.order.findUnique({
                where: { id: orderId },
                include: {
                    ...orderDetails,
                    payments: true,
                },
            });
            if (!currentOrder) throw new NotFoundException('Order not found');
            if (currentOrder.userId !== userId) {
                throw new ForbiddenException(
                    'You do not have access to this order',
                );
            }
            if (
                currentOrder.status === OrderStatus.COMPLETED ||
                currentOrder.status === OrderStatus.CANCELLED
            ) {
                throw new BadRequestException(
                    `Order cannot be cancelled in status ${currentOrder.status}`,
                );
            }

            const payment = currentOrder.payments.find(
                ({ status }) =>
                    status === PaymentStatus.PAID ||
                    status === PaymentStatus.PARTIALLY_REFUNDED,
            );
            const pendingPayment = currentOrder.payments.find(
                ({ status }) => status === PaymentStatus.PENDING,
            );
            const now = new Date();
            for (const sellerOrder of currentOrder.sellerOrders) {
                if (sellerOrder.status === SellerOrderStatus.CANCELLED)
                    continue;
                if (sellerOrder.status !== SellerOrderStatus.PROCESSING) {
                    throw new BadRequestException(
                        `Seller order cannot be cancelled in status ${sellerOrder.status}`,
                    );
                }

                const claimed = await tx.sellerOrder.updateMany({
                    where: {
                        id: sellerOrder.id,
                        status: {
                            in: [SellerOrderStatus.PROCESSING],
                        },
                    },
                    data: {
                        status: SellerOrderStatus.CANCELLED,
                        cancelledAt: now,
                        cancellationReason: 'Cancelled by customer',
                    },
                });
                if (!claimed.count) {
                    throw new BadRequestException(
                        'Order cancellation was already processed',
                    );
                }

                let refundTotal = new Prisma.Decimal(0);
                let commissionReduction = new Prisma.Decimal(0);
                for (const item of sellerOrder.items) {
                    const alreadyRefunded = await tx.refund.aggregate({
                        where: {
                            orderItemId: item.id,
                            status: {
                                in: ['PENDING', 'APPROVED', 'PROCESSED'],
                            },
                        },
                        _sum: { quantity: true },
                    });
                    const refundableQuantity = Math.max(
                        item.quantity - (alreadyRefunded._sum.quantity ?? 0),
                        0,
                    );
                    if (!refundableQuantity) continue;
                    const refundAmount = item.unitPrice.mul(refundableQuantity);
                    const commission = refundAmount.mul(
                        sellerOrder.commissionRate,
                    );
                    refundTotal = refundTotal.add(refundAmount);
                    commissionReduction = commissionReduction.add(commission);
                    if (payment) {
                        await tx.refund.create({
                            data: {
                                sellerOrderId: sellerOrder.id,
                                orderItemId: item.id,
                                paymentId: payment.id,
                                amount: refundAmount,
                                quantity: refundableQuantity,
                                reason: 'Cancelled by customer',
                                status: 'PROCESSED',
                                idempotencyKey: `customer-cancel:${orderId}:${item.id}`,
                                processedAt: now,
                                ledgerEntries: {
                                    create: {
                                        type: LedgerEntryType.REFUND,
                                        amount: refundAmount.neg(),
                                        idempotencyKey: `customer-cancel:${orderId}:refund-ledger:${item.id}`,
                                    },
                                },
                            },
                        });
                    }
                    await tx.product.update({
                        where: { id: item.productId },
                        data: {
                            stock: { increment: refundableQuantity },
                            version: { increment: 1 },
                        },
                    });
                    await tx.outboxEvent.create({
                        data: {
                            aggregateType: 'Product',
                            aggregateId: item.productId,
                            type: 'product.stock-changed',
                            payload: {
                                productId: item.productId,
                                quantity: item.quantity,
                            },
                            idempotencyKey: `customer-cancel:${orderId}:stock:${item.productId}`,
                        },
                    });
                }
                await tx.sellerOrder.update({
                    where: { id: sellerOrder.id },
                    data: {
                        refundedAmount: {
                            increment: payment ? refundTotal : 0,
                        },
                        commissionAmount: { decrement: commissionReduction },
                        sellerEarnings: {
                            decrement: refundTotal.sub(commissionReduction),
                        },
                    },
                });
                await tx.ledgerEntry.createMany({
                    data: [
                        {
                            sellerOrderId: sellerOrder.id,
                            type: LedgerEntryType.ADJUSTMENT,
                            amount: commissionReduction.neg(),
                            idempotencyKey: `customer-cancel:${orderId}:commission:${sellerOrder.id}`,
                        },
                        {
                            sellerOrderId: sellerOrder.id,
                            type: LedgerEntryType.ADJUSTMENT,
                            amount: refundTotal.sub(commissionReduction).neg(),
                            idempotencyKey: `customer-cancel:${orderId}:earnings:${sellerOrder.id}`,
                        },
                    ],
                });
            }
            if (payment) {
                const refunded = await tx.refund.aggregate({
                    where: { paymentId: payment.id, status: 'PROCESSED' },
                    _sum: { amount: true },
                });
                await tx.payment.update({
                    where: { id: payment.id },
                    data: {
                        status: (
                            refunded._sum.amount ?? new Prisma.Decimal(0)
                        ).gte(payment.amount)
                            ? PaymentStatus.REFUNDED
                            : PaymentStatus.PARTIALLY_REFUNDED,
                    },
                });
            }
            if (pendingPayment) {
                const cancellation = this.mockPayment.cancel(pendingPayment.id);
                await tx.payment.update({
                    where: { id: pendingPayment.id },
                    data: {
                        status: PaymentStatus.CANCELLED,
                        providerRef: cancellation.providerRef,
                    },
                });
            }
            const statuses = await tx.sellerOrder.findMany({
                where: { orderId },
                select: { status: true },
            });
            const nextStatus = deriveOrderStatus(
                statuses.map(({ status }) => status),
            );
            const result = await tx.order.update({
                where: { id: orderId },
                data: { status: nextStatus },
                include: orderDetails,
            });
            await tx.outboxEvent.createMany({
                data: [
                    ...currentOrder.sellerOrders
                        .filter(
                            ({ status }) =>
                                status !== SellerOrderStatus.CANCELLED,
                        )
                        .map((sellerOrder) => ({
                            orderId,
                            sellerOrderId: sellerOrder.id,
                            aggregateType: 'SellerOrder',
                            aggregateId: sellerOrder.id,
                            type: 'seller-order.cancelled',
                            payload: {
                                sellerId: sellerOrder.sellerId,
                                reason: 'Cancelled by customer',
                            },
                            idempotencyKey: `customer-cancel:${orderId}:seller-order:${sellerOrder.id}`,
                        })),
                    {
                        orderId,
                        aggregateType: 'Order',
                        aggregateId: orderId,
                        type: 'order.cancelled',
                        payload: {
                            userId,
                            status: result.status,
                            correlationId: getCorrelationId(),
                        },
                        idempotencyKey: `customer-cancel:${orderId}`,
                    },
                ],
            });
            return result;
        });
        await this.redis.delByPattern('products:list:*');
        return updated;
    }

    async cancelSellerOrder(
        sellerId: string,
        sellerOrderId: string,
        idempotencyKey: string,
        reason = 'Cancelled by seller',
    ) {
        if (!idempotencyKey?.trim()) {
            throw new BadRequestException('Idempotency-Key header is required');
        }
        const eventKey = `seller-order-cancel:${idempotencyKey}`;
        const existing = await this.prisma.outboxEvent.findUnique({
            where: { idempotencyKey: eventKey },
            include: { sellerOrder: { include: sellerOrderDetails } },
        });
        if (existing?.sellerOrder) return existing.sellerOrder;

        try {
            const result = await this.prisma.$transaction(async (tx) => {
                const sellerOrder = await tx.sellerOrder.findUnique({
                    where: { id: sellerOrderId },
                    include: {
                        order: { include: { payments: true } },
                        items: true,
                    },
                });
                if (!sellerOrder)
                    throw new NotFoundException('Seller order not found');
                if (sellerOrder.sellerId !== sellerId) {
                    throw new ForbiddenException(
                        'You do not have access to this seller order',
                    );
                }
                if (sellerOrder.status !== SellerOrderStatus.PROCESSING) {
                    throw new BadRequestException(
                        `Seller order cannot be cancelled in status ${sellerOrder.status}`,
                    );
                }
                const claimed = await tx.sellerOrder.updateMany({
                    where: {
                        id: sellerOrderId,
                        status: {
                            in: [SellerOrderStatus.PROCESSING],
                        },
                    },
                    data: {
                        status: SellerOrderStatus.CANCELLED,
                        cancelledAt: new Date(),
                        cancellationReason:
                            reason.trim() || 'Cancelled by seller',
                    },
                });
                if (!claimed.count) {
                    throw new BadRequestException(
                        'Order cancellation was already processed',
                    );
                }

                const payment = sellerOrder.order.payments.find(
                    ({ status }) =>
                        status === PaymentStatus.PAID ||
                        status === PaymentStatus.PARTIALLY_REFUNDED,
                );
                const now = new Date();
                let refundTotal = new Prisma.Decimal(0);
                let commissionReduction = new Prisma.Decimal(0);
                for (const item of sellerOrder.items) {
                    const alreadyRefunded = await tx.refund.aggregate({
                        where: {
                            orderItemId: item.id,
                            status: {
                                in: ['PENDING', 'APPROVED', 'PROCESSED'],
                            },
                        },
                        _sum: { quantity: true },
                    });
                    const refundableQuantity = Math.max(
                        item.quantity - (alreadyRefunded._sum.quantity ?? 0),
                        0,
                    );
                    if (!refundableQuantity) continue;
                    const refundAmount = item.unitPrice.mul(refundableQuantity);
                    const commission = refundAmount.mul(
                        sellerOrder.commissionRate,
                    );
                    refundTotal = refundTotal.add(refundAmount);
                    commissionReduction = commissionReduction.add(commission);
                    if (payment) {
                        await tx.refund.create({
                            data: {
                                sellerOrderId,
                                orderItemId: item.id,
                                paymentId: payment.id,
                                amount: refundAmount,
                                quantity: refundableQuantity,
                                reason: reason.trim() || 'Cancelled by seller',
                                status: 'PROCESSED' as const,
                                idempotencyKey: `${idempotencyKey}:refund:${item.id}`,
                                processedAt: now,
                                ledgerEntries: {
                                    create: {
                                        type: LedgerEntryType.REFUND,
                                        amount: refundAmount.neg(),
                                        idempotencyKey: `${idempotencyKey}:refund-ledger:${item.id}`,
                                    },
                                },
                            },
                        });
                    }
                    await tx.product.update({
                        where: { id: item.productId },
                        data: {
                            stock: { increment: refundableQuantity },
                            version: { increment: 1 },
                        },
                    });
                    await tx.outboxEvent.create({
                        data: {
                            orderId: sellerOrder.orderId,
                            sellerOrderId: sellerOrder.id,
                            aggregateType: 'Product',
                            aggregateId: item.productId,
                            type: 'product.stock-changed',
                            payload: {
                                productId: item.productId,
                                quantity: refundableQuantity,
                            },
                            idempotencyKey: `${eventKey}:stock:${item.productId}`,
                        },
                    });
                }

                const updatedSellerOrder = await tx.sellerOrder.update({
                    where: { id: sellerOrderId },
                    data: {
                        status: SellerOrderStatus.CANCELLED,
                        cancelledAt: now,
                        cancellationReason:
                            reason.trim() || 'Cancelled by seller',
                        refundedAmount: {
                            increment: payment ? refundTotal : 0,
                        },
                        commissionAmount: { decrement: commissionReduction },
                        sellerEarnings: {
                            decrement: refundTotal.sub(commissionReduction),
                        },
                    },
                    include: sellerOrderDetails,
                });
                const siblingStatuses = await tx.sellerOrder.findMany({
                    where: { orderId: sellerOrder.orderId },
                    select: { status: true },
                });
                const nextOrderStatus = deriveOrderStatus(
                    siblingStatuses.map(({ status }) => status),
                );
                const order = await tx.order.update({
                    where: { id: sellerOrder.orderId },
                    data: { status: nextOrderStatus },
                    include: orderDetails,
                });
                if (payment) {
                    const refunded = await tx.refund.aggregate({
                        where: { paymentId: payment.id, status: 'PROCESSED' },
                        _sum: { amount: true },
                    });
                    const totalRefunded =
                        refunded._sum.amount ?? new Prisma.Decimal(0);
                    await tx.payment.update({
                        where: { id: payment.id },
                        data: {
                            status: totalRefunded.gte(payment.amount)
                                ? PaymentStatus.REFUNDED
                                : PaymentStatus.PARTIALLY_REFUNDED,
                        },
                    });
                }
                await tx.ledgerEntry.createMany({
                    data: [
                        {
                            sellerOrderId,
                            type: LedgerEntryType.ADJUSTMENT,
                            amount: commissionReduction.neg(),
                            idempotencyKey: `${idempotencyKey}:commission-adjustment`,
                        },
                        {
                            sellerOrderId,
                            type: LedgerEntryType.ADJUSTMENT,
                            amount: refundTotal.sub(commissionReduction).neg(),
                            idempotencyKey: `${idempotencyKey}:earnings-adjustment`,
                        },
                    ],
                });
                await tx.outboxEvent.createMany({
                    data: [
                        {
                            orderId: order.id,
                            sellerOrderId,
                            aggregateType: 'SellerOrder',
                            aggregateId: sellerOrderId,
                            type: 'seller-order.cancelled',
                            payload: {
                                sellerId,
                                reason,
                                refundAmount: refundTotal.toString(),
                            },
                            idempotencyKey: eventKey,
                        },
                        {
                            orderId: order.id,
                            aggregateType: 'Order',
                            aggregateId: order.id,
                            type: 'order.status-changed',
                            payload: {
                                status: order.status,
                                correlationId: getCorrelationId(),
                            },
                            idempotencyKey: `${eventKey}:order-status`,
                        },
                    ],
                });
                return { sellerOrder: updatedSellerOrder, order };
            });
            await this.redis.delByPattern('products:list:*');
            const event = await this.prisma.outboxEvent.findUnique({
                where: { idempotencyKey: eventKey },
                select: { id: true },
            });
            if (event)
                await this.ordersQueue.add(
                    'deliver-outbox-event',
                    { outboxEventId: event.id },
                    {
                        attempts: 5,
                        backoff: { type: 'exponential', delay: 1000 },
                    },
                );
            return result;
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const retry = await this.prisma.outboxEvent.findUnique({
                    where: { idempotencyKey: eventKey },
                    include: { sellerOrder: { include: sellerOrderDetails } },
                });
                if (retry?.sellerOrder) return retry.sellerOrder;
            }
            throw error;
        }
    }

    async refundOrderItem(
        userId: string,
        orderItemId: string,
        quantity: number,
        reason = 'Refund requested',
        idempotencyKey: string,
    ) {
        if (!idempotencyKey?.trim()) {
            throw new BadRequestException('Idempotency-Key header is required');
        }
        const existing = await this.prisma.refund.findUnique({
            where: { idempotencyKey },
            include: { orderItem: true },
        });
        if (existing) {
            if (existing.orderItemId !== orderItemId) {
                throw new ForbiddenException(
                    'Idempotency key belongs to another refund',
                );
            }
            return existing;
        }
        if (!Number.isInteger(quantity) || quantity < 1) {
            throw new BadRequestException(
                'Refund quantity must be a positive integer',
            );
        }

        try {
            const result = await this.prisma.$transaction(async (tx) => {
                const item = await tx.orderItem.findUnique({
                    where: { id: orderItemId },
                    include: {
                        sellerOrder: {
                            include: {
                                order: { include: { payments: true } },
                                items: true,
                            },
                        },
                    },
                });
                if (!item) throw new NotFoundException('Order item not found');
                if (item.sellerOrder.order.userId !== userId) {
                    throw new ForbiddenException(
                        'You do not have access to this order item',
                    );
                }
                if (
                    item.sellerOrder.status === SellerOrderStatus.NEW ||
                    item.sellerOrder.status === SellerOrderStatus.CANCELLED
                ) {
                    throw new BadRequestException(
                        'Order item cannot be refunded in the current status',
                    );
                }
                const refunded = await tx.refund.aggregate({
                    where: {
                        orderItemId,
                        status: { in: ['PENDING', 'APPROVED', 'PROCESSED'] },
                    },
                    _sum: { quantity: true },
                });
                const refundedQuantity = refunded._sum.quantity ?? 0;
                if (refundedQuantity + quantity > item.quantity) {
                    throw new BadRequestException(
                        'Refund quantity exceeds the refundable quantity',
                    );
                }
                const amount = item.unitPrice.mul(quantity);
                const commission = amount.mul(item.sellerOrder.commissionRate);
                const payment = item.sellerOrder.order.payments.find(
                    ({ status }) =>
                        status === PaymentStatus.PAID ||
                        status === PaymentStatus.PARTIALLY_REFUNDED,
                );
                const refund = await tx.refund.create({
                    data: {
                        sellerOrderId: item.sellerOrderId,
                        orderItemId,
                        paymentId: payment?.id,
                        amount,
                        quantity,
                        reason: reason.trim() || 'Refund requested',
                        status: 'PROCESSED',
                        idempotencyKey,
                        processedAt: new Date(),
                        ledgerEntries: {
                            create: {
                                type: LedgerEntryType.REFUND,
                                amount: amount.neg(),
                                idempotencyKey: `${idempotencyKey}:refund-ledger`,
                            },
                        },
                    },
                    include: { orderItem: true },
                });
                const updatedSellerOrder = await tx.sellerOrder.update({
                    where: { id: item.sellerOrderId },
                    data: {
                        refundedAmount: { increment: amount },
                        commissionAmount: { decrement: commission },
                        sellerEarnings: { decrement: amount.sub(commission) },
                    },
                    include: sellerOrderDetails,
                });
                if (item.sellerOrder.status === SellerOrderStatus.PROCESSING) {
                    await tx.product.update({
                        where: { id: item.productId },
                        data: {
                            stock: { increment: quantity },
                            version: { increment: 1 },
                        },
                    });
                }
                if (payment) {
                    const paymentRefunds = await tx.refund.aggregate({
                        where: { paymentId: payment.id, status: 'PROCESSED' },
                        _sum: { amount: true },
                    });
                    const totalRefunded =
                        paymentRefunds._sum.amount ?? new Prisma.Decimal(0);
                    await tx.payment.update({
                        where: { id: payment.id },
                        data: {
                            status: totalRefunded.gte(payment.amount)
                                ? PaymentStatus.REFUNDED
                                : PaymentStatus.PARTIALLY_REFUNDED,
                        },
                    });
                }
                await tx.ledgerEntry.create({
                    data: {
                        sellerOrderId: item.sellerOrderId,
                        type: LedgerEntryType.ADJUSTMENT,
                        amount: commission.neg(),
                        idempotencyKey: `${idempotencyKey}:commission-adjustment`,
                    },
                });
                await tx.ledgerEntry.create({
                    data: {
                        sellerOrderId: item.sellerOrderId,
                        type: LedgerEntryType.ADJUSTMENT,
                        amount: amount.sub(commission).neg(),
                        idempotencyKey: `${idempotencyKey}:earnings-adjustment`,
                    },
                });
                await tx.outboxEvent.create({
                    data: {
                        orderId: item.sellerOrder.orderId,
                        sellerOrderId: item.sellerOrderId,
                        aggregateType: 'SellerOrder',
                        aggregateId: item.sellerOrderId,
                        type: 'seller-order.refunded',
                        payload: {
                            orderItemId,
                            quantity,
                            amount: amount.toString(),
                        },
                        idempotencyKey: `${idempotencyKey}:refund-event`,
                    },
                });
                return { refund, sellerOrder: updatedSellerOrder };
            });
            await this.redis.delByPattern('products:list:*');
            const event = await this.prisma.outboxEvent.findUnique({
                where: { idempotencyKey: `${idempotencyKey}:refund-event` },
                select: { id: true },
            });
            if (event)
                await this.ordersQueue.add(
                    'deliver-outbox-event',
                    { outboxEventId: event.id },
                    {
                        attempts: 5,
                        backoff: { type: 'exponential', delay: 1000 },
                    },
                );
            return result;
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const retry = await this.prisma.refund.findUnique({
                    where: { idempotencyKey },
                    include: { orderItem: true },
                });
                if (retry) return retry;
            }
            throw error;
        }
    }

    findMyOrders(userId: string) {
        return this.prisma.order.findMany({
            where: { userId },
            include: orderDetails,
            orderBy: { createdAt: 'desc' },
        });
    }

    findMySellerOrders(sellerId: string) {
        return this.prisma.sellerOrder.findMany({
            where: { sellerId },
            include: sellerOrderDetails,
            orderBy: { createdAt: 'desc' },
        });
    }

    async findSellerOrder(sellerId: string, sellerOrderId: string) {
        const sellerOrder = await this.prisma.sellerOrder.findUnique({
            where: { id: sellerOrderId },
            include: sellerOrderDetails,
        });
        if (!sellerOrder) throw new NotFoundException('Seller order not found');
        if (sellerOrder.sellerId !== sellerId) {
            throw new ForbiddenException(
                'You do not have access to this seller order',
            );
        }
        return sellerOrder;
    }

    async updateSellerOrderStatus(
        sellerId: string,
        sellerOrderId: string,
        dto: UpdateSellerOrderStatusDto,
    ) {
        const result = await this.prisma.$transaction(async (tx) => {
            const sellerOrder = await tx.sellerOrder.findUnique({
                where: { id: sellerOrderId },
                include: { order: true },
            });
            if (!sellerOrder)
                throw new NotFoundException('Seller order not found');
            if (sellerOrder.sellerId !== sellerId) {
                throw new ForbiddenException(
                    'You do not have access to this seller order',
                );
            }

            this.assertSellerOrderTransition(sellerOrder.status, dto.status);
            if (
                dto.status === SellerOrderStatus.SHIPPED &&
                !dto.trackingNumber?.trim()
            ) {
                throw new BadRequestException(
                    'Tracking number is required when shipping an order',
                );
            }

            const now = new Date();
            const updatedSellerOrder = await tx.sellerOrder.update({
                where: { id: sellerOrderId },
                data: {
                    status: dto.status,
                    ...(dto.status === SellerOrderStatus.SHIPPED && {
                        trackingNumber: dto.trackingNumber!.trim(),
                        shippedAt: now,
                    }),
                    ...(dto.status === SellerOrderStatus.COMPLETED && {
                        completedAt: now,
                    }),
                },
                include: sellerOrderDetails,
            });
            const siblingStatuses = await tx.sellerOrder.findMany({
                where: { orderId: sellerOrder.orderId },
                select: { status: true },
            });
            const nextOrderStatus = deriveOrderStatus(
                siblingStatuses.map(({ status }) => status),
            );
            const parentChanged = sellerOrder.order.status !== nextOrderStatus;
            const order = parentChanged
                ? await tx.order.update({
                      where: { id: sellerOrder.orderId },
                      data: { status: nextOrderStatus },
                  })
                : sellerOrder.order;

            await tx.outboxEvent.createMany({
                data: [
                    {
                        orderId: order.id,
                        sellerOrderId: updatedSellerOrder.id,
                        aggregateType: 'SellerOrder',
                        aggregateId: updatedSellerOrder.id,
                        type: 'seller-order.status-changed',
                        payload: {
                            sellerId,
                            previousStatus: sellerOrder.status,
                            status: updatedSellerOrder.status,
                        },
                        idempotencyKey: `${updatedSellerOrder.id}:status:${sellerOrder.status}:${updatedSellerOrder.status}`,
                    },
                    ...(parentChanged
                        ? [
                              {
                                  orderId: order.id,
                                  aggregateType: 'Order',
                                  aggregateId: order.id,
                                  type: 'order.status-changed',
                                  payload: {
                                      previousStatus: sellerOrder.order.status,
                                      status: order.status,
                                  },
                                  idempotencyKey: `${order.id}:status:${sellerOrder.order.status}:${order.status}`,
                              },
                          ]
                        : []),
                ],
            });
            return { sellerOrder: updatedSellerOrder, order };
        });

        await this.logger.log(
            OrdersService.name,
            `Seller order status changed: ${sellerOrderId}`,
            {
                sellerId,
                status: result.sellerOrder.status,
            },
        );
        return result;
    }

    async findOne(userId: string, userRole: Role, orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: orderDetails,
        });
        if (!order) throw new NotFoundException('Order not found');
        const allowed =
            userRole === Role.ADMIN ||
            order.userId === userId ||
            (userRole === Role.SELLER &&
                order.sellerOrders.some(
                    (sellerOrder) => sellerOrder.sellerId === userId,
                ));
        if (!allowed)
            throw new ForbiddenException(
                'You do not have access to this order',
            );
        return order;
    }

    async findAll(query: QueryOrderDto) {
        const { status, page, limit } = query;
        const where: Prisma.OrderWhereInput = { ...(status && { status }) };
        const [items, total] = await this.prisma.$transaction([
            this.prisma.order.findMany({
                where,
                include: {
                    ...orderDetails,
                    user: { select: { id: true, email: true, nickName: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.order.count({ where }),
        ]);
        return {
            items,
            meta: { total, page, limit, pageCount: Math.ceil(total / limit) },
        };
    }

    private async findCheckoutByIdempotencyKey(
        userId: string,
        idempotencyKey: string,
    ) {
        const payment = await this.prisma.payment.findUnique({
            where: { idempotencyKey },
            include: { order: { include: orderDetails } },
        });
        if (!payment) return null;
        if (payment.order.userId !== userId) {
            throw new ForbiddenException(
                'Idempotency key belongs to another user',
            );
        }
        return payment.order;
    }

    private assertSellerOrderTransition(
        current: SellerOrderStatus,
        next: SellerOrderStatus,
    ) {
        const legalNext: Partial<Record<SellerOrderStatus, SellerOrderStatus>> =
            {
                [SellerOrderStatus.NEW]: SellerOrderStatus.PROCESSING,
                [SellerOrderStatus.PROCESSING]: SellerOrderStatus.SHIPPED,
                [SellerOrderStatus.SHIPPED]: SellerOrderStatus.COMPLETED,
            };
        if (legalNext[current] !== next) {
            throw new BadRequestException(
                `Cannot change seller order from ${current} to ${next}`,
            );
        }
    }
}
