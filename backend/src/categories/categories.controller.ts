import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiParam,
} from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
    constructor(private readonly categoriesService: CategoriesService) {}

    @Get()
    @ApiOperation({ summary: 'Получить список всех категорий' })
    @ApiResponse({
        status: 200,
        description: 'Список категорий успешно получен',
        type: [CategoryResponseDto],
    })
    findAll() {
        return this.categoriesService.findAll();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить категорию по ID' })
    @ApiParam({
        name: 'id',
        description: 'ID категории',
        example: 'cat_123abc456',
    })
    @ApiResponse({
        status: 200,
        description: 'Категория найдена',
        type: CategoryResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Категория не найдена' })
    findOne(@Param('id') id: string) {
        return this.categoriesService.findOne(id);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Post()
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Создать новую категорию (Только ADMIN)' })
    @ApiResponse({
        status: 201,
        description: 'Категория успешно создана',
        type: CategoryResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Невалидные данные' })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({
        status: 403,
        description: 'Доступ запрещен (Требуется роль ADMIN)',
    })
    @ApiResponse({
        status: 409,
        description: 'Категория с таким именем уже существует',
    })
    create(@Body() dto: CreateCategoryDto) {
        return this.categoriesService.create(dto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Patch(':id')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Обновить категорию по ID (Только ADMIN)' })
    @ApiParam({
        name: 'id',
        description: 'ID категории',
        example: 'cat_123abc456',
    })
    @ApiResponse({
        status: 200,
        description: 'Категория успешно обновлена',
        type: CategoryResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Невалидные данные' })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 403, description: 'Доступ запрещен' })
    @ApiResponse({ status: 404, description: 'Категория не найдена' })
    update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
        return this.categoriesService.update(id, dto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Delete(':id')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Удалить категорию по ID (Только ADMIN)' })
    @ApiParam({
        name: 'id',
        description: 'ID категории',
        example: 'cat_123abc456',
    })
    @ApiResponse({
        status: 200,
        description: 'Категория успешно удалена',
    })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 403, description: 'Доступ запрещен' })
    @ApiResponse({ status: 404, description: 'Категория не найдена' })
    remove(@Param('id') id: string) {
        return this.categoriesService.remove(id);
    }
}
