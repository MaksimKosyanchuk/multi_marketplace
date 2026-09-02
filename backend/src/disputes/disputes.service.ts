import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import {
    DisputeStatus,
    LedgerEntryType,
    PaymentStatus,
    Prisma,
    SellerOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { getCorrelationId } from '../common/correlation/correlation.context';
import { MockPaymentService } from '../payments/mock-payment.service';

@Injectable()
export class DisputesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly mockPayment: MockPaymentService,
    ) {}

    async open(customerId: string, dto: CreateDisputeDto) {
        return this.prisma.$transaction(async (tx) => {
            const sellerOrder = await tx.sellerOrder.findUnique({
                where: { id: dto.sellerOrderId },
                include: { order: true },
            });
            if (!sellerOrder)
                throw new NotFoundException('Seller order not found');
            if (sellerOrder.order.userId !== customerId)
                throw new ForbiddenException(
                    'You do not have access to this seller order',
                );
            if (sellerOrder.status !== 'COMPLETED')
                throw new ConflictException(
                    'Dispute requires a completed seller order',
                );
            const existing = await tx.dispute.findFirst({
                where: {
                    sellerOrderId: dto.sellerOrderId,
                    status: { in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] },
                },
            });
            if (existing)
                throw new ConflictException('An active dispute already exists');
            const dispute = await tx.dispute.create({
                data: {
                    sellerOrderId: dto.sellerOrderId,
                    openedById: customerId,
                    subject: dto.subject.trim(),
                    description: dto.description.trim(),
                },
            });
            await tx.disputeHistory.create({
                data: {
                    disputeId: dispute.id,
                    actorId: customerId,
                    status: DisputeStatus.OPEN,
                    note: 'Dispute opened',
                },
            });
            await tx.outboxEvent.create({
                data: {
                    sellerOrderId: dto.sellerOrderId,
                    aggregateType: 'Dispute',
                    aggregateId: dispute.id,
                    type: 'dispute.opened',
                    payload: {
                        disputeId: dispute.id,
                        sellerOrderId: dto.sellerOrderId,
                        customerId,
                        correlationId: getCorrelationId(),
                    },
                    idempotencyKey: `dispute-opened:${dispute.id}`,
                },
            });
            return dispute;
        });
    }

    async listForUser(userId: string, role: string) {
        const where: Prisma.DisputeWhereInput =
            role === 'ADMIN'
                ? {}
                : {
                      OR: [
                          { openedById: userId },
                          { sellerOrder: { sellerId: userId } },
                      ],
                  };
        return this.prisma.dispute.findMany({
            where,
            include: { sellerOrder: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    async resolve(adminId: string, disputeId: string, dto: ResolveDisputeDto) {
        return this.prisma.$transaction(async (tx) => {
            const dispute = await tx.dispute.findUnique({
                where: { id: disputeId },
                include: {
                    sellerOrder: {
                        include: { items: true, order: { include: { payments: true } } },
                    },
                },
            });
            if (!dispute) throw new NotFoundException('Dispute not found');
            if (![DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW].includes(dispute.status))
                throw new ConflictException('Dispute is already resolved');
            if (
                ![
                    DisputeStatus.RESOLVED_FOR_CUSTOMER,
                    DisputeStatus.RESOLVED_FOR_SELLER,
                    DisputeStatus.CLOSED,
                ].includes(dto.status)
            )
                throw new ConflictException('Invalid dispute resolution status');
            const shouldRefund =
                dto.status === DisputeStatus.RESOLVED_FOR_CUSTOMER &&
                dispute.sellerOrder.status === SellerOrderStatus.COMPLETED;
            let refundAmount = new Prisma.Decimal(0);
            if (shouldRefund) {
                const payment = dispute.sellerOrder.order.payments.find(
                    (candidate) =>
                        candidate.status === PaymentStatus.PAID ||
                        candidate.status === PaymentStatus.PARTIALLY_REFUNDED,
                );
                if (!payment) {
                    throw new ConflictException(
                        'Completed dispute cannot be refunded without a paid payment',
                    );
                }
                for (const item of dispute.sellerOrder.items) {
                    const refunded = await tx.refund.aggregate({
                        where: {
                            orderItemId: item.id,
                            status: 'PROCESSED',
                        },
                        _sum: { quantity: true },
                    });
                    const quantity = item.quantity - (refunded._sum.quantity ?? 0);
                    if (quantity <= 0) continue;
                    const amount = new Prisma.Decimal(item.unitPrice).mul(quantity);
                    refundAmount = refundAmount.add(amount);
                    const providerRefund = this.mockPayment.refund(
                        payment.id,
                        amount,
                    );
                    await tx.refund.create({
                        data: {
                            sellerOrderId: dispute.sellerOrderId,
                            orderItemId: item.id,
                            paymentId: payment.id,
                            amount,
                            quantity,
                            reason: `Dispute ${disputeId} resolved for customer`,
                            status: 'PROCESSED',
                            providerRef: providerRefund.providerRef,
                            idempotencyKey: `dispute-refund:${disputeId}:${item.id}`,
                            processedAt: new Date(),
                        },
                    });
                    await tx.ledgerEntry.create({
                        data: {
                            sellerOrderId: dispute.sellerOrderId,
                            paymentId: payment.id,
                            type: LedgerEntryType.REFUND,
                            amount: amount.neg(),
                            idempotencyKey: `dispute-refund-ledger:${disputeId}:${item.id}`,
                        },
                    });
                }
                await tx.sellerOrder.update({
                    where: { id: dispute.sellerOrderId },
                    data: { refundedAmount: { increment: refundAmount } },
                });
                const totalRefunded = await tx.refund.aggregate({
                    where: { paymentId: payment.id, status: 'PROCESSED' },
                    _sum: { amount: true },
                });
                await tx.payment.update({
                    where: { id: payment.id },
                    data: {
                        status:
                            (totalRefunded._sum.amount ?? new Prisma.Decimal(0)).gte(
                                payment.amount,
                            )
                                ? PaymentStatus.REFUNDED
                                : PaymentStatus.PARTIALLY_REFUNDED,
                    },
                });
            }
            const resolved = await tx.dispute.update({
                where: { id: disputeId },
                data: {
                    status: dto.status,
                    resolution: dto.resolution?.trim(),
                    resolvedById: adminId,
                    resolvedAt: new Date(),
                },
            });
            await tx.disputeHistory.create({
                data: {
                    disputeId,
                    actorId: adminId,
                    status: dto.status,
                    note: dto.resolution?.trim(),
                },
            });
            await tx.outboxEvent.create({
                data: {
                    sellerOrderId: dispute.sellerOrderId,
                    aggregateType: 'Dispute',
                    aggregateId: disputeId,
                    type: 'dispute.resolved',
                    payload: {
                        disputeId,
                        status: dto.status,
                        adminId,
                        refundAmount: refundAmount.toString(),
                        correlationId: getCorrelationId(),
                    },
                    idempotencyKey: `dispute-resolved:${disputeId}:${dto.status}`,
                },
            });
            return resolved;
        });
    }
}
