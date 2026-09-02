import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
    constructor(private readonly notifications: NotificationsService) {}

    @Get()
    list(@CurrentUser() user: AuthUser, @Query('unreadOnly') unreadOnly?: string) {
        return this.notifications.listForUser(user.id, unreadOnly === 'true');
    }

    @Patch(':id/read')
    markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
        return this.notifications.markRead(user.id, id);
    }
}
