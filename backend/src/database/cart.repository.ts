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

    createForUser(userId: string, db: DatabaseClient = this.prisma) {
        return db.cart.create({ data: { userId } });
    }

    findItems(cartId: string, db: DatabaseClient = this.prisma) {
        return db.cartItem.findMany({
            where: { cartId },
            include: { product: true },
            orderBy: { createdAt: 'asc' },
        });
    }

    findItemByCartAndProduct(
        cartId: string,
        productId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.cartItem.findUnique({
            where: { cartId_productId: { cartId, productId } },
        });
    }

    findItemWithProductAndCart(id: string, db: DatabaseClient = this.prisma) {
        return db.cartItem.findUnique({
            where: { id },
            include: { product: true, cart: true },
        });
    }

    createItem(
        data: { cartId: string; productId: string; quantity: number },
        db: DatabaseClient = this.prisma,
    ) {
        return db.cartItem.create({
            data,
            include: { product: true },
        });
    }

    updateItemQuantity(
        id: string,
        quantity: number,
        db: DatabaseClient = this.prisma,
    ) {
        return db.cartItem.update({
            where: { id },
            data: { quantity },
            include: { product: true },
        });
    }

    deleteItem(id: string, db: DatabaseClient = this.prisma) {
        return db.cartItem.delete({ where: { id } });
    }

    clear(cartId: string, db: DatabaseClient = this.prisma) {
        return db.cartItem.deleteMany({ where: { cartId } });
    }

    removeProduct(productId: string, db: DatabaseClient = this.prisma) {
        return db.cartItem.deleteMany({ where: { productId } });
    }
}
