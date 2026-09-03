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
    ApiBody,
    ApiHeader,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { OrdersService } from './orders.service';
import { OrdersGateway } from './orders.geteway';
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
    constructor(
        private readonly ordersService: OrdersService,
        private readonly ordersGateway: OrdersGateway,
    ) {}

    @Post('checkout')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.CUSTOMER)
    @ApiOperation({
        summary: 'Create an order from the current user cart',
    })
    @ApiHeader({ name: 'idempotency-key', required: false })
    @ApiResponse({
        status: 201,
        description: 'Order created successfully; cart cleared',
        type: OrderResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Cart is empty',
    })
    @ApiResponse({
        status: 401,
        description: 'Unauthorized',
    })
    checkout(
        @Req() req: Request & { user: { id: string } },
        @Headers('idempotency-key') idempotencyKey: string | undefined,
    ): ReturnType<OrdersService['checkout']> {
        return this.ordersService.checkout(req.user.id, idempotencyKey ?? '');
    }

    @Post(':id/pay')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.CUSTOMER)
    @ApiOperation({
        summary: 'Pay for an order by ID',
    })
    @ApiParam({
        name: 'id',
        description: 'Order ID',
        example: 'ord_789ghi',
    })
    @ApiResponse({
        status: 200,
        description: 'Order status updated (paid)',
        type: OrderResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'The order cannot be paid in its current status',
    })
    @ApiResponse({
        status: 401,
        description: 'Unauthorized',
    })
    @ApiResponse({
        status: 404,
        description: 'Order was not found',
    })
    payOrder(
        @Req() req: Request & { user: { id: string } },
        @Param('id') id: string,
        @Headers('idempotency-key') idempotencyKey: string | undefined,
    ): ReturnType<OrdersService['payOrder']> {
        this.ordersGateway.emitOrderStatusUpdate(
            req.user.id,
            id,
            'PAYMENT_PENDING',
        );
        return this.ordersService.payOrder(
            req.user.id,
            id,
            idempotencyKey ?? '',
        );
    }

    @Post(':id/payment/cancel')
    @ApiOperation({ summary: 'Cancel a pending mock payment and order' })
    @ApiParam({ name: 'id', description: 'Order ID' })
    @ApiHeader({ name: 'idempotency-key', required: false })
    @ApiResponse({
        status: 200,
        description: 'Payment cancelled',
        type: OrderResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Order was not found' })
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
        summary: 'Cancel an order by ID',
    })
    @ApiParam({
        name: 'id',
        description: 'Order ID',
        example: 'ord_789ghi',
    })
    @ApiResponse({
        status: 200,
        description: 'Order cancelled successfully',
        type: OrderResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'An in-progress or completed order cannot be cancelled',
    })
    @ApiResponse({
        status: 401,
        description: 'Unauthorized',
    })
    @ApiResponse({
        status: 404,
        description: 'Order was not found',
    })
    cancelOrder(
        @Req() req: Request & { user: { id: string } },
        @Param('id') id: string,
    ): ReturnType<OrdersService['cancelOrder']> {
        return this.ordersService.cancelOrder(req.user.id, id);
    }

    @Get('my')
    @ApiOperation({
        summary: 'Get the current user order history',
    })
    @ApiResponse({
        status: 200,
        description: 'User order list',
        type: [OrderResponseDto],
    })
    @ApiResponse({
        status: 401,
        description: 'Unauthorized',
    })
    findMyOrders(
        @Req() req: Request & { user: { id: string } },
    ): ReturnType<OrdersService['findMyOrders']> {
        return this.ordersService.findMyOrders(req.user.id);
    }

    @Get('resync')
    @ApiOperation({ summary: 'REST-resync orders after a WebSocket reconnect' })
    @ApiResponse({
        status: 200,
        description: 'Current user orders',
        type: [OrderResponseDto],
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    resyncOrders(
        @Req() req: Request & { user: { id: string } },
    ): ReturnType<OrdersService['findMyOrders']> {
        return this.ordersService.findMyOrders(req.user.id);
    }

    @UseGuards(RolesGuard)
    @Roles(Role.SELLER)
    @Get('seller/me')
    @ApiOperation({ summary: 'Get sub-orders for the current seller' })
    @ApiResponse({ status: 200, description: 'Seller sub-orders' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'SELLER role required' })
    findMySellerOrders(
        @Req() req: Request & { user: { id: string } },
    ): ReturnType<OrdersService['findMySellerOrders']> {
        return this.ordersService.findMySellerOrders(req.user.id);
    }

    @UseGuards(RolesGuard)
    @Roles(Role.SELLER)
    @Get('seller/:sellerOrderId')
    @ApiOperation({
        summary: 'Get a seller sub-order owned by the current seller',
    })
    @ApiParam({ name: 'sellerOrderId', description: 'Sub-order ID' })
    @ApiResponse({ status: 200, description: 'Seller sub-order' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'SELLER role required' })
    @ApiResponse({ status: 404, description: 'Sub-order was not found' })
    findSellerOrder(
        @Req() req: Request & { user: { id: string } },
        @Param('sellerOrderId') sellerOrderId: string,
    ): ReturnType<OrdersService['findSellerOrder']> {
        return this.ordersService.findSellerOrder(req.user.id, sellerOrderId);
    }

    @UseGuards(RolesGuard)
    @Roles(Role.SELLER)
    @Patch('seller/:sellerOrderId/status')
    @ApiOperation({ summary: 'Update the status of a seller sub-order' })
    @ApiParam({ name: 'sellerOrderId', description: 'Sub-order ID' })
    @ApiBody({ type: UpdateSellerOrderStatusDto })
    @ApiResponse({ status: 200, description: 'Status updated' })
    @ApiResponse({ status: 400, description: 'Invalid status' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'SELLER role required' })
    @ApiResponse({ status: 404, description: 'Sub-order was not found' })
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
    @ApiOperation({ summary: 'Cancel a seller sub-order with a refund' })
    @ApiParam({ name: 'sellerOrderId', description: 'Sub-order ID' })
    @ApiHeader({ name: 'idempotency-key', required: false })
    @ApiBody({ type: CancelSellerOrderDto })
    @ApiResponse({ status: 200, description: 'Sub-order cancelled' })
    @ApiResponse({ status: 400, description: 'Cancellation is not allowed' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'SELLER role required' })
    @ApiResponse({ status: 404, description: 'Sub-order was not found' })
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

    @UseGuards(RolesGuard)
    @Roles(Role.CUSTOMER)
    @Post('suborders/:sellerOrderId/cancel')
    @ApiOperation({
        summary: 'Cancel a sub-order as the customer with a refund',
    })
    @ApiParam({ name: 'sellerOrderId', description: 'Sub-order ID' })
    @ApiHeader({ name: 'idempotency-key', required: false })
    @ApiBody({ type: CancelSellerOrderDto })
    @ApiResponse({ status: 200, description: 'Sub-order cancelled' })
    @ApiResponse({ status: 400, description: 'Cancellation is not allowed' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'CUSTOMER role required' })
    @ApiResponse({ status: 404, description: 'Sub-order was not found' })
    cancelCustomerSuborder(
        @Req() req: Request & { user: { id: string } },
        @Param('sellerOrderId') sellerOrderId: string,
        @Headers('idempotency-key') idempotencyKey: string | undefined,
        @Body() dto: CancelSellerOrderDto,
    ): ReturnType<OrdersService['cancelCustomerSuborder']> {
        return this.ordersService.cancelCustomerSuborder(
            req.user.id,
            sellerOrderId,
            idempotencyKey ?? '',
            dto.reason,
        );
    }

    @Post('items/:orderItemId/refund')
    @ApiOperation({ summary: 'Refund part of a specific order item quantity' })
    @ApiParam({ name: 'orderItemId', description: 'Order item ID' })
    @ApiHeader({ name: 'idempotency-key', required: false })
    @ApiBody({ type: RefundOrderItemDto })
    @ApiResponse({ status: 200, description: 'Refund processed' })
    @ApiResponse({ status: 400, description: 'Invalid quantity or status' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Order item was not found' })
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
        summary: 'Get detailed order information',
    })
    @ApiParam({
        name: 'id',
        description: 'Order ID',
        example: 'ord_789ghi',
    })
    @ApiResponse({
        status: 200,
        description: 'Order data retrieved successfully',
        type: OrderResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: 'Unauthorized',
    })
    @ApiResponse({
        status: 403,
        description: 'Access to another user order is forbidden',
    })
    @ApiResponse({
        status: 404,
        description: 'Order was not found',
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
        summary: 'Get all orders in the system (ADMIN only)',
    })
    @ApiResponse({
        status: 200,
        description: 'Paginated order list',
        type: PaginatedOrdersResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: 'Unauthorized',
    })
    @ApiResponse({
        status: 403,
        description: 'Forbidden (ADMIN role required)',
    })
    findAll(
        @Query() query: QueryOrderDto,
    ): ReturnType<OrdersService['findAll']> {
        return this.ordersService.findAll(query);
    }
}
