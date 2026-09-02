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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
    apply(
        @CurrentUser() user: AuthUser,
        @Body() dto: CreateSellerApplicationDto,
    ) {
        return this.sellersService.apply(user.id, dto);
    }

    @Get('me')
    getMine(@CurrentUser() user: AuthUser) {
        return this.sellersService.getMine(user.id);
    }

    @Get('applications')
    @Roles(Role.ADMIN)
    list(@Query('status') status?: SellerStatus) {
        return this.sellersService.listApplications(status);
    }

    @Patch('applications/:id/approve')
    @Roles(Role.ADMIN)
    approve(@Param('id') id: string, @CurrentUser() admin: AuthUser) {
        return this.sellersService.approve(id, admin.id);
    }

    @Patch('applications/:id/reject')
    @Roles(Role.ADMIN)
    reject(
        @Param('id') id: string,
        @CurrentUser() admin: AuthUser,
        @Body() dto: RejectSellerApplicationDto,
    ) {
        return this.sellersService.reject(id, admin.id, dto.reason);
    }
}
