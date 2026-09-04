import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsDispatcher } from './notifications.dispatcher';

@Module({
    controllers: [NotificationsController],
    providers: [
        NotificationsService,
        NotificationsProcessor,
        NotificationsDispatcher,
    ],
    exports: [NotificationsService],
})
export class NotificationsModule {}
