import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
    LedgerEntryType,
    OrderStatus,
    PaymentStatus,
    Prisma,
    Role,
    SellerOrderStatus,
} from '@prisma/client';
import { LoggerService } from '../logger/logger.service';
import { RedisService } from '../redis/redis.service';
import { QueryOrderDto } from './dto/query-order.dto';
import { UpdateSellerOrderStatusDto } from './dto/update-seller-order-status.dto';
import { MockPaymentService } from '../payments/mock-payment.service';
import { getCorrelationId } from '../common/correlation/correlation.context';
import { OrdersGateway } from './orders.geteway';
import { OrderRepository, OutboxRepository, UnitOfWork } from '../database';
import { MetricsService } from '../metrics/metrics.service';

export function deriveOrderStatus(statuses: SellerOrderStatus[]): OrderStatus {
    if (!statuses.length) {
        return OrderStatus.NEW;
    }
    if (statuses.every((status) => status === SellerOrderStatus.CANCELLED)) {
        return OrderStatus.CANCELLED;
    }
    const statusPriority: Record<SellerOrderStatus, number> = {
        [SellerOrderStatus.NEW]: 1,
        [SellerOrderStatus.PAYMENT_PENDING]: 2,
        [SellerOrderStatus.PROCESSING]: 3,
        [SellerOrderStatus.SHIPPED]: 4,
        [SellerOrderStatus.COMPLETED]: 5,
        [SellerOrderStatus.CANCELLED]: 0,
    };
    const highestActiveStatus = statuses
        .filter((status) => status !== SellerOrderStatus.CANCELLED)
        .sort((left, right) => statusPriority[right] - statusPriority[left])[0];

    return highestActiveStatus === undefined
        ? OrderStatus.CANCELLED
        : highestActiveStatus;
}

@Injectable()
export class OrdersService {
    constructor(
        private readonly unitOfWork: UnitOfWork,
        @InjectQueue('orders') private readonly ordersQueue: Queue,
        private readonly logger: LoggerService,
        private readonly redis: RedisService,
        private readonly mockPayment: MockPaymentService,
        private readonly orderRepository: OrderRepository,
        private readonly outboxRepository: OutboxRepository,
        private readonly metrics: MetricsService,
        @Optional() private readonly ordersGateway?: OrdersGateway,
    ) {}

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
            const order = await this.unitOfWork.run(
                async ({
                    cartRepository,
                    orderRepository,
                    outboxRepository,
                    productRepository,
                }) => {
                    const priorPayment =
                        await orderRepository.findByPaymentIdempotencyKey(
                            idempotencyKey,
                        );
                    if (priorPayment) {
                        if (priorPayment.order.userId !== userId) {
                            throw new ForbiddenException(
                                'Idempotency key belongs to another user',
                            );
                        }
                        return priorPayment.order;
                    }

                    const cart = await cartRepository.findByUserId(userId);
                    if (!cart) throw new BadRequestException('Cart is empty');

                    const cartItems = await cartRepository.findItems(cart.id);
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
                        const stockUpdate =
                            await productRepository.decrementStockForCheckout(
                                product.id,
                                cartItem.quantity,
                            );
                        if (!stockUpdate.count) {
                            throw new BadRequestException(
                                `Product "${product.name}" is unavailable or has insufficient stock`,
                            );
                        }
                        await outboxRepository.create({
                            aggregateType: 'Product',
                            aggregateId: product.id,
                            type: 'product.stock-changed',
                            payload: {
                                productId: product.id,
                                quantity: -cartItem.quantity,
                                correlationId: getCorrelationId(),
                            },
                            idempotencyKey: `${idempotencyKey}:stock:${product.id}`,
                        });

                        const lineTotal = product.price.mul(cartItem.quantity);
                        totalAmount = totalAmount.add(lineTotal);
                        const sellerGroup = bySeller.get(product.sellerId) ?? {
                            subtotal: new Prisma.Decimal(0),
                            items: [],
                        };
                        sellerGroup.subtotal =
                            sellerGroup.subtotal.add(lineTotal);
                        sellerGroup.items.push({
                            productId: product.id,
                            productName: product.name,
                            quantity: cartItem.quantity,
                            unitPrice: product.price,
                            totalAmount: lineTotal,
                        });
                        bySeller.set(product.sellerId, sellerGroup);
                    }

                    const order = await orderRepository.createCheckoutOrder({
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
                                },
                            ),
                        },
                    });

                    await outboxRepository.createMany([
                        {
                            orderId: order.id,
                            aggregateType: 'Order',
                            aggregateId: order.id,
                            type: 'order.created',
                            payload: {
                                userId,
                                sellerCount: order.sellerOrders.length,
                                correlationId: getCorrelationId(),
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
                                correlationId: getCorrelationId(),
                            },
                            idempotencyKey: `${idempotencyKey}:seller-order:${sellerOrder.id}`,
                        })),
                    ]);

                    await cartRepository.clear(cart.id);
                    return order;
                },
            );

            await Promise.all([
                this.redis.delByPattern('products:list:*'),
                this.redis.delByPattern('search:products:*'),
                this.redis.delByPattern('products:detail:*'),
            ]);
            this.logger.log(OrdersService.name, 'Order created', {
                userId,
                totalAmount: order.totalAmount.toString(),
                orderId: order.id,
                operation: 'order.create',
            });
            this.metrics.recordCheckout();
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
        const existing =
            await this.outboxRepository.findByIdempotencyKey(eventKey);
        if (existing?.order) {
            if (existing.order.userId !== userId) {
                throw new ForbiddenException(
                    'Idempotency key belongs to another user',
                );
            }
            return existing.order;
        }

        const pendingOrder = await this.orderRepository.findForPayment(orderId);
        if (!pendingOrder) throw new NotFoundException('Order not found');
        if (pendingOrder.userId !== userId) {
            throw new ForbiddenException(
                'You do not have access to this order',
            );
        }
        if (
            (pendingOrder.status === OrderStatus.NEW ||
                pendingOrder.status === OrderStatus.PAYMENT_PENDING) &&
            pendingOrder.payments.some(
                ({ status }) => status === PaymentStatus.PENDING,
            )
        ) {
            await this.unitOfWork.run(async ({ orderRepository }) => {
                await orderRepository.updateOrderPaymentPending(orderId);
                await orderRepository.updateSellerOrdersPaymentPending(orderId);
            });
            this.ordersGateway?.emitOrderStatusUpdate(
                userId,
                orderId,
                OrderStatus.PAYMENT_PENDING,
            );
            for (const sellerOrder of pendingOrder.sellerOrders) {
                this.ordersGateway?.emitOrderStatusUpdate(
                    sellerOrder.sellerId,
                    orderId,
                    OrderStatus.PAYMENT_PENDING,
                );
            }
            void this.logger.log(OrdersService.name, 'Payment pending', {
                orderId,
                userId,
                operation: 'payment.pending',
            });
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        try {
            const updated = await this.unitOfWork.run(
                async ({ orderRepository, outboxRepository }) => {
                    const order =
                        await orderRepository.findForPaymentProcessing(orderId);
                    if (!order) throw new NotFoundException('Order not found');
                    if (order.userId !== userId) {
                        throw new ForbiddenException(
                            'You do not have access to this order',
                        );
                    }
                    if (
                        order.status !== OrderStatus.PAYMENT_PENDING &&
                        order.status !== OrderStatus.NEW &&
                        order.status !== OrderStatus.PARTIALLY_CANCELLED
                    ) {
                        throw new BadRequestException(
                            `Order cannot be paid in status ${order.status}`,
                        );
                    }
                    const payment = order.payments.find(
                        ({ status }) => status === PaymentStatus.PENDING,
                    );
                    const completedPayment = order.payments.find(
                        ({ status }) =>
                            status === PaymentStatus.PAID ||
                            status === PaymentStatus.PARTIALLY_REFUNDED,
                    );
                    if (!payment && completedPayment) {
                        const sellerOrderStatuses =
                            await orderRepository.findSellerOrderStatuses(
                                orderId,
                            );
                        const derivedStatus = deriveOrderStatus(
                            sellerOrderStatuses.map(({ status }) => status),
                        );
                        return orderRepository.updateOrderStatusWithDetails(
                            orderId,
                            derivedStatus === OrderStatus.PAYMENT_PENDING ||
                                derivedStatus === OrderStatus.NEW
                                ? OrderStatus.PROCESSING
                                : derivedStatus,
                        );
                    }
                    if (!payment) {
                        throw new BadRequestException('Payment is not pending');
                    }
                    const sellerOrdersForPayment =
                        await orderRepository.findSellerOrdersForPayment(
                            orderId,
                        );
                    const payableAmount = sellerOrdersForPayment
                        .filter(
                            ({ status }) =>
                                status !== SellerOrderStatus.CANCELLED,
                        )
                        .reduce(
                            (total, sellerOrder) =>
                                total.add(sellerOrder.subtotal),
                            new Prisma.Decimal(0),
                        );
                    if (payableAmount.isZero()) {
                        throw new BadRequestException(
                            'Order has no payable seller orders',
                        );
                    }
                    const charge = this.mockPayment.charge(
                        payment.id,
                        payableAmount,
                    );
                    await orderRepository.updatePayment(payment.id, {
                        amount: payableAmount,
                        status: PaymentStatus.PAID,
                        providerRef: charge.providerRef,
                        paidAt: new Date(),
                    });
                    await orderRepository.createLedgerEntry({
                        paymentId: payment.id,
                        type: LedgerEntryType.CUSTOMER_CHARGE,
                        amount: charge.amount,
                        idempotencyKey: `${idempotencyKey}:charge-ledger`,
                    });
                    await orderRepository.updateSellerOrdersProcessing(orderId);
                    for (const sellerOrder of sellerOrdersForPayment) {
                        if (
                            sellerOrder.status === SellerOrderStatus.CANCELLED
                        ) {
                            continue;
                        }
                        this.logger.log(
                            OrdersService.name,
                            'Seller payment allocated',
                            {
                                orderId,
                                sellerOrderId: sellerOrder.id,
                                sellerId: sellerOrder.sellerId,
                                amount: sellerOrder.subtotal.toString(),
                                operation: 'payment.success',
                            },
                        );
                    }
                    const updatedSellerOrderStatuses =
                        await orderRepository.findSellerOrderStatuses(orderId);
                    if (
                        updatedSellerOrderStatuses.every(
                            ({ status }) =>
                                status === SellerOrderStatus.CANCELLED,
                        )
                    ) {
                        throw new BadRequestException(
                            'Order has no payable seller orders',
                        );
                    }
                    const aggregateStatus = deriveOrderStatus(
                        updatedSellerOrderStatuses.map(({ status }) => status),
                    );
                    const result =
                        await orderRepository.updateOrderStatusWithDetails(
                            orderId,
                            aggregateStatus,
                        );
                    await outboxRepository.create({
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
                    });
                    return result;
                },
            );
            await this.ordersQueue.add('process-order', { orderId });
            for (const sellerOrder of updated.sellerOrders) {
                this.ordersGateway?.emitOrderStatusUpdate(
                    sellerOrder.sellerId,
                    updated.id,
                    updated.status,
                );
            }
            return updated;
        } catch (error: unknown) {
            void this.logger.error(OrdersService.name, 'Payment failed', {
                orderId,
                userId,
                operation: 'payment.failure',
                error: error instanceof Error ? error.message : String(error),
            });
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const retry =
                    await this.outboxRepository.findByIdempotencyKey(eventKey);
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
        const existing =
            await this.outboxRepository.findByIdempotencyKey(eventKey);
        if (existing?.order) return existing.order;

        try {
            const result = await this.unitOfWork.run(
                async ({
                    orderRepository,
                    outboxRepository,
                    productRepository,
                }) => {
                    const order =
                        await orderRepository.findOrderForPaymentCancellation(
                            orderId,
                        );
                    if (!order) throw new NotFoundException('Order not found');
                    if (order.userId !== userId) {
                        throw new ForbiddenException(
                            'You do not have access to this order',
                        );
                    }
                    if (order.status === OrderStatus.CANCELLED) {
                        throw new BadRequestException(
                            'Order cancellation was already processed',
                        );
                    }
                    const payment = order.payments.find(
                        ({ status }) => status === PaymentStatus.PENDING,
                    );
                    if (!payment)
                        throw new BadRequestException(
                            'Only pending payments can be cancelled',
                        );
                    if (
                        order.sellerOrders.some(
                            ({ status }) =>
                                status !== SellerOrderStatus.PAYMENT_PENDING &&
                                status !== SellerOrderStatus.NEW &&
                                status !== SellerOrderStatus.CANCELLED,
                        )
                    ) {
                        throw new BadRequestException(
                            'Payment cannot be cancelled after order processing has started',
                        );
                    }
                    const cancellation = this.mockPayment.cancel(payment.id);
                    await orderRepository.updatePayment(payment.id, {
                        status: PaymentStatus.CANCELLED,
                        providerRef: cancellation.providerRef,
                    });
                    for (const sellerOrder of order.sellerOrders) {
                        if (sellerOrder.status === SellerOrderStatus.CANCELLED)
                            continue;
                        const claimed =
                            await orderRepository.claimSellerOrderCancellation(
                                sellerOrder.id,
                                [
                                    SellerOrderStatus.PAYMENT_PENDING,
                                    SellerOrderStatus.NEW,
                                ],
                                'Payment cancelled',
                            );
                        if (!claimed.count) continue;
                        await orderRepository.createLedgerEntries([
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
                        ]);
                        await outboxRepository.create({
                            orderId,
                            sellerOrderId: sellerOrder.id,
                            aggregateType: 'SellerOrder',
                            aggregateId: sellerOrder.id,
                            type: 'seller-order.cancelled',
                            payload: {
                                sellerId: sellerOrder.sellerId,
                                reason: 'Payment cancelled',
                                correlationId: getCorrelationId(),
                            },
                            idempotencyKey: `${eventKey}:seller-order:${sellerOrder.id}`,
                        });
                        for (const item of sellerOrder.items) {
                            await productRepository.incrementStock(
                                item.productId,
                                item.quantity,
                            );
                            await outboxRepository.create({
                                orderId,
                                aggregateType: 'Product',
                                aggregateId: item.productId,
                                type: 'product.stock-changed',
                                payload: {
                                    productId: item.productId,
                                    quantity: item.quantity,
                                    correlationId: getCorrelationId(),
                                },
                                idempotencyKey: `${eventKey}:stock:${item.productId}`,
                            });
                        }
                    }
                    const statuses =
                        await orderRepository.findSellerOrderStatuses(orderId);
                    const result =
                        await orderRepository.updateOrderStatusWithDetails(
                            orderId,
                            deriveOrderStatus(
                                statuses.map(({ status }) => status),
                            ),
                        );
                    await outboxRepository.create({
                        orderId,
                        aggregateType: 'Payment',
                        aggregateId: payment.id,
                        type: 'payment.cancelled',
                        payload: {
                            orderId,
                            providerRef: cancellation.providerRef,
                            correlationId: getCorrelationId(),
                        },
                        idempotencyKey: eventKey,
                    });
                    return result;
                },
            );
            return result;
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const retry =
                    await this.outboxRepository.findByIdempotencyKey(eventKey);
                if (retry?.order) return retry.order;
            }
            throw error;
        }
    }

    async cancelOrder(userId: string, orderId: string) {
        const order = await this.orderRepository.findById(orderId);
        if (!order) throw new NotFoundException('Order not found');
        if (order.userId !== userId)
            throw new ForbiddenException(
                'You do not have access to this order',
            );
        const updated = await this.unitOfWork.run(
            async ({
                orderRepository,
                outboxRepository,
                productRepository,
            }) => {
                const currentOrder =
                    await orderRepository.findOrderForCancellation(orderId);
                if (!currentOrder)
                    throw new NotFoundException('Order not found');
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
                const rootClaim =
                    await orderRepository.claimOrderCancellation(orderId);
                if (!rootClaim.count) {
                    throw new BadRequestException(
                        'Order cancellation was already processed',
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
                    const claimed =
                        await orderRepository.claimSellerOrderCancellation(
                            sellerOrder.id,
                            [
                                SellerOrderStatus.NEW,
                                SellerOrderStatus.PAYMENT_PENDING,
                                SellerOrderStatus.PROCESSING,
                                SellerOrderStatus.SHIPPED,
                            ],
                            'Cancelled by customer',
                        );
                    if (!claimed.count) continue;

                    let refundTotal = new Prisma.Decimal(0);
                    let commissionReduction = new Prisma.Decimal(0);
                    for (const item of sellerOrder.items) {
                        const alreadyRefunded =
                            await orderRepository.sumRefundedQuantity(item.id);
                        const refundableQuantity = Math.max(
                            item.quantity -
                                (alreadyRefunded._sum.quantity ?? 0),
                            0,
                        );
                        if (!refundableQuantity) continue;
                        const refundAmount =
                            item.unitPrice.mul(refundableQuantity);
                        const commission = refundAmount.mul(
                            sellerOrder.commissionRate,
                        );
                        refundTotal = refundTotal.add(refundAmount);
                        commissionReduction =
                            commissionReduction.add(commission);
                        if (payment) {
                            await orderRepository.createRefund({
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
                            });
                        }
                        await productRepository.incrementStock(
                            item.productId,
                            refundableQuantity,
                        );
                        await outboxRepository.create({
                            aggregateType: 'Product',
                            aggregateId: item.productId,
                            type: 'product.stock-changed',
                            payload: {
                                productId: item.productId,
                                quantity: item.quantity,
                            },
                            idempotencyKey: `customer-cancel:${orderId}:stock:${item.productId}`,
                        });
                    }
                    await orderRepository.updateSellerOrder(sellerOrder.id, {
                        refundedAmount: {
                            increment: payment ? refundTotal : 0,
                        },
                        commissionAmount: {
                            decrement: commissionReduction,
                        },
                        sellerEarnings: {
                            decrement: refundTotal.sub(commissionReduction),
                        },
                    });
                    await orderRepository.createLedgerEntries([
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
                    ]);
                }
                if (payment) {
                    const refunded = await orderRepository.sumProcessedRefunds(
                        payment.id,
                    );
                    await orderRepository.updatePayment(payment.id, {
                        status: (
                            refunded._sum.amount ?? new Prisma.Decimal(0)
                        ).gte(payment.amount)
                            ? PaymentStatus.REFUNDED
                            : PaymentStatus.PARTIALLY_REFUNDED,
                    });
                }
                if (pendingPayment) {
                    const cancellation = this.mockPayment.cancel(
                        pendingPayment.id,
                    );
                    await orderRepository.updatePayment(pendingPayment.id, {
                        status: PaymentStatus.CANCELLED,
                        providerRef: cancellation.providerRef,
                    });
                }
                const statuses =
                    await orderRepository.findSellerOrderStatuses(orderId);
                const nextStatus = deriveOrderStatus(
                    statuses.map(({ status }) => status),
                );
                const result =
                    await orderRepository.updateOrderStatusWithDetails(
                        orderId,
                        nextStatus,
                    );
                await outboxRepository.createMany([
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
                                correlationId: getCorrelationId(),
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
                ]);
                return result;
            },
        );
        await Promise.all([
            this.redis.delByPattern('products:list:*'),
            this.redis.delByPattern('search:products:*'),
            this.redis.delByPattern('products:detail:*'),
        ]);
        return updated;
    }

    async cancelSellerOrder(
        sellerId: string,
        sellerOrderId: string,
        idempotencyKey: string,
        reason = 'Cancelled by seller',
        customerId?: string,
    ) {
        if (!idempotencyKey?.trim()) {
            throw new BadRequestException('Idempotency-Key header is required');
        }
        const eventKey = `seller-order-cancel:${idempotencyKey}`;
        const existing =
            await this.outboxRepository.findSellerOrderByIdempotencyKey(
                eventKey,
            );
        if (existing?.sellerOrder) return existing.sellerOrder;

        try {
            const result = await this.unitOfWork.run(
                async ({
                    orderRepository,
                    outboxRepository,
                    productRepository,
                }) => {
                    const sellerOrder =
                        await orderRepository.findSellerOrderForCancellation(
                            sellerOrderId,
                        );
                    if (!sellerOrder)
                        throw new NotFoundException('Seller order not found');
                    if (
                        customerId
                            ? sellerOrder.order.userId !== customerId
                            : sellerOrder.sellerId !== sellerId
                    ) {
                        throw new ForbiddenException(
                            'You do not have access to this seller order',
                        );
                    }
                    const cancellableStatuses: SellerOrderStatus[] = customerId
                        ? [
                              SellerOrderStatus.NEW,
                              SellerOrderStatus.PAYMENT_PENDING,
                              SellerOrderStatus.PROCESSING,
                          ]
                        : [
                              SellerOrderStatus.NEW,
                              SellerOrderStatus.PAYMENT_PENDING,
                              SellerOrderStatus.PROCESSING,
                              SellerOrderStatus.SHIPPED,
                          ];
                    if (!cancellableStatuses.includes(sellerOrder.status)) {
                        throw new BadRequestException(
                            `Seller order cannot be cancelled in status ${sellerOrder.status}`,
                        );
                    }
                    const claimed =
                        await orderRepository.claimSellerOrderCancellation(
                            sellerOrderId,
                            cancellableStatuses,
                            reason.trim() ||
                                (customerId
                                    ? 'Cancelled by customer'
                                    : 'Cancelled by seller'),
                        );
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
                        const alreadyRefunded =
                            await orderRepository.sumRefundedQuantity(item.id);
                        const refundableQuantity = Math.max(
                            item.quantity -
                                (alreadyRefunded._sum.quantity ?? 0),
                            0,
                        );
                        if (!refundableQuantity) continue;
                        const refundAmount =
                            item.unitPrice.mul(refundableQuantity);
                        const commission = refundAmount.mul(
                            sellerOrder.commissionRate,
                        );
                        refundTotal = refundTotal.add(refundAmount);
                        commissionReduction =
                            commissionReduction.add(commission);
                        if (payment) {
                            await orderRepository.createRefund({
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
                            });
                        }
                        await productRepository.incrementStock(
                            item.productId,
                            refundableQuantity,
                        );
                        await outboxRepository.create({
                            orderId: sellerOrder.orderId,
                            sellerOrderId: sellerOrder.id,
                            aggregateType: 'Product',
                            aggregateId: item.productId,
                            type: 'product.stock-changed',
                            payload: {
                                productId: item.productId,
                                quantity: refundableQuantity,
                                correlationId: getCorrelationId(),
                            },
                            idempotencyKey: `${eventKey}:stock:${item.productId}`,
                        });
                    }

                    const updatedSellerOrder =
                        await orderRepository.updateSellerOrderWithDetails(
                            sellerOrderId,
                            {
                                status: SellerOrderStatus.CANCELLED,
                                cancelledAt: now,
                                cancellationReason:
                                    reason.trim() || 'Cancelled by seller',
                                refundedAmount: {
                                    increment: payment ? refundTotal : 0,
                                },
                                commissionAmount: {
                                    decrement: commissionReduction,
                                },
                                sellerEarnings: {
                                    decrement:
                                        refundTotal.sub(commissionReduction),
                                },
                            },
                        );
                    const siblingStatuses =
                        await orderRepository.findSellerOrderStatuses(
                            sellerOrder.orderId,
                        );
                    const nextOrderStatus = deriveOrderStatus(
                        siblingStatuses.map(({ status }) => status),
                    );
                    await orderRepository.updateOrderStatus(
                        sellerOrder.orderId,
                        nextOrderStatus,
                    );
                    const order =
                        await orderRepository.findOrderForCancellation(
                            sellerOrder.orderId,
                        );
                    if (!order) throw new NotFoundException('Order not found');
                    if (payment) {
                        const refunded =
                            await orderRepository.sumProcessedRefunds(
                                payment.id,
                            );
                        const totalRefunded =
                            refunded._sum.amount ?? new Prisma.Decimal(0);
                        await orderRepository.updatePayment(payment.id, {
                            status: totalRefunded.gte(payment.amount)
                                ? PaymentStatus.REFUNDED
                                : PaymentStatus.PARTIALLY_REFUNDED,
                        });
                    }
                    await orderRepository.createLedgerEntries([
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
                    ]);
                    await outboxRepository.createMany([
                        {
                            orderId: order.id,
                            sellerOrderId,
                            aggregateType: 'SellerOrder',
                            aggregateId: sellerOrderId,
                            type: 'seller-order.cancelled',
                            payload: {
                                sellerId: sellerOrder.sellerId,
                                reason,
                                refundAmount: refundTotal.toString(),
                                correlationId: getCorrelationId(),
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
                    ]);
                    return { sellerOrder: updatedSellerOrder, order };
                },
            );
            await Promise.all([
                this.redis.delByPattern('products:list:*'),
                this.redis.delByPattern('search:products:*'),
                this.redis.delByPattern('products:detail:*'),
            ]);
            const event =
                await this.outboxRepository.findEventIdByIdempotencyKey(
                    eventKey,
                );
            if (event)
                await this.ordersQueue.add(
                    'deliver-outbox-event',
                    { outboxEventId: event.id },
                    {
                        attempts: 5,
                        backoff: { type: 'exponential', delay: 1000 },
                    },
                );
            return { ...result.sellerOrder, order: result.order };
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const retry =
                    await this.outboxRepository.findSellerOrderByIdempotencyKey(
                        eventKey,
                    );
                if (retry?.sellerOrder) return retry.sellerOrder;
            }
            throw error;
        }
    }

    async cancelCustomerSuborder(
        userId: string,
        sellerOrderId: string,
        idempotencyKey: string,
        reason = 'Cancelled by customer',
    ) {
        return this.cancelSellerOrder(
            '',
            sellerOrderId,
            idempotencyKey,
            reason,
            userId,
        );
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
        const existing =
            await this.orderRepository.findRefundByIdempotencyKey(
                idempotencyKey,
            );
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
            const result = await this.unitOfWork.run(
                async ({
                    orderRepository,
                    outboxRepository,
                    productRepository,
                }) => {
                    const item =
                        await orderRepository.findOrderItemForRefund(
                            orderItemId,
                        );
                    if (!item)
                        throw new NotFoundException('Order item not found');
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
                    await orderRepository.lockSellerOrderForUpdate(
                        item.sellerOrderId,
                    );
                    await orderRepository.touchSellerOrder(item.sellerOrderId);
                    const refunded =
                        await orderRepository.sumRefundedQuantity(orderItemId);
                    const refundedQuantity = refunded._sum.quantity ?? 0;
                    if (refundedQuantity + quantity > item.quantity) {
                        throw new BadRequestException(
                            'Refund quantity exceeds the refundable quantity',
                        );
                    }
                    const amount = item.unitPrice.mul(quantity);
                    const commission = amount.mul(
                        item.sellerOrder.commissionRate,
                    );
                    const payment = item.sellerOrder.order.payments.find(
                        ({ status }) =>
                            status === PaymentStatus.PAID ||
                            status === PaymentStatus.PARTIALLY_REFUNDED,
                    );
                    if (!payment) {
                        throw new BadRequestException(
                            'Order has no successful payment to refund',
                        );
                    }
                    const refund = await orderRepository.createRefund({
                        sellerOrderId: item.sellerOrderId,
                        orderItemId,
                        paymentId: payment.id,
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
                    });
                    const updatedSellerOrder =
                        await orderRepository.updateSellerOrderRefunds(
                            item.sellerOrderId,
                            amount,
                            commission,
                        );
                    if (
                        item.sellerOrder.status === SellerOrderStatus.PROCESSING
                    ) {
                        await productRepository.incrementStock(
                            item.productId,
                            quantity,
                        );
                    }
                    if (payment) {
                        const paymentRefunds =
                            await orderRepository.sumProcessedRefunds(
                                payment.id,
                            );
                        const totalRefunded =
                            paymentRefunds._sum.amount ?? new Prisma.Decimal(0);
                        await orderRepository.updatePaymentStatus(
                            payment.id,
                            totalRefunded.gte(payment.amount)
                                ? PaymentStatus.REFUNDED
                                : PaymentStatus.PARTIALLY_REFUNDED,
                        );
                    }
                    await orderRepository.createLedgerEntry({
                        sellerOrderId: item.sellerOrderId,
                        type: LedgerEntryType.ADJUSTMENT,
                        amount: commission.neg(),
                        idempotencyKey: `${idempotencyKey}:commission-adjustment`,
                    });
                    await orderRepository.createLedgerEntry({
                        sellerOrderId: item.sellerOrderId,
                        type: LedgerEntryType.ADJUSTMENT,
                        amount: amount.sub(commission).neg(),
                        idempotencyKey: `${idempotencyKey}:earnings-adjustment`,
                    });
                    await outboxRepository.create({
                        orderId: item.sellerOrder.orderId,
                        sellerOrderId: item.sellerOrderId,
                        aggregateType: 'SellerOrder',
                        aggregateId: item.sellerOrderId,
                        type: 'seller-order.refunded',
                        payload: {
                            orderItemId,
                            quantity,
                            amount: amount.toString(),
                            correlationId: getCorrelationId(),
                        },
                        idempotencyKey: `${idempotencyKey}:refund-event`,
                    });
                    return { refund, sellerOrder: updatedSellerOrder };
                },
            );
            await Promise.all([
                this.redis.delByPattern('products:list:*'),
                this.redis.delByPattern('search:products:*'),
                this.redis.delByPattern('products:detail:*'),
            ]);
            const event =
                await this.outboxRepository.findEventIdByIdempotencyKey(
                    `${idempotencyKey}:refund-event`,
                );
            if (event)
                await this.ordersQueue.add(
                    'deliver-outbox-event',
                    { outboxEventId: event.id },
                    {
                        attempts: 5,
                        backoff: { type: 'exponential', delay: 1000 },
                    },
                );
            this.metrics.recordRefund();
            return result;
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const retry =
                    await this.orderRepository.findRefundByIdempotencyKey(
                        idempotencyKey,
                    );
                if (retry) return retry;
            }
            throw error;
        }
    }

    async findMyOrders(userId: string) {
        const orders = await this.orderRepository.listOrdersForUser(userId);

        return orders.map(({ payments, ...order }) => {
            const hasPaidPayment = payments.some(
                (payment) =>
                    payment.status === PaymentStatus.PAID ||
                    payment.status === PaymentStatus.PARTIALLY_REFUNDED,
            );

            if (
                hasPaidPayment &&
                (order.status === OrderStatus.NEW ||
                    order.status === OrderStatus.PAYMENT_PENDING)
            ) {
                return { ...order, status: OrderStatus.PROCESSING };
            }

            return order;
        });
    }

    findMySellerOrders(sellerId: string) {
        return this.orderRepository.listSellerOrders(sellerId);
    }

    async findSellerOrder(sellerId: string, sellerOrderId: string) {
        const sellerOrder =
            await this.orderRepository.findSellerOrderDetails(sellerOrderId);
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
        const result = await this.unitOfWork.run(
            async ({ orderRepository, outboxRepository }) => {
                const sellerOrder =
                    await orderRepository.findSellerOrderForCancellation(
                        sellerOrderId,
                    );
                if (!sellerOrder)
                    throw new NotFoundException('Seller order not found');
                if (sellerOrder.sellerId !== sellerId) {
                    throw new ForbiddenException(
                        'You do not have access to this seller order',
                    );
                }

                this.assertSellerOrderTransition(
                    sellerOrder.status,
                    dto.status,
                );
                const now = new Date();
                const updatedSellerOrder =
                    await orderRepository.updateSellerOrderWithDetails(
                        sellerOrderId,
                        {
                            status: dto.status,
                            ...(dto.status === SellerOrderStatus.SHIPPED && {
                                ...(dto.trackingNumber?.trim() && {
                                    trackingNumber: dto.trackingNumber.trim(),
                                }),
                                shippedAt: now,
                            }),
                            ...(dto.status === SellerOrderStatus.COMPLETED && {
                                completedAt: now,
                            }),
                        },
                    );
                const siblingStatuses =
                    await orderRepository.findSellerOrderStatuses(
                        sellerOrder.orderId,
                    );
                const nextOrderStatus = deriveOrderStatus(
                    siblingStatuses.map(({ status }) => status),
                );
                const parentChanged =
                    sellerOrder.order.status !== nextOrderStatus;
                const order = parentChanged
                    ? await orderRepository.updateOrderStatus(
                          sellerOrder.orderId,
                          nextOrderStatus,
                      )
                    : sellerOrder.order;

                await outboxRepository.createMany([
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
                            correlationId: getCorrelationId(),
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
                                      correlationId: getCorrelationId(),
                                  },
                                  idempotencyKey: `${order.id}:status:${sellerOrder.order.status}:${order.status}`,
                              },
                          ]
                        : []),
                ]);
                return { sellerOrder: updatedSellerOrder, order };
            },
        );

        this.logger.log(
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
        const order = await this.orderRepository.findByIdWithDetails(orderId);
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
        const [items, total] = await this.unitOfWork.run(
            async ({ orderRepository }) =>
                Promise.all([
                    orderRepository.listOrders(
                        where,
                        (page - 1) * limit,
                        limit,
                    ),
                    orderRepository.countOrders(where),
                ]),
        );
        return {
            items,
            meta: { total, page, limit, pageCount: Math.ceil(total / limit) },
        };
    }

    private async findCheckoutByIdempotencyKey(
        userId: string,
        idempotencyKey: string,
    ) {
        const payment =
            await this.orderRepository.findByPaymentIdempotencyKey(
                idempotencyKey,
            );
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
