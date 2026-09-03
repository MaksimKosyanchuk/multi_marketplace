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
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Cart')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
    constructor(private readonly cartService: CartService) {}

    @Get()
    @ApiOperation({ summary: 'Get the current user cart' })
    @ApiResponse({
        status: 200,
        description: 'Cart data retrieved successfully',
        type: CartResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    getCart(@Req() req: Request & { user: { id: string } }) {
        return this.cartService.getCart(req.user.id);
    }

    @Post('items')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.CUSTOMER)
    @ApiOperation({ summary: 'Add a product to the cart' })
    @ApiResponse({
        status: 201,
        description: 'Product added to cart successfully',
        type: CartItemDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid UUID or quantity less than 1',
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Product with the specified ID was not found' })
    addItem(
        @Req() req: Request & { user: { id: string } },
        @Body() dto: AddToCartDto,
    ) {
        return this.cartService.addItem(req.user.id, dto);
    }

    @Patch('items/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.CUSTOMER)
    @ApiOperation({ summary: 'Update product quantity in the cart' })
    @ApiParam({
        name: 'id',
        description: 'Cart item ID',
        example: 'b5f928c1-1234-5678-9abc-def123456789',
    })
    @ApiResponse({
        status: 200,
        description: 'Product quantity updated successfully',
        type: CartItemDto,
    })
    @ApiResponse({ status: 400, description: 'Invalid data' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Cart item was not found' })
    updateItem(
        @Req() req: Request & { user: { id: string } },
        @Param('id') id: string,
        @Body() dto: UpdateCartItemDto,
    ) {
        return this.cartService.updateItem(req.user.id, id, dto);
    }

    @Delete('items/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.CUSTOMER)
    @ApiOperation({ summary: 'Remove a specific product from the cart' })
    @ApiParam({
        name: 'id',
        description: 'Cart item ID',
        example: 'b5f928c1-1234-5678-9abc-def123456789',
    })
    @ApiResponse({
        status: 200,
        description: 'Cart item removed successfully',
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Cart item was not found' })
    removeItem(
        @Req() req: Request & { user: { id: string } },
        @Param('id') id: string,
    ) {
        return this.cartService.removeItem(req.user.id, id);
    }

    @Delete()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.CUSTOMER)
    @ApiOperation({ summary: 'Clear the entire cart' })
    @ApiResponse({
        status: 200,
        description: 'Cart cleared successfully',
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    clearCart(@Req() req: Request & { user: { id: string } }) {
        return this.cartService.clearCart(req.user.id);
    }
}
