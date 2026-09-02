import { Decimal } from '@prisma/client/runtime/library';

export function toMoney(value: Decimal | number | string): number {
    return Number(new Decimal(value).toFixed(2));
}
