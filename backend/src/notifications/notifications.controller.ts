import {
    Controller,
    Get,
    Param,
    Patch,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
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
    @ApiOperation({ summary: 'Получить уведомления текущего пользователя' })
    @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean, description: 'Только непрочитанные уведомления' })
    @ApiResponse({ status: 200, description: 'Список уведомлений' })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    list(
        @CurrentUser() user: AuthUser,
        @Query('unreadOnly') unreadOnly?: string,
    ) {
        return this.notifications.listForUser(user.id, unreadOnly === 'true');
    }

    @Patch(':id/read')
    @ApiOperation({ summary: 'Отметить уведомление прочитанным' })
    @ApiParam({ name: 'id', description: 'ID уведомления' })
    @ApiResponse({ status: 200, description: 'Уведомление отмечено прочитанным' })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 404, description: 'Уведомление не найдено' })
    markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
        return this.notifications.markRead(user.id, id);
    }
}
