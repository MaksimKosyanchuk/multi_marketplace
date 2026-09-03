import { Test, TestingModule } from '@nestjs/testing';
import { Role, SellerOrderStatus } from '@prisma/client';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersGateway } from './orders.geteway';
import { QueryOrderDto } from './dto/query-order.dto';
import { UpdateSellerOrderStatusDto } from './dto/update-seller-order-status.dto';

interface RequestWithUser {
    user: {
        id: string;
        role: Role;
    };
}

describe('OrdersController', () => {
    let controller: OrdersController;

    const checkoutMock = jest.fn<
        ReturnType<OrdersService['checkout']>,
        Parameters<OrdersService['checkout']>
    >();
    const payOrderMock = jest.fn<
        ReturnType<OrdersService['payOrder']>,
        Parameters<OrdersService['payOrder']>
    >();
    const cancelOrderMock = jest.fn<
        ReturnType<OrdersService['cancelOrder']>,
        Parameters<OrdersService['cancelOrder']>
    >();
    const findMyOrdersMock = jest.fn<
        ReturnType<OrdersService['findMyOrders']>,
        Parameters<OrdersService['findMyOrders']>
    >();
    const findOneMock = jest.fn<
        ReturnType<OrdersService['findOne']>,
        Parameters<OrdersService['findOne']>
    >();
    const findAllMock = jest.fn<
        ReturnType<OrdersService['findAll']>,
        Parameters<OrdersService['findAll']>
    >();
    const findMySellerOrdersMock = jest.fn<
        ReturnType<OrdersService['findMySellerOrders']>,
        Parameters<OrdersService['findMySellerOrders']>
    >();
    const findSellerOrderMock = jest.fn<
        ReturnType<OrdersService['findSellerOrder']>,
        Parameters<OrdersService['findSellerOrder']>
    >();
    const updateSellerOrderStatusMock = jest.fn<
        ReturnType<OrdersService['updateSellerOrderStatus']>,
        Parameters<OrdersService['updateSellerOrderStatus']>
    >();

    const mockOrdersService: Pick<
        OrdersService,
        | 'checkout'
        | 'payOrder'
        | 'cancelOrder'
        | 'findMyOrders'
        | 'findOne'
        | 'findAll'
        | 'findMySellerOrders'
        | 'findSellerOrder'
        | 'updateSellerOrderStatus'
    > = {
        checkout: checkoutMock,
        payOrder: payOrderMock,
        cancelOrder: cancelOrderMock,
        findMyOrders: findMyOrdersMock,
        findOne: findOneMock,
        findAll: findAllMock,
        findMySellerOrders: findMySellerOrdersMock,
        findSellerOrder: findSellerOrderMock,
        updateSellerOrderStatus: updateSellerOrderStatusMock,
    };

    const mockUserReq: RequestWithUser = {
        user: {
            id: 'user-1',
            role: Role.CUSTOMER,
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [OrdersController],
            providers: [
                {
                    provide: OrdersService,
                    useValue: mockOrdersService,
                },
                {
                    provide: OrdersGateway,
                    useValue: { emitOrderStatusUpdate: jest.fn() },
                },
            ],
        }).compile();

        controller = module.get<OrdersController>(OrdersController);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('checkout', () => {
        it('should pass the idempotency key through to checkout', async () => {
            await controller.checkout(mockUserReq, 'checkout-1');

            expect(checkoutMock).toHaveBeenCalledWith('user-1', 'checkout-1');
            expect(checkoutMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('payOrder', () => {
        it('should call ordersService.payOrder with user id and order id', async () => {
            await controller.payOrder(mockUserReq, 'order-1');

            expect(payOrderMock).toHaveBeenCalledWith('user-1', 'order-1', '');
            expect(payOrderMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('cancelOrder', () => {
        it('should call ordersService.cancelOrder with user id and order id', async () => {
            await controller.cancelOrder(mockUserReq, 'order-1');

            expect(cancelOrderMock).toHaveBeenCalledWith('user-1', 'order-1');
            expect(cancelOrderMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('findMyOrders', () => {
        it('should call ordersService.findMyOrders with user id', async () => {
            await controller.findMyOrders(mockUserReq);

            expect(findMyOrdersMock).toHaveBeenCalledWith('user-1');
            expect(findMyOrdersMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('findOne', () => {
        it('should call ordersService.findOne with user id, role and order id', async () => {
            await controller.findOne(mockUserReq, 'order-1');

            expect(findOneMock).toHaveBeenCalledWith(
                'user-1',
                Role.CUSTOMER,
                'order-1',
            );
            expect(findOneMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('findAll', () => {
        it('should call ordersService.findAll with query', async () => {
            const queryDto: QueryOrderDto = {
                page: 1,
                limit: 10,
            };

            await controller.findAll(queryDto);

            expect(findAllMock).toHaveBeenCalledWith(queryDto);
            expect(findAllMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('seller orders', () => {
        const sellerReq: RequestWithUser = {
            user: { id: 'seller-1', role: Role.SELLER },
        };

        it('scopes seller order listing to the authenticated seller', async () => {
            await controller.findMySellerOrders(sellerReq);
            expect(findMySellerOrdersMock).toHaveBeenCalledWith('seller-1');
        });

        it('passes the authenticated seller and transition command to the service', async () => {
            const dto: UpdateSellerOrderStatusDto = {
                status: SellerOrderStatus.SHIPPED,
                trackingNumber: 'UA123',
            };
            await controller.updateSellerOrderStatus(sellerReq, 'seller-order-1', dto);
            expect(updateSellerOrderStatusMock).toHaveBeenCalledWith(
                'seller-1',
                'seller-order-1',
                dto,
            );
        });
    });
});
