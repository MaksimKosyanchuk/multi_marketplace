import { Global, Module } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
    imports: [PrismaModule],
    providers: [LoggerService],
    exports: [LoggerService],
})
export class LoggerModule {}
