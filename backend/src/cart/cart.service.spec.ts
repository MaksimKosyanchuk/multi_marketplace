import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, ProductStatus, ProductType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CartService } from './cart.service';

type MockCart = {
    id: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
};

type MockProduct = {
    id: string;
    name: string;
    description: string;
    price: Prisma.Decimal;
    stock: number;
    imageUrl: string | null;
    categoryId: string;
    status: ProductStatus;
    type: ProductType;
    isArchived: boolean;
    createdAt: Date;
    updatedAt: Date;
};

type MockCartItem = {
    id: string;
    cartId: string;
    productId: string;
    quantity: number;
    createdAt: Date;
    updatedAt: Date;
    product: MockProduct;
};

type MockCartItemWithCart = MockCartItem & {
    cart: MockCart;
};

type FindUniqueArgs = {
    where: Record<string, unknown>;
    include?: Record<string, unknown>;
};

type CreateCartArgs = {
    data: {
        userId: string;
    };
};

type CreateCartItemArgs = {
    data: {
        cartId: string;
        productId: string;
        quantity: number;
    };
    include: {
        product: true;
    };
};

type UpdateCartItemArgs = {
    where: {
        id: string;
    };
    data: {
        quantity: number;
    };
    include: {
        product: true;
    };
};

type DeleteCartItemArgs = {
    where: {
        id: string;
    };
};

type DeleteManyCartItemArgs = {
    where: {
        cartId: string;
    };
};

type DeleteManyResult = {
    count: number;
};

type CartMock = {
    findUnique: jest.Mock<Promise<MockCart | null>, [FindUniqueArgs]>;
    create: jest.Mock<Promise<MockCart>, [CreateCartArgs]>;
};

type CartItemMock = {
    findMany: jest.Mock<Promise<MockCartItem[]>, [FindUniqueArgs]>;
    findUnique: jest.Mock<
        Promise<MockCartItemWithCart | null>,
        [FindUniqueArgs]
    >;
    create: jest.Mock<Promise<MockCartItem>, [CreateCartItemArgs]>;
    update: jest.Mock<Promise<MockCartItem>, [UpdateCartItemArgs]>;
    delete: jest.Mock<Promise<MockCartItem>, [DeleteCartItemArgs]>;
    deleteMany: jest.Mock<Promise<DeleteManyResult>, [DeleteManyCartItemArgs]>;
};

type ProductMock = {
    findUnique: jest.Mock<Promise<MockProduct | null>, [FindUniqueArgs]>;
};

type MockPrisma = {
    cart: CartMock;
    cartItem: CartItemMock;
    product: ProductMock;
};

describe('CartService', () => {
    let service: CartService;

    const mockCart: MockCart = {
        id: 'cart-1',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const mockProduct: MockProduct = {
        id: 'product-1',
        name: 'Test Laptop',
        description: 'Test laptop description',
        price: new Prisma.Decimal(1000),
        stock: 5,
        imageUrl: null,
        categoryId: 'cat-1',
        status: ProductStatus.ACTIVE,
        type: ProductType.FIXED_PRICE,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const mockCartItem: MockCartItem = {
        id: 'item-1',
        cartId: 'cart-1',
        productId: 'product-1',
        quantity: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        product: mockProduct,
    };

    const mockCartItemWithCart: MockCartItemWithCart = {
        ...mockCartItem,
        cart: mockCart,
    };

    const mockPrismaService: MockPrisma = {
        cart: {
            findUnique: jest.fn<Promise<MockCart | null>, [FindUniqueArgs]>(),
            create: jest.fn<Promise<MockCart>, [CreateCartArgs]>(),
        },

        cartItem: {
            findMany: jest.fn<Promise<MockCartItem[]>, [FindUniqueArgs]>(),

            findUnique: jest.fn<
                Promise<MockCartItemWithCart | null>,
                [FindUniqueArgs]
            >(),

            create: jest.fn<Promise<MockCartItem>, [CreateCartItemArgs]>(),

            update: jest.fn<Promise<MockCartItem>, [UpdateCartItemArgs]>(),

            delete: jest.fn<Promise<MockCartItem>, [DeleteCartItemArgs]>(),

            deleteMany: jest.fn<
                Promise<DeleteManyResult>,
                [DeleteManyCartItemArgs]
            >(),
        },

        product: {
            findUnique: jest.fn<
                Promise<MockProduct | null>,
                [FindUniqueArgs]
            >(),
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CartService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
            ],
        }).compile();

        service = module.get<CartService>(CartService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('getCart', () => {
        it('should return existing cart items and total sum', async () => {
            mockPrismaService.cart.findUnique.mockResolvedValue(mockCart);

            mockPrismaService.cartItem.findMany.mockResolvedValue([
                mockCartItem,
            ]);

            const result = await service.getCart('user-1');

            expect(mockPrismaService.cart.findUnique).toHaveBeenCalledWith({
                where: {
                    userId: 'user-1',
                },
            });

            expect(result).toEqual({
                cartId: 'cart-1',
                items: [mockCartItem],
                total: 2000,
            });
        });

        it('should create new cart if it does not exist', async () => {
            mockPrismaService.cart.findUnique.mockResolvedValue(null);

            mockPrismaService.cart.create.mockResolvedValue(mockCart);

            mockPrismaService.cartItem.findMany.mockResolvedValue([]);

            const result = await service.getCart('user-1');

            expect(mockPrismaService.cart.create).toHaveBeenCalledWith({
                data: {
                    userId: 'user-1',
                },
            });

            expect(result).toEqual({
                cartId: 'cart-1',
                items: [],
                total: 0,
            });
        });
    });

    describe('addItem', () => {
        it('should throw NotFoundException if product is not found', async () => {
            mockPrismaService.product.findUnique.mockResolvedValue(null);

            await expect(
                service.addItem('user-1', {
                    productId: 'invalid',
                    quantity: 1,
                }),
            ).rejects.toThrow(NotFoundException);
        });

        it('should throw BadRequestException if requested quantity exceeds stock', async () => {
            mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);

            mockPrismaService.cart.findUnique.mockResolvedValue(mockCart);

            mockPrismaService.cartItem.findUnique.mockResolvedValue(null);

            await expect(
                service.addItem('user-1', {
                    productId: 'product-1',
                    quantity: 10,
                }),
            ).rejects.toThrow(BadRequestException);
        });

        it('should create new item in cart if not exists', async () => {
            mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);

            mockPrismaService.cart.findUnique.mockResolvedValue(mockCart);

            mockPrismaService.cartItem.findUnique.mockResolvedValue(null);

            mockPrismaService.cartItem.create.mockResolvedValue(mockCartItem);

            const result = await service.addItem('user-1', {
                productId: 'product-1',
                quantity: 2,
            });

            expect(mockPrismaService.cartItem.create).toHaveBeenCalledWith({
                data: {
                    cartId: 'cart-1',
                    productId: 'product-1',
                    quantity: 2,
                },
                include: {
                    product: true,
                },
            });

            expect(result).toEqual(mockCartItem);
        });

        it('should update quantity if item already in cart', async () => {
            mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);

            mockPrismaService.cart.findUnique.mockResolvedValue(mockCart);

            mockPrismaService.cartItem.findUnique.mockResolvedValue(
                mockCartItemWithCart,
            );

            const updatedItem: MockCartItem = {
                ...mockCartItem,
                quantity: 4,
            };

            mockPrismaService.cartItem.update.mockResolvedValue(updatedItem);

            const result = await service.addItem('user-1', {
                productId: 'product-1',
                quantity: 2,
            });

            expect(mockPrismaService.cartItem.update).toHaveBeenCalledWith({
                where: {
                    id: 'item-1',
                },
                data: {
                    quantity: 4,
                },
                include: {
                    product: true,
                },
            });

            expect(result.quantity).toBe(4);
        });
    });

    describe('updateItem', () => {
        it('should throw NotFoundException if item does not belong to user', async () => {
            const itemFromOtherUser: MockCartItemWithCart = {
                ...mockCartItemWithCart,
                cart: {
                    ...mockCart,
                    userId: 'other-user',
                },
            };

            mockPrismaService.cartItem.findUnique.mockResolvedValue(
                itemFromOtherUser,
            );

            await expect(
                service.updateItem('user-1', 'item-1', {
                    quantity: 3,
                }),
            ).rejects.toThrow(NotFoundException);
        });

        it('should throw BadRequestException if new quantity exceeds stock', async () => {
            mockPrismaService.cartItem.findUnique.mockResolvedValue(
                mockCartItemWithCart,
            );

            await expect(
                service.updateItem('user-1', 'item-1', {
                    quantity: 10,
                }),
            ).rejects.toThrow(BadRequestException);
        });

        it('should update item quantity successfully', async () => {
            mockPrismaService.cartItem.findUnique.mockResolvedValue(
                mockCartItemWithCart,
            );

            const updatedItem: MockCartItem = {
                ...mockCartItem,
                quantity: 4,
            };

            mockPrismaService.cartItem.update.mockResolvedValue(updatedItem);

            const result = await service.updateItem('user-1', 'item-1', {
                quantity: 4,
            });

            expect(mockPrismaService.cartItem.update).toHaveBeenCalledWith({
                where: {
                    id: 'item-1',
                },
                data: {
                    quantity: 4,
                },
                include: {
                    product: true,
                },
            });

            expect(result.quantity).toBe(4);
        });
    });

    describe('removeItem', () => {
        it('should remove item from cart', async () => {
            mockPrismaService.cartItem.findUnique.mockResolvedValue(
                mockCartItemWithCart,
            );

            mockPrismaService.cartItem.delete.mockResolvedValue(mockCartItem);

            const result = await service.removeItem('user-1', 'item-1');

            expect(mockPrismaService.cartItem.delete).toHaveBeenCalledWith({
                where: {
                    id: 'item-1',
                },
            });

            expect(result).toEqual({
                success: true,
            });
        });
    });

    describe('clearCart', () => {
        it('should delete all items from user cart', async () => {
            mockPrismaService.cart.findUnique.mockResolvedValue(mockCart);

            mockPrismaService.cartItem.deleteMany.mockResolvedValue({
                count: 2,
            });

            const result = await service.clearCart('user-1');

            expect(mockPrismaService.cartItem.deleteMany).toHaveBeenCalledWith({
                where: {
                    cartId: 'cart-1',
                },
            });

            expect(result).toEqual({
                success: true,
            });
        });
    });
});
