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
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { getCorrelationId } from '../common/correlation/correlation.context';
import { MockPaymentService } from '../payments/mock-payment.service';
import { LoggerService } from '../logger/logger.service';
import { DisputeRepository } from '../database/dispute.repository';
import { UnitOfWork } from '../database/unit-of-work';

@Injectable()
export class DisputesService {
    constructor(
        private readonly disputes: DisputeRepository,
        private readonly unitOfWork: UnitOfWork,
        private readonly mockPayment: MockPaymentService,
        private readonly logger: LoggerService,
    ) {}

    async open(customerId: string, dto: CreateDisputeDto) {
        return this.unitOfWork.run(
            async ({
                disputeRepository,
                orderRepository,
                outboxRepository,
            }) => {
                const sellerOrder =
                    await orderRepository.findSellerOrderWithOrder(
                        dto.sellerOrderId,
                    );
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
                const existing =
                    await disputeRepository.findActiveForSellerOrder(
                        dto.sellerOrderId,
                    );
                if (existing)
                    throw new ConflictException(
                        'An active dispute already exists',
                    );
                const dispute = await disputeRepository.create({
                    sellerOrderId: dto.sellerOrderId,
                    openedById: customerId,
                    subject: dto.subject.trim(),
                    description: dto.description.trim(),
                });
                await disputeRepository.createHistory({
                    disputeId: dispute.id,
                    actorId: customerId,
                    status: DisputeStatus.OPEN,
                    note: 'Dispute opened',
                });
                await outboxRepository.create({
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
                });
                void this.logger.audit(
                    DisputesService.name,
                    'Dispute created',
                    {
                        disputeId: dispute.id,
                        sellerOrderId: dto.sellerOrderId,
                        customerId,
                        operation: 'dispute.create',
                    },
                );
                return dispute;
            },
        );
    }

    listForCustomer(customerId: string) {
        return this.disputes.list({ openedById: customerId });
    }

    listForSeller(sellerId: string) {
        return this.disputes.list({ sellerOrder: { sellerId } });
    }

    listForAdmin() {
        return this.disputes.list({});
    }

    async listForUser(userId: string, role: string) {
        if (role === 'ADMIN') return this.listForAdmin();
        if (role === 'SELLER') return this.listForSeller(userId);
        return this.listForCustomer(userId);
    }

    async resolve(adminId: string, disputeId: string, dto: ResolveDisputeDto) {
        return this.unitOfWork.run(
            async ({
                disputeRepository,
                orderRepository,
                outboxRepository,
            }) => {
                const dispute =
                    await disputeRepository.findByIdForResolve(disputeId);
                if (!dispute) throw new NotFoundException('Dispute not found');
                if (
                    dispute.status !== DisputeStatus.OPEN &&
                    dispute.status !== DisputeStatus.UNDER_REVIEW
                )
                    throw new ConflictException('Dispute is already resolved');
                if (
                    ![
                        DisputeStatus.RESOLVED_FOR_CUSTOMER,
                        DisputeStatus.RESOLVED_FOR_SELLER,
                    ].some((status) => status === dto.status)
                ) {
                    throw new ConflictException(
                        'Invalid dispute resolution status',
                    );
                }
                const shouldRefund =
                    dto.status === DisputeStatus.RESOLVED_FOR_CUSTOMER &&
                    dispute.sellerOrder.status === SellerOrderStatus.COMPLETED;
                let refundAmount = new Prisma.Decimal(0);
                if (shouldRefund) {
                    const payment = dispute.sellerOrder.order.payments.find(
                        (candidate) =>
                            candidate.status === PaymentStatus.PAID ||
                            candidate.status ===
                                PaymentStatus.PARTIALLY_REFUNDED,
                    );
                    if (!payment) {
                        throw new ConflictException(
                            'Completed dispute cannot be refunded without a paid payment',
                        );
                    }
                    for (const item of dispute.sellerOrder.items) {
                        const refunded =
                            await orderRepository.sumProcessedRefundQuantity(
                                item.id,
                            );
                        const quantity =
                            item.quantity - (refunded._sum.quantity ?? 0);
                        if (quantity <= 0) continue;
                        const amount = new Prisma.Decimal(item.unitPrice).mul(
                            quantity,
                        );
                        refundAmount = refundAmount.add(amount);
                        const providerRefund = this.mockPayment.refund(
                            payment.id,
                            amount,
                        );
                        await orderRepository.createRefund({
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
                        });
                        await orderRepository.createLedgerEntry({
                            sellerOrderId: dispute.sellerOrderId,
                            paymentId: payment.id,
                            type: LedgerEntryType.REFUND,
                            amount: amount.neg(),
                            idempotencyKey: `dispute-refund-ledger:${disputeId}:${item.id}`,
                        });
                    }
                    await orderRepository.updateSellerOrder(
                        dispute.sellerOrderId,
                        { refundedAmount: { increment: refundAmount } },
                    );
                    const totalRefunded =
                        await orderRepository.sumProcessedRefunds(payment.id);
                    await orderRepository.updatePaymentStatus(
                        payment.id,
                        (
                            totalRefunded._sum.amount ?? new Prisma.Decimal(0)
                        ).gte(payment.amount)
                            ? PaymentStatus.REFUNDED
                            : PaymentStatus.PARTIALLY_REFUNDED,
                    );
                }
                const resolved = await disputeRepository.update(disputeId, {
                    status: dto.status,
                    resolution: dto.resolution?.trim(),
                    resolvedById: adminId,
                    resolvedAt: new Date(),
                });
                await disputeRepository.createHistory({
                    disputeId,
                    actorId: adminId,
                    status: dto.status,
                    note: dto.resolution?.trim(),
                });
                await outboxRepository.create({
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
                });
                void this.logger.audit(
                    DisputesService.name,
                    'Dispute resolved',
                    {
                        disputeId,
                        adminId,
                        status: dto.status,
                        refundAmount: refundAmount.toString(),
                        operation: 'dispute.resolve',
                    },
                );
                return resolved;
            },
        );
    }
}
