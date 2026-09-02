import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Injectable()
export class CartService {
    constructor(private prisma: PrismaService) {}

    private async getOrCreateCart(userId: string) {
        let cart = await this.prisma.cart.findUnique({ where: { userId } });
        if (!cart) {
            cart = await this.prisma.cart.create({ data: { userId } });
        }
        return cart;
    }

    async getCart(userId: string) {
        const cart = await this.getOrCreateCart(userId);
        const items = await this.prisma.cartItem.findMany({
            where: { cartId: cart.id },
            include: { product: true },
            orderBy: { createdAt: 'asc' },
        });

        const total = items.reduce(
            (sum, item) => sum + Number(item.product.price) * item.quantity,
            0,
        );

        return { cartId: cart.id, items, total };
    }

    async addItem(userId: string, dto: AddToCartDto) {
        const product = await this.prisma.product.findUnique({
            where: { id: dto.productId },
        });
        if (!product) throw new NotFoundException('Product not found');

        const cart = await this.getOrCreateCart(userId);

        const existingItem = await this.prisma.cartItem.findUnique({
            where: {
                cartId_productId: { cartId: cart.id, productId: dto.productId },
            },
        });

        const currentInCart = existingItem ? existingItem.quantity : 0;
        const newQuantity = currentInCart + dto.quantity;

        if (product.stock < newQuantity) {
            throw new BadRequestException(
                `Only ${product.stock} item(s) left in stock. You already have ${currentInCart} in cart.`,
            );
        }

        if (existingItem) {
            return this.prisma.cartItem.update({
                where: { id: existingItem.id },
                data: { quantity: newQuantity },
                include: { product: true },
            });
        }

        return this.prisma.cartItem.create({
            data: {
                cartId: cart.id,
                productId: dto.productId,
                quantity: dto.quantity,
            },
            include: { product: true },
        });
    }

    async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
        const item = await this.findOwnedItem(userId, itemId);

        if (item.product.stock < dto.quantity) {
            throw new BadRequestException(
                `Only ${item.product.stock} item(s) left in stock`,
            );
        }

        return this.prisma.cartItem.update({
            where: { id: itemId },
            data: { quantity: dto.quantity },
            include: { product: true },
        });
    }

    async removeItem(userId: string, itemId: string) {
        await this.findOwnedItem(userId, itemId);
        await this.prisma.cartItem.delete({ where: { id: itemId } });
        return { success: true };
    }

    async clearCart(userId: string) {
        const cart = await this.getOrCreateCart(userId);
        await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
        return { success: true };
    }

    private async findOwnedItem(userId: string, itemId: string) {
        const item = await this.prisma.cartItem.findUnique({
            where: { id: itemId },
            include: { product: true, cart: true },
        });
        if (!item) throw new NotFoundException('Cart item not found');
        if (item.cart.userId !== userId) {
            throw new NotFoundException('Cart item not found');
        }
        return item;
    }
}
