import {
    Body,
    Controller,
    Get,
    Headers,
    Param,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { BiddingService } from './bidding.service';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { PlaceBidDto } from './dto/place-bid.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Auctions')
@Controller('auctions')
export class BiddingController {
    constructor(private readonly biddingService: BiddingService) {}

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER)
    @Post()
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({
        summary: 'Создать аукцион для собственного AUCTION товара',
    })
    @ApiBody({ type: CreateAuctionDto })
    @ApiResponse({ status: 201, description: 'Аукцион создан' })
    @ApiResponse({ status: 400, description: 'Невалидные данные' })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 403, description: 'Требуется роль SELLER' })
    create(
        @Req() req: Request & { user: { id: string } },
        @Body() dto: CreateAuctionDto,
    ) {
        return this.biddingService.createAuction(req.user.id, dto);
    }

    @UseGuards(JwtAuthGuard)
    @Get('mine/created')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Получить созданные текущим пользователем аукционы' })
    @ApiResponse({ status: 200, description: 'Список аукционов' })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    getMyAuctions(@Req() req: Request & { user: { id: string } }) {
        return this.biddingService.findCreatedAuctions(req.user.id);
    }

    @UseGuards(JwtAuthGuard)
    @Get('mine/participating')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Получить аукционы, в которых участвует пользователь' })
    @ApiResponse({ status: 200, description: 'Список аукционов' })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    getParticipatingAuctions(@Req() req: Request & { user: { id: string } }) {
        return this.biddingService.findParticipatingAuctions(req.user.id);
    }

    @Get(':auctionId')
    @ApiOperation({ summary: 'Получить аукцион и историю ставок' })
    @ApiParam({ name: 'auctionId', description: 'ID аукциона' })
    @ApiResponse({ status: 200, description: 'Аукцион и ставки' })
    @ApiResponse({ status: 404, description: 'Аукцион не найден' })
    findOne(@Param('auctionId') auctionId: string) {
        return this.biddingService.findAuction(auctionId);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.CUSTOMER)
    @Post(':auctionId/bids')
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Сделать ставку с idempotency key' })
    @ApiParam({ name: 'auctionId', description: 'ID аукциона' })
    @ApiHeader({ name: 'idempotency-key', required: false })
    @ApiBody({ type: PlaceBidDto })
    @ApiResponse({ status: 201, description: 'Ставка принята' })
    @ApiResponse({ status: 400, description: 'Невалидная ставка' })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 403, description: 'Требуется роль CUSTOMER' })
    @ApiResponse({ status: 404, description: 'Аукцион не найден' })
    placeBid(
        @Req() req: Request & { user: { id: string } },
        @Param('auctionId') auctionId: string,
        @Headers('idempotency-key') idempotencyKey: string | undefined,
        @Body() dto: PlaceBidDto,
    ) {
        return this.biddingService.placeBid(
            req.user.id,
            auctionId,
            dto.amount,
            idempotencyKey ?? '',
        );
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.CUSTOMER)
    @Post(':auctionId/checkout')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Создать заказ победителя аукциона' })
    @ApiParam({ name: 'auctionId', description: 'ID аукциона' })
    @ApiHeader({ name: 'idempotency-key', required: false })
    @ApiResponse({ status: 201, description: 'Заказ создан' })
    @ApiResponse({ status: 400, description: 'Аукцион нельзя оформить' })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 403, description: 'Требуется роль CUSTOMER' })
    @ApiResponse({ status: 404, description: 'Аукцион не найден' })
    checkoutWinner(
        @Req() req: Request & { user: { id: string } },
        @Param('auctionId') auctionId: string,
        @Headers('idempotency-key') idempotencyKey: string | undefined,
    ) {
        return this.biddingService.checkoutWinner(
            req.user.id,
            auctionId,
            idempotencyKey ?? '',
        );
    }
}
