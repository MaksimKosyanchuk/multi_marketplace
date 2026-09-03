import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@Controller()
@ApiTags('App')
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Get()
    @ApiOperation({ summary: 'Check application availability' })
    @ApiResponse({ status: 200, description: 'Application is running' })
    getHello(): string {
        return this.appService.getHello();
    }
}
