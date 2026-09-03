import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@Controller()
@ApiTags('App')
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Get()
    @ApiOperation({ summary: 'Проверка доступности приложения' })
    @ApiResponse({ status: 200, description: 'Приложение работает' })
    getHello(): string {
        return this.appService.getHello();
    }
}
