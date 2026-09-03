import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiParam,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import {
    ProductResponseDto,
    PaginatedProductsResponseDto,
} from './dto/product-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { productMulterOptions } from './config/multer.config';
import { ModerateProductDto } from './dto/moderate-product.dto';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
    constructor(private readonly productsService: ProductsService) {}

    @Get()
    @ApiOperation({
        summary:
            'Получить список товаров (с фильтрацией, пагинацией и сортировкой)',
    })
    @ApiResponse({
        status: 200,
        description: 'Список товаров успешно получен',
        type: PaginatedProductsResponseDto,
    })
    findAll(
        @Query() query: QueryProductDto,
    ): Promise<PaginatedProductsResponseDto> {
        return this.productsService.findAll(
            query,
        ) as unknown as Promise<PaginatedProductsResponseDto>;
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER)
    @Get('seller/me')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Получить товары текущего продавца' })
    @ApiResponse({ status: 200, description: 'Список товаров продавца', type: PaginatedProductsResponseDto })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 403, description: 'Требуется роль SELLER' })
    findSellerProducts(
        @Query() query: QueryProductDto,
        @CurrentUser() seller: AuthUser,
    ): Promise<PaginatedProductsResponseDto> {
        return this.productsService.findSellerProducts(
            seller.id,
            query,
        ) as unknown as Promise<PaginatedProductsResponseDto>;
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER)
    @Patch(':id/submit-for-approval')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Отправить товар на проверку администратору' })
    @ApiParam({ name: 'id', description: 'ID товара' })
    @ApiResponse({ status: 200, description: 'Товар отправлен на проверку', type: ProductResponseDto })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 403, description: 'Требуется роль SELLER' })
    @ApiResponse({ status: 404, description: 'Товар не найден' })
    submitForApproval(
        @Param('id') id: string,
        @CurrentUser() seller: AuthUser,
    ): Promise<ProductResponseDto> {
        return this.productsService.submitForApproval(
            id,
            seller.id,
        ) as unknown as Promise<ProductResponseDto>;
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Get('admin/pending-approval')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Получить товары, ожидающие модерации' })
    @ApiResponse({ status: 200, description: 'Список товаров на модерации', type: PaginatedProductsResponseDto })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 403, description: 'Требуется роль ADMIN' })
    findPendingApproval(
        @Query() query: QueryProductDto,
    ): Promise<PaginatedProductsResponseDto> {
        return this.productsService.findPendingApproval(
            query,
        ) as unknown as Promise<PaginatedProductsResponseDto>;
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Patch(':id/approve')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Одобрить товар на публикацию' })
    @ApiParam({ name: 'id', description: 'ID товара' })
    @ApiBody({ type: ModerateProductDto })
    @ApiResponse({ status: 200, description: 'Товар одобрен', type: ProductResponseDto })
    @ApiResponse({ status: 400, description: 'Невалидные данные' })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 403, description: 'Требуется роль ADMIN' })
    @ApiResponse({ status: 404, description: 'Товар не найден' })
    approve(
        @Param('id') id: string,
        @CurrentUser() admin: AuthUser,
        @Body() dto: ModerateProductDto,
    ): Promise<ProductResponseDto> {
        return this.productsService.approve(
            id,
            admin.id,
            dto.comment,
        ) as unknown as Promise<ProductResponseDto>;
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Patch(':id/reject')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Отклонить товар' })
    @ApiParam({ name: 'id', description: 'ID товара' })
    @ApiBody({ type: ModerateProductDto })
    @ApiResponse({ status: 200, description: 'Товар отклонён', type: ProductResponseDto })
    @ApiResponse({ status: 400, description: 'Невалидные данные' })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 403, description: 'Требуется роль ADMIN' })
    @ApiResponse({ status: 404, description: 'Товар не найден' })
    reject(
        @Param('id') id: string,
        @CurrentUser() admin: AuthUser,
        @Body() dto: ModerateProductDto,
    ): Promise<ProductResponseDto> {
        return this.productsService.reject(
            id,
            admin.id,
            dto.comment,
        ) as unknown as Promise<ProductResponseDto>;
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить детальную информацию о товаре по ID' })
    @ApiParam({ name: 'id', description: 'ID товара', example: 'prod_999xyz' })
    @ApiResponse({
        status: 200,
        description: 'Товар найден',
        type: ProductResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Товар не найден' })
    findOne(@Param('id') id: string): Promise<ProductResponseDto> {
        return this.productsService.findOne(
            id,
        ) as unknown as Promise<ProductResponseDto>;
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER)
    @Post()
    @ApiBearerAuth('JWT-auth')
    @UseInterceptors(FileInterceptor('image', productMulterOptions))
    @ApiOperation({ summary: 'Создать новый товар (только approved Seller)' })
    @ApiConsumes('multipart/form-data', 'application/json')
    @ApiBody({ type: CreateProductDto })
    @ApiResponse({
        status: 201,
        description: 'Товар успешно создан',
        type: ProductResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Невалидные данные запроса или файла',
    })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({
        status: 403,
        description: 'Доступ запрещен (Требуется роль ADMIN)',
    })
    create(
        @Body() dto: CreateProductDto,
        @CurrentUser() seller: AuthUser,
        @UploadedFile() file?: Express.Multer.File,
    ): Promise<ProductResponseDto> {
        const uploadedFilePath = file
            ? `/uploads/products/${file.filename}`
            : undefined;
        return this.productsService.create(
            dto,
            seller.id,
            uploadedFilePath,
        ) as unknown as Promise<ProductResponseDto>;
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER)
    @Patch(':id')
    @ApiBearerAuth('JWT-auth')
    @UseInterceptors(FileInterceptor('image', productMulterOptions))
    @ApiOperation({ summary: 'Обновить данные товара (Только ADMIN)' })
    @ApiParam({ name: 'id', description: 'ID товара', example: 'prod_999xyz' })
    @ApiConsumes('multipart/form-data', 'application/json')
    @ApiBody({ type: UpdateProductDto })
    @ApiResponse({
        status: 200,
        description: 'Товар успешно обновлен',
        type: ProductResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Невалидные данные' })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 403, description: 'Доступ запрещен' })
    @ApiResponse({ status: 404, description: 'Товар не найден' })
    update(
        @Param('id') id: string,
        @Body() dto: UpdateProductDto,
        @CurrentUser() seller: AuthUser,
        @UploadedFile() file?: Express.Multer.File,
    ): Promise<ProductResponseDto> {
        const uploadedFilePath = file
            ? `/uploads/products/${file.filename}`
            : undefined;
        return this.productsService.update(
            id,
            dto,
            seller.id,
            uploadedFilePath,
        ) as unknown as Promise<ProductResponseDto>;
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER)
    @Delete(':id')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({
        summary: 'Мягкое удаление товара / Архивирование (Только ADMIN)',
    })
    @ApiParam({ name: 'id', description: 'ID товара', example: 'prod_999xyz' })
    @ApiResponse({
        status: 200,
        description: 'Товар успешно отправлен в архив',
    })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 403, description: 'Доступ запрещен' })
    @ApiResponse({ status: 404, description: 'Товар не найден' })
    remove(@Param('id') id: string, @CurrentUser() seller: AuthUser) {
        return this.productsService.remove(id, seller.id);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER)
    @Patch(':id/restore')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Восстановить товар из архива (Только ADMIN)' })
    @ApiParam({ name: 'id', description: 'ID товара', example: 'prod_999xyz' })
    @ApiResponse({
        status: 200,
        description: 'Товар успешно восстановлен из архива',
        type: ProductResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    @ApiResponse({ status: 403, description: 'Доступ запрещен' })
    @ApiResponse({ status: 404, description: 'Товар не найден' })
    async restore(
        @Param('id') id: string,
        @CurrentUser() seller: AuthUser,
    ): Promise<ProductResponseDto> {
        return (await this.productsService.restore(
            id,
            seller.id,
        )) as unknown as ProductResponseDto;
    }
}
