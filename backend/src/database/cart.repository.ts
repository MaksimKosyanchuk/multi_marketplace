import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { DatabaseClient } from './database.types';

@Injectable()
export class CartRepository {
    constructor(
        @Inject(PrismaService) private readonly prisma: DatabaseClient,
    ) {}

    findByUserId(userId: string, db: DatabaseClient = this.prisma) {
        return db.cart.findUnique({ where: { userId } });
    }

    findItems(cartId: string, db: DatabaseClient = this.prisma) {
        return db.cartItem.findMany({
            where: { cartId },
            include: { product: true },
            orderBy: { createdAt: 'asc' },
        });
    }

    clear(cartId: string, db: DatabaseClient = this.prisma) {
        return db.cartItem.deleteMany({ where: { cartId } });
    }

    removeProduct(productId: string, db: DatabaseClient = this.prisma) {
        return db.cartItem.deleteMany({ where: { productId } });
    }
}
