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
import {
    ApiBearerAuth,
    ApiBody,
    ApiHeader,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
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
        summary: 'Create an auction for an owned AUCTION product',
    })
    @ApiBody({ type: CreateAuctionDto })
    @ApiResponse({ status: 201, description: 'Auction created' })
    @ApiResponse({ status: 400, description: 'Invalid data' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'SELLER role required' })
    create(
        @Req() req: Request & { user: { id: string } },
        @Body() dto: CreateAuctionDto,
    ) {
        return this.biddingService.createAuction(req.user.id, dto);
    }

    @UseGuards(JwtAuthGuard)
    @Get('mine/created')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Get auctions created by the current user' })
    @ApiResponse({ status: 200, description: 'Auction list' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    getMyAuctions(@Req() req: Request & { user: { id: string } }) {
        return this.biddingService.findCreatedAuctions(req.user.id);
    }

    @UseGuards(JwtAuthGuard)
    @Get('mine/participating')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Get auctions in which the user participates' })
    @ApiResponse({ status: 200, description: 'Auction list' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    getParticipatingAuctions(@Req() req: Request & { user: { id: string } }) {
        return this.biddingService.findParticipatingAuctions(req.user.id);
    }

    @Get(':auctionId')
    @ApiOperation({ summary: 'Get an auction and its bid history' })
    @ApiParam({ name: 'auctionId', description: 'Auction ID' })
    @ApiResponse({ status: 200, description: 'Auction and bids' })
    @ApiResponse({ status: 404, description: 'Auction was not found' })
    findOne(@Param('auctionId') auctionId: string) {
        return this.biddingService.findAuction(auctionId);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.CUSTOMER)
    @Post(':auctionId/bids')
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Place a bid with an idempotency key' })
    @ApiParam({ name: 'auctionId', description: 'Auction ID' })
    @ApiHeader({ name: 'idempotency-key', required: false })
    @ApiBody({ type: PlaceBidDto })
    @ApiResponse({ status: 201, description: 'Bid accepted' })
    @ApiResponse({ status: 400, description: 'Invalid bid' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'CUSTOMER role required' })
    @ApiResponse({ status: 404, description: 'Auction was not found' })
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
    @ApiOperation({ summary: 'Create an order for the auction winner' })
    @ApiParam({ name: 'auctionId', description: 'Auction ID' })
    @ApiHeader({ name: 'idempotency-key', required: false })
    @ApiResponse({ status: 201, description: 'Order created' })
    @ApiResponse({ status: 400, description: 'Auction cannot be checked out' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'CUSTOMER role required' })
    @ApiResponse({ status: 404, description: 'Auction was not found' })
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
