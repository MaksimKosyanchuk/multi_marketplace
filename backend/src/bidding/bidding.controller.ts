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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { BiddingService } from './bidding.service';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { PlaceBidDto } from './dto/place-bid.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

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
    create(
        @Req() req: Request & { user: { id: string } },
        @Body() dto: CreateAuctionDto,
    ) {
        return this.biddingService.createAuction(req.user.id, dto);
    }

    @Get(':auctionId')
    @ApiOperation({ summary: 'Получить аукцион и историю ставок' })
    findOne(@Param('auctionId') auctionId: string) {
        return this.biddingService.findAuction(auctionId);
    }

    @UseGuards(JwtAuthGuard)
    @Post(':auctionId/bids')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Сделать ставку с idempotency key' })
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

    @UseGuards(JwtAuthGuard)
    @Post(':auctionId/checkout')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Создать заказ победителя аукциона' })
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
