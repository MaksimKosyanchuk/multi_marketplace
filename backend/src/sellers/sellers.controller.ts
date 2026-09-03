import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role, SellerStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateSellerApplicationDto } from './dto/create-seller-application.dto';
import { RejectSellerApplicationDto } from './dto/reject-seller-application.dto';
import { SellersService } from './sellers.service';

@ApiTags('Sellers')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sellers')
export class SellersController {
    constructor(private readonly sellersService: SellersService) {}

    @Post('applications')
    @Roles(Role.CUSTOMER)
    @ApiOperation({ summary: 'Submit a seller application' })
    @ApiBody({ type: CreateSellerApplicationDto })
    @ApiResponse({ status: 201, description: 'Application created' })
    @ApiResponse({ status: 400, description: 'Invalid data' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'CUSTOMER role required' })
    apply(
        @CurrentUser() user: AuthUser,
        @Body() dto: CreateSellerApplicationDto,
    ) {
        return this.sellersService.apply(user.id, dto);
    }

    @Get('me')
    @ApiOperation({ summary: 'Get the current user seller application' })
    @ApiResponse({ status: 200, description: 'Seller application' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    getMine(@CurrentUser() user: AuthUser) {
        return this.sellersService.getMine(user.id);
    }

    @Get('applications')
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Get seller applications' })
    @ApiQuery({ name: 'status', required: false, enum: SellerStatus })
    @ApiResponse({ status: 200, description: 'Application list' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'ADMIN role required' })
    list(@Query('status') status?: SellerStatus) {
        return this.sellersService.listApplications(status);
    }

    @Patch('applications/:id/approve')
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Approve a seller application' })
    @ApiParam({ name: 'id', description: 'Application ID' })
    @ApiResponse({ status: 200, description: 'Application approved' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'ADMIN role required' })
    @ApiResponse({ status: 404, description: 'Application was not found' })
    approve(@Param('id') id: string, @CurrentUser() admin: AuthUser) {
        return this.sellersService.approve(id, admin.id);
    }

    @Patch('applications/:id/reject')
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Reject a seller application' })
    @ApiParam({ name: 'id', description: 'Application ID' })
    @ApiBody({ type: RejectSellerApplicationDto })
    @ApiResponse({ status: 200, description: 'Application rejected' })
    @ApiResponse({ status: 400, description: 'Invalid data' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'ADMIN role required' })
    @ApiResponse({ status: 404, description: 'Application was not found' })
    reject(
        @Param('id') id: string,
        @CurrentUser() admin: AuthUser,
        @Body() dto: RejectSellerApplicationDto,
    ) {
        return this.sellersService.reject(id, admin.id, dto.reason);
    }
}
