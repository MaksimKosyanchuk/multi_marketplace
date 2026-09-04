import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { ProductStatus, ProductType } from '@prisma/client';
import { CartRepository } from '../database/cart.repository';
import { ProductRepository } from '../database/product.repository';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Injectable()
export class CartService {
    constructor(
        private readonly cartRepository: CartRepository,
        private readonly productRepository: ProductRepository,
    ) {}

    private async getOrCreateCart(userId: string) {
        let cart = await this.cartRepository.findByUserId(userId);
        if (!cart) {
            cart = await this.cartRepository.createForUser(userId);
        }
        return cart;
    }

    async getCart(userId: string) {
        const cart = await this.getOrCreateCart(userId);
        const items = await this.cartRepository.findItems(cart.id);

        const total = items.reduce(
            (sum, item) => sum + Number(item.product.price) * item.quantity,
            0,
        );

        return { cartId: cart.id, items, total };
    }

    async addItem(userId: string, dto: AddToCartDto) {
        const product = await this.productRepository.findById(dto.productId);
        if (!product) throw new NotFoundException('Product not found');
        if (
            product.status !== ProductStatus.ACTIVE ||
            product.type !== ProductType.FIXED_PRICE ||
            product.isArchived
        ) {
            throw new BadRequestException(
                'Product is not available for purchase',
            );
        }

        const cart = await this.getOrCreateCart(userId);

        const existingItem = await this.cartRepository.findItemByCartAndProduct(
            cart.id,
            dto.productId,
        );

        const currentInCart = existingItem ? existingItem.quantity : 0;
        const newQuantity = currentInCart + dto.quantity;

        if (product.stock < newQuantity) {
            throw new BadRequestException(
                `Only ${product.stock} item(s) left in stock. You already have ${currentInCart} in cart.`,
            );
        }

        if (existingItem) {
            return this.cartRepository.updateItemQuantity(
                existingItem.id,
                newQuantity,
            );
        }

        return this.cartRepository.createItem({
            cartId: cart.id,
            productId: dto.productId,
            quantity: dto.quantity,
        });
    }

    async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
        const item = await this.findOwnedItem(userId, itemId);

        if (
            item.product.status !== ProductStatus.ACTIVE ||
            item.product.type !== ProductType.FIXED_PRICE ||
            item.product.isArchived
        ) {
            throw new BadRequestException(
                'Product is not available for purchase',
            );
        }

        if (item.product.stock < dto.quantity) {
            throw new BadRequestException(
                `Only ${item.product.stock} item(s) left in stock`,
            );
        }

        return this.cartRepository.updateItemQuantity(itemId, dto.quantity);
    }

    async removeItem(userId: string, itemId: string) {
        await this.findOwnedItem(userId, itemId);
        await this.cartRepository.deleteItem(itemId);
        return { success: true };
    }

    async clearCart(userId: string) {
        const cart = await this.getOrCreateCart(userId);
        await this.cartRepository.clear(cart.id);
        return { success: true };
    }

    private async findOwnedItem(userId: string, itemId: string) {
        const item =
            await this.cartRepository.findItemWithProductAndCart(itemId);
        if (!item) throw new NotFoundException('Cart item not found');
        if (item.cart.userId !== userId) {
            throw new NotFoundException('Cart item not found');
        }
        return item;
    }
}
