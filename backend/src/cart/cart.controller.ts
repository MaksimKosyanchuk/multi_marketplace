import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiParam,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartResponseDto, CartItemDto } from './dto/cart-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Cart')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
    constructor(private readonly cartService: CartService) {}

    @Get()
    @ApiOperation({ summary: 'Получить корзину текущего пользователя' })
    @ApiResponse({
        status: 200,
        description: 'Данные корзины успешно получены',
        type: CartResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    getCart(@Req() req: Request & { user: { id: string } }) {
        return this.cartService.getCart(req.user.id);
    }

    @Post('items')
    @ApiOperation({ summary: 'Добавить товар в корзину' })
    @ApiResponse({
        status: 201,
        description: 'Товар успешно добавлен в корзину',
        type: CartItemDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Невалидный UUID или количество < 1',
    })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 404, description: 'Товар с таким ID не найден' })
    addItem(
        @Req() req: Request & { user: { id: string } },
        @Body() dto: AddToCartDto,
    ) {
        return this.cartService.addItem(req.user.id, dto);
    }

    @Patch('items/:id')
    @ApiOperation({ summary: 'Изменить количество товара в корзине' })
    @ApiParam({
        name: 'id',
        description: 'ID элемента корзины (CartItem ID)',
        example: 'b5f928c1-1234-5678-9abc-def123456789',
    })
    @ApiResponse({
        status: 200,
        description: 'Количество товара успешно обновлено',
        type: CartItemDto,
    })
    @ApiResponse({ status: 400, description: 'Невалидные данные' })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 404, description: 'Элемент корзины не найден' })
    updateItem(
        @Req() req: Request & { user: { id: string } },
        @Param('id') id: string,
        @Body() dto: UpdateCartItemDto,
    ) {
        return this.cartService.updateItem(req.user.id, id, dto);
    }

    @Delete('items/:id')
    @ApiOperation({ summary: 'Удалить конкретный товар из корзины' })
    @ApiParam({
        name: 'id',
        description: 'ID элемента корзины (CartItem ID)',
        example: 'b5f928c1-1234-5678-9abc-def123456789',
    })
    @ApiResponse({
        status: 200,
        description: 'Элемент удален из корзины',
    })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 404, description: 'Элемент корзины не найден' })
    removeItem(
        @Req() req: Request & { user: { id: string } },
        @Param('id') id: string,
    ) {
        return this.cartService.removeItem(req.user.id, id);
    }

    @Delete()
    @ApiOperation({ summary: 'Очистить всю корзину' })
    @ApiResponse({
        status: 200,
        description: 'Корзина успешно очищена',
    })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    clearCart(@Req() req: Request & { user: { id: string } }) {
        return this.cartService.clearCart(req.user.id);
    }
}
