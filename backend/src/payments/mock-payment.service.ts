import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface MockChargeResult {
    providerRef: string;
    amount: Prisma.Decimal;
}

export interface MockRefundResult {
    providerRef: string;
    amount: Prisma.Decimal;
}

@Injectable()
export class MockPaymentService {
    charge(paymentId: string, amount: Prisma.Decimal): MockChargeResult {
        return {
            providerRef: `mock-charge:${paymentId}`,
            amount,
        };
    }

    cancel(paymentId: string): { providerRef: string } {
        return { providerRef: `mock-cancel:${paymentId}` };
    }

    refund(paymentId: string, amount: Prisma.Decimal): MockRefundResult {
        return {
            providerRef: `mock-refund:${paymentId}:${amount.toString()}`,
            amount,
        };
    }
}
