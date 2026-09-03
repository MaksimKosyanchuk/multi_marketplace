import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { DisputesService } from './disputes.service';

@ApiTags('Disputes')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('disputes')
export class DisputesController {
    constructor(private readonly disputes: DisputesService) {}

    @Post()
    @UseGuards(RolesGuard)
    @Roles(Role.CUSTOMER)
    @ApiOperation({ summary: 'Open a dispute for a completed seller order' })
    @ApiBody({ type: CreateDisputeDto })
    @ApiResponse({ status: 201, description: 'Dispute opened' })
    @ApiResponse({ status: 400, description: 'Invalid data' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'CUSTOMER role required' })
    open(
        @Req() req: Request & { user: { id: string } },
        @Body() dto: CreateDisputeDto,
    ) {
        return this.disputes.open(req.user.id, dto);
    }

    @Get('my')
    @ApiOperation({ summary: 'Get the current user disputes' })
    @ApiResponse({ status: 200, description: 'User dispute list' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    list(@Req() req: Request & { user: { id: string; role: Role } }) {
        return this.disputes.listForUser(req.user.id, req.user.role);
    }

    @UseGuards(RolesGuard)
    @Roles(Role.CUSTOMER)
    @Get('customer')
    @ApiOperation({ summary: 'Get customer disputes' })
    @ApiResponse({ status: 200, description: 'Customer dispute list' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'CUSTOMER role required' })
    listCustomer(@Req() req: Request & { user: { id: string } }) {
        return this.disputes.listForCustomer(req.user.id);
    }

    @UseGuards(RolesGuard)
    @Roles(Role.SELLER)
    @Get('seller')
    @ApiOperation({ summary: 'Get seller disputes' })
    @ApiResponse({ status: 200, description: 'Seller dispute list' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'SELLER role required' })
    listSeller(@Req() req: Request & { user: { id: string } }) {
        return this.disputes.listForSeller(req.user.id);
    }

    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @Get('admin')
    @ApiOperation({ summary: 'Get all disputes for the administrator' })
    @ApiResponse({ status: 200, description: 'All disputes' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'ADMIN role required' })
    listAdmin() {
        return this.disputes.listForAdmin();
    }

    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @Patch(':id/resolve')
    @ApiOperation({ summary: 'Resolve a dispute (ADMIN)' })
    @ApiParam({ name: 'id', description: 'Dispute ID' })
    @ApiBody({ type: ResolveDisputeDto })
    @ApiResponse({ status: 200, description: 'Dispute resolved' })
    @ApiResponse({ status: 400, description: 'Invalid data' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'ADMIN role required' })
    @ApiResponse({ status: 404, description: 'Dispute was not found' })
    resolve(
        @Req() req: Request & { user: { id: string } },
        @Param('id') id: string,
        @Body() dto: ResolveDisputeDto,
    ) {
        return this.disputes.resolve(req.user.id, id, dto);
    }
}
