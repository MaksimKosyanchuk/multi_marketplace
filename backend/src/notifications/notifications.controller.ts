import {
    Controller,
    Get,
    Param,
    Patch,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
    constructor(private readonly notifications: NotificationsService) {}

    @Get()
    @ApiOperation({ summary: 'Get notifications for the current user' })
    @ApiQuery({
        name: 'unreadOnly',
        required: false,
        type: Boolean,
        description: 'Only unread notifications',
    })
    @ApiResponse({ status: 200, description: 'Notification list' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    list(
        @CurrentUser() user: AuthUser,
        @Query('unreadOnly') unreadOnly?: string,
    ) {
        return this.notifications.listForUser(user.id, unreadOnly === 'true');
    }

    @Patch(':id/read')
    @ApiOperation({ summary: 'Mark a notification as read' })
    @ApiParam({ name: 'id', description: 'Notification ID' })
    @ApiResponse({ status: 200, description: 'Notification marked as read' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Notification was not found' })
    markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
        return this.notifications.markRead(user.id, id);
    }
}
