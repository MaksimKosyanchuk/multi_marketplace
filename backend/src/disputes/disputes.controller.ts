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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
    @ApiOperation({ summary: 'Открыть спор по завершённому seller order' })
    open(
        @Req() req: Request & { user: { id: string } },
        @Body() dto: CreateDisputeDto,
    ) {
        return this.disputes.open(req.user.id, dto);
    }

    @Get('my')
    list(@Req() req: Request & { user: { id: string; role: Role } }) {
        return this.disputes.listForUser(req.user.id, req.user.role);
    }

    @UseGuards(RolesGuard)
    @Roles(Role.CUSTOMER)
    @Get('customer')
    @ApiOperation({ summary: 'Список споров покупателя' })
    listCustomer(@Req() req: Request & { user: { id: string } }) {
        return this.disputes.listForCustomer(req.user.id);
    }

    @UseGuards(RolesGuard)
    @Roles(Role.SELLER)
    @Get('seller')
    @ApiOperation({ summary: 'Список споров продавца' })
    listSeller(@Req() req: Request & { user: { id: string } }) {
        return this.disputes.listForSeller(req.user.id);
    }

    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @Get('admin')
    @ApiOperation({ summary: 'Все споры для администратора' })
    listAdmin() {
        return this.disputes.listForAdmin();
    }

    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @Patch(':id/resolve')
    @ApiOperation({ summary: 'Разрешить спор (ADMIN)' })
    resolve(
        @Req() req: Request & { user: { id: string } },
        @Param('id') id: string,
        @Body() dto: ResolveDisputeDto,
    ) {
        return this.disputes.resolve(req.user.id, id, dto);
    }
}
