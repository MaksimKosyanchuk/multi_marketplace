import { Inject, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, SellerOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DatabaseClient } from './database.types';

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
    items: { include: { product: true } },
    seller: { select: { id: true, email: true, nickName: true } },
} satisfies Prisma.SellerOrderInclude;

@Injectable()
export class OrderRepository {
    constructor(
        @Inject(PrismaService) private readonly prisma: DatabaseClient,
    ) {}

    findByPaymentIdempotencyKey(
        idempotencyKey: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.payment.findUnique({
            where: { idempotencyKey },
            include: { order: { include: orderDetails } },
        });
    }

    createCheckoutOrder(
        data: Prisma.OrderCreateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.order.create({
            data,
            include: orderDetails,
        });
    }

    create(
        data: Prisma.OrderCreateArgs['data'],
        include: Prisma.OrderInclude,
        db: DatabaseClient = this.prisma,
    ) {
        return db.order.create({ data, include });
    }

    findById(
        orderId: string,
        include: Prisma.OrderInclude = {},
        db: DatabaseClient = this.prisma,
    ) {
        return db.order.findUnique({
            where: { id: orderId },
            ...(Object.keys(include).length ? { include } : {}),
        });
    }

    findByIdWithDetails(orderId: string, db: DatabaseClient = this.prisma) {
        return db.order.findUnique({
            where: { id: orderId },
            include: orderDetails,
        });
    }

    findForPayment(orderId: string, db: DatabaseClient = this.prisma) {
        return db.order.findUnique({
            where: { id: orderId },
            include: {
                payments: true,
                sellerOrders: { select: { sellerId: true } },
            },
        });
    }

    findForPaymentProcessing(
        orderId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.order.findUnique({
            where: { id: orderId },
            include: { payments: true },
        });
    }

    findSellerOrdersForPayment(
        orderId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.sellerOrder.findMany({
            where: { orderId },
            select: {
                id: true,
                status: true,
                sellerId: true,
                subtotal: true,
            },
        });
    }

    updateOrderPaymentPending(
        orderId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.order.updateMany({
            where: { id: orderId, status: OrderStatus.NEW },
            data: { status: OrderStatus.PAYMENT_PENDING },
        });
    }

    updateSellerOrdersPaymentPending(
        orderId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.sellerOrder.updateMany({
            where: { orderId, status: SellerOrderStatus.NEW },
            data: { status: SellerOrderStatus.PAYMENT_PENDING },
        });
    }

    updateSellerOrdersProcessing(
        orderId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.sellerOrder.updateMany({
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
    }

    findSellerOrderDetails(
        sellerOrderId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.sellerOrder.findUnique({
            where: { id: sellerOrderId },
            include: sellerOrderDetails,
        });
    }

    listOrdersForUser(userId: string, db: DatabaseClient = this.prisma) {
        return db.order.findMany({
            where: { userId },
            include: {
                ...orderDetails,
                payments: { select: { status: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    listSellerOrders(sellerId: string, db: DatabaseClient = this.prisma) {
        return db.sellerOrder.findMany({
            where: { sellerId },
            include: sellerOrderDetails,
            orderBy: { createdAt: 'desc' },
        });
    }

    listOrders(
        where: Prisma.OrderWhereInput,
        skip: number,
        take: number,
        db: DatabaseClient = this.prisma,
    ) {
        return db.order.findMany({
            where,
            include: {
                ...orderDetails,
                user: { select: { id: true, email: true, nickName: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take,
        });
    }

    countOrders(
        where: Prisma.OrderWhereInput,
        db: DatabaseClient = this.prisma,
    ) {
        return db.order.count({ where });
    }

    findPaymentWithSellerOrderItems(
        idempotencyKey: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.payment.findUnique({
            where: { idempotencyKey },
            include: {
                order: {
                    include: { sellerOrders: { include: { items: true } } },
                },
            },
        });
    }

    findByIdWithSellerOrderItems(
        orderId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.order.findUnique({
            where: { id: orderId },
            include: { sellerOrders: { include: { items: true } } },
        });
    }

    findSellerOrderWithOrder(
        sellerOrderId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.sellerOrder.findUnique({
            where: { id: sellerOrderId },
            include: { order: true },
        });
    }

    findOrderItemForReview(
        orderItemId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.orderItem.findUnique({
            where: { id: orderItemId },
            include: { sellerOrder: { include: { order: true } } },
        });
    }

    sumProcessedRefundQuantity(
        orderItemId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.refund.aggregate({
            where: {
                orderItemId,
                status: 'PROCESSED',
            },
            _sum: { quantity: true },
        });
    }

    findOrderItemForRefund(
        orderItemId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.orderItem.findUnique({
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
    }

    findRefundByIdempotencyKey(
        idempotencyKey: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.refund.findUnique({
            where: { idempotencyKey },
            include: { orderItem: true },
        });
    }

    sumRefundedQuantity(orderItemId: string, db: DatabaseClient = this.prisma) {
        return db.refund.aggregate({
            where: {
                orderItemId,
                status: { in: ['PENDING', 'APPROVED', 'PROCESSED'] },
            },
            _sum: { quantity: true },
        });
    }

    createRefund(
        data: Prisma.RefundCreateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.refund.create({
            data,
            include: { orderItem: true },
        });
    }

    updateSellerOrderRefunds(
        sellerOrderId: string,
        amount: Prisma.Decimal,
        commission: Prisma.Decimal,
        db: DatabaseClient = this.prisma,
    ) {
        return db.sellerOrder.update({
            where: { id: sellerOrderId },
            data: {
                refundedAmount: { increment: amount },
                commissionAmount: { decrement: commission },
                sellerEarnings: { decrement: amount.sub(commission) },
            },
            include: {
                seller: { select: { id: true, email: true, nickName: true } },
                order: true,
                items: true,
            },
        });
    }

    sumProcessedRefunds(paymentId: string, db: DatabaseClient = this.prisma) {
        return db.refund.aggregate({
            where: { paymentId, status: 'PROCESSED' },
            _sum: { amount: true },
        });
    }

    updatePaymentStatus(
        paymentId: string,
        status: Prisma.PaymentUpdateArgs['data']['status'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.payment.update({
            where: { id: paymentId },
            data: { status },
        });
    }

    touchSellerOrder(sellerOrderId: string, db: DatabaseClient = this.prisma) {
        return db.sellerOrder.update({
            where: { id: sellerOrderId },
            data: { updatedAt: new Date() },
        });
    }

    /** Row lock so concurrent partial refunds serialize on the same seller order. */
    lockSellerOrderForUpdate(
        sellerOrderId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "SellerOrder" WHERE id = ${sellerOrderId} FOR UPDATE
        `;
    }

    findOrderForCancellation(
        orderId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.order.findUnique({
            where: { id: orderId },
            include: {
                ...orderDetails,
                payments: true,
            },
        });
    }

    findOrderForPaymentCancellation(
        orderId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.order.findUnique({
            where: { id: orderId },
            include: {
                payments: true,
                sellerOrders: { include: { items: true } },
            },
        });
    }

    findSellerOrderForCancellation(
        sellerOrderId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.sellerOrder.findUnique({
            where: { id: sellerOrderId },
            include: {
                order: { include: { payments: true } },
                items: true,
            },
        });
    }

    claimOrderCancellation(orderId: string, db: DatabaseClient = this.prisma) {
        return db.order.updateMany({
            where: {
                id: orderId,
                status: {
                    notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
                },
            },
            data: { status: OrderStatus.CANCELLED },
        });
    }

    claimSellerOrderCancellation(
        sellerOrderId: string,
        statuses: SellerOrderStatus[],
        reason: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.sellerOrder.updateMany({
            where: { id: sellerOrderId, status: { in: statuses } },
            data: {
                status: SellerOrderStatus.CANCELLED,
                cancelledAt: new Date(),
                cancellationReason: reason,
            },
        });
    }

    findSellerOrderStatuses(orderId: string, db: DatabaseClient = this.prisma) {
        return db.sellerOrder.findMany({
            where: { orderId },
            select: { status: true },
        });
    }

    updateOrderStatus(
        orderId: string,
        status: OrderStatus,
        db: DatabaseClient = this.prisma,
        includeDetails = false,
    ) {
        return db.order.update({
            where: { id: orderId },
            data: { status },
            ...(includeDetails ? { include: orderDetails } : {}),
        });
    }

    updateOrderStatusWithDetails(
        orderId: string,
        status: OrderStatus,
        db: DatabaseClient = this.prisma,
    ) {
        return db.order.update({
            where: { id: orderId },
            data: { status },
            include: orderDetails,
        });
    }

    updatePayment(
        paymentId: string,
        data: Prisma.PaymentUpdateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.payment.update({ where: { id: paymentId }, data });
    }

    updateSellerOrder(
        sellerOrderId: string,
        data: Prisma.SellerOrderUpdateArgs['data'],
        db: DatabaseClient = this.prisma,
        includeDetails = false,
    ) {
        return db.sellerOrder.update({
            where: { id: sellerOrderId },
            data,
            ...(includeDetails ? { include: sellerOrderDetails } : {}),
        });
    }

    updateSellerOrderWithDetails(
        sellerOrderId: string,
        data: Prisma.SellerOrderUpdateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.sellerOrder.update({
            where: { id: sellerOrderId },
            data,
            include: sellerOrderDetails,
        });
    }

    createLedgerEntries(
        data: Prisma.LedgerEntryCreateManyInput[],
        db: DatabaseClient = this.prisma,
    ) {
        return db.ledgerEntry.createMany({ data });
    }

    createLedgerEntry(
        data: Prisma.LedgerEntryCreateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.ledgerEntry.create({ data });
    }
}
