import {
    Body,
    Controller,
    Get,
    Headers,
    Param,
    Patch,
    Post,
    Req,
    UseGuards,
    Query,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiParam,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { OrdersService } from './orders.service';
import { UpdateSellerOrderStatusDto } from './dto/update-seller-order-status.dto';
import { CancelSellerOrderDto } from './dto/cancel-seller-order.dto';
import { RefundOrderItemDto } from './dto/refund-order-item.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { QueryOrderDto } from './dto/query-order.dto';
import {
    OrderResponseDto,
    PaginatedOrdersResponseDto,
} from './dto/order-response.dto';

@ApiTags('Orders')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) {}

    @Post('checkout')
    @ApiOperation({
        summary: 'Оформить заказ из текущей корзины пользователя',
    })
    @ApiResponse({
        status: 201,
        description: 'Заказ успешно создан, корзина очищена',
        type: OrderResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Корзина пуста',
    })
    @ApiResponse({
        status: 401,
        description: 'Неавторизован',
    })
    checkout(
        @Req() req: Request & { user: { id: string } },
        @Headers('idempotency-key') idempotencyKey: string | undefined,
    ): ReturnType<OrdersService['checkout']> {
        return this.ordersService.checkout(req.user.id, idempotencyKey ?? '');
    }

    @Post(':id/pay')
    @ApiOperation({
        summary: 'Оплатить заказ по ID',
    })
    @ApiParam({
        name: 'id',
        description: 'ID заказа',
        example: 'ord_789ghi',
    })
    @ApiResponse({
        status: 200,
        description: 'Статус заказа обновлен (Оплачен)',
        type: OrderResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Нельзя оплатить заказ в текущем статусе',
    })
    @ApiResponse({
        status: 401,
        description: 'Неавторизован',
    })
    @ApiResponse({
        status: 404,
        description: 'Заказ не найден',
    })
    payOrder(
        @Req() req: Request & { user: { id: string } },
        @Param('id') id: string,
        @Headers('idempotency-key') idempotencyKey: string | undefined,
    ): ReturnType<OrdersService['payOrder']> {
        return this.ordersService.payOrder(
            req.user.id,
            id,
            idempotencyKey ?? '',
        );
    }

    @Post(':id/payment/cancel')
    @ApiOperation({ summary: 'Отменить pending mock-платеж и заказ' })
    cancelPayment(
        @Req() req: Request & { user: { id: string } },
        @Param('id') id: string,
        @Headers('idempotency-key') idempotencyKey: string | undefined,
    ): ReturnType<OrdersService['cancelPayment']> {
        return this.ordersService.cancelPayment(
            req.user.id,
            id,
            idempotencyKey ?? '',
        );
    }

    @Post(':id/cancel')
    @ApiOperation({
        summary: 'Отменить заказ по ID',
    })
    @ApiParam({
        name: 'id',
        description: 'ID заказа',
        example: 'ord_789ghi',
    })
    @ApiResponse({
        status: 200,
        description: 'Заказ успешно отменен',
        type: OrderResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Нельзя отменить выполняемый или уже завершенный заказ',
    })
    @ApiResponse({
        status: 401,
        description: 'Неавторизован',
    })
    @ApiResponse({
        status: 404,
        description: 'Заказ не найден',
    })
    cancelOrder(
        @Req() req: Request & { user: { id: string } },
        @Param('id') id: string,
    ): ReturnType<OrdersService['cancelOrder']> {
        return this.ordersService.cancelOrder(req.user.id, id);
    }

    @Get('my')
    @ApiOperation({
        summary: 'Получить историю заказов текущего пользователя',
    })
    @ApiResponse({
        status: 200,
        description: 'Список заказов пользователя',
        type: [OrderResponseDto],
    })
    @ApiResponse({
        status: 401,
        description: 'Неавторизован',
    })
    findMyOrders(
        @Req() req: Request & { user: { id: string } },
    ): ReturnType<OrdersService['findMyOrders']> {
        return this.ordersService.findMyOrders(req.user.id);
    }

    @UseGuards(RolesGuard)
    @Roles(Role.SELLER)
    @Get('seller/me')
    @ApiOperation({ summary: 'Получить sub-заказы текущего продавца' })
    findMySellerOrders(
        @Req() req: Request & { user: { id: string } },
    ): ReturnType<OrdersService['findMySellerOrders']> {
        return this.ordersService.findMySellerOrders(req.user.id);
    }

    @UseGuards(RolesGuard)
    @Roles(Role.SELLER)
    @Get('seller/:sellerOrderId')
    @ApiOperation({ summary: 'Получить свой sub-заказ продавца' })
    findSellerOrder(
        @Req() req: Request & { user: { id: string } },
        @Param('sellerOrderId') sellerOrderId: string,
    ): ReturnType<OrdersService['findSellerOrder']> {
        return this.ordersService.findSellerOrder(req.user.id, sellerOrderId);
    }

    @UseGuards(RolesGuard)
    @Roles(Role.SELLER)
    @Patch('seller/:sellerOrderId/status')
    @ApiOperation({ summary: 'Изменить статус своего sub-заказа' })
    updateSellerOrderStatus(
        @Req() req: Request & { user: { id: string } },
        @Param('sellerOrderId') sellerOrderId: string,
        @Body() dto: UpdateSellerOrderStatusDto,
    ): ReturnType<OrdersService['updateSellerOrderStatus']> {
        return this.ordersService.updateSellerOrderStatus(
            req.user.id,
            sellerOrderId,
            dto,
        );
    }

    @UseGuards(RolesGuard)
    @Roles(Role.SELLER)
    @Post('seller/:sellerOrderId/cancel')
    @ApiOperation({ summary: 'Отменить свой sub-заказ с возвратом средств' })
    cancelSellerOrder(
        @Req() req: Request & { user: { id: string } },
        @Param('sellerOrderId') sellerOrderId: string,
        @Headers('idempotency-key') idempotencyKey: string | undefined,
        @Body() dto: CancelSellerOrderDto,
    ): ReturnType<OrdersService['cancelSellerOrder']> {
        return this.ordersService.cancelSellerOrder(
            req.user.id,
            sellerOrderId,
            idempotencyKey ?? '',
            dto.reason,
        );
    }

    @Post('items/:orderItemId/refund')
    @ApiOperation({ summary: 'Вернуть часть количества конкретного товара' })
    refundOrderItem(
        @Req() req: Request & { user: { id: string } },
        @Param('orderItemId') orderItemId: string,
        @Headers('idempotency-key') idempotencyKey: string | undefined,
        @Body() dto: RefundOrderItemDto,
    ): ReturnType<OrdersService['refundOrderItem']> {
        return this.ordersService.refundOrderItem(
            req.user.id,
            orderItemId,
            dto.quantity,
            dto.reason,
            idempotencyKey ?? '',
        );
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Получить детальную информацию о заказе',
    })
    @ApiParam({
        name: 'id',
        description: 'ID заказа',
        example: 'ord_789ghi',
    })
    @ApiResponse({
        status: 200,
        description: 'Данные о заказе получены',
        type: OrderResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: 'Неавторизован',
    })
    @ApiResponse({
        status: 403,
        description: 'Доступ к чужому заказу запрещен',
    })
    @ApiResponse({
        status: 404,
        description: 'Заказ не найден',
    })
    findOne(
        @Req()
        req: Request & {
            user: { id: string; role: Role };
        },
        @Param('id') id: string,
    ): ReturnType<OrdersService['findOne']> {
        return this.ordersService.findOne(req.user.id, req.user.role, id);
    }

    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @Get()
    @ApiOperation({
        summary: 'Получить список всех заказов в системе (Только ADMIN)',
    })
    @ApiResponse({
        status: 200,
        description: 'Пагинированный список заказов',
        type: PaginatedOrdersResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: 'Неавторизован',
    })
    @ApiResponse({
        status: 403,
        description: 'Доступ запрещен (Требуется роль ADMIN)',
    })
    findAll(
        @Query() query: QueryOrderDto,
    ): ReturnType<OrdersService['findAll']> {
        return this.ordersService.findAll(query);
    }
}
