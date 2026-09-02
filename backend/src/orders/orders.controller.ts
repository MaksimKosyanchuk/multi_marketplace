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
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
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
    ): ReturnType<OrdersService['payOrder']> {
        return this.ordersService.payOrder(req.user.id, id);
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

    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @Patch(':id/status')
    @ApiOperation({
        summary: 'Изменить статус заказа (Только ADMIN)',
    })
    @ApiParam({
        name: 'id',
        description: 'ID заказа',
        example: 'ord_789ghi',
    })
    @ApiResponse({
        status: 200,
        description: 'Статус заказа обновлен',
        type: OrderResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Невалидный статус',
    })
    @ApiResponse({
        status: 401,
        description: 'Неавторизован',
    })
    @ApiResponse({
        status: 403,
        description: 'Доступ запрещен',
    })
    @ApiResponse({
        status: 404,
        description: 'Заказ не найден',
    })
    updateStatus(
        @Param('id') id: string,
        @Body() dto: UpdateOrderStatusDto,
    ): ReturnType<OrdersService['updateStatus']> {
        return this.ordersService.updateStatus(id, dto);
    }
}
