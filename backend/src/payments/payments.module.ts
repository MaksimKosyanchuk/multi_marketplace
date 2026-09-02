import { Module } from '@nestjs/common';
import { MockPaymentService } from './mock-payment.service';

@Module({
    providers: [MockPaymentService],
    exports: [MockPaymentService],
})
export class PaymentsModule {}
