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
            'Get products with filtering, pagination, and sorting',
    })
    @ApiResponse({
        status: 200,
        description: 'Product list retrieved successfully',
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
    @ApiOperation({ summary: 'Get products for the current seller' })
    @ApiResponse({ status: 200, description: 'Seller product list', type: PaginatedProductsResponseDto })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'SELLER role required' })
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
    @ApiOperation({ summary: 'Submit a product for administrator review' })
    @ApiParam({ name: 'id', description: 'Product ID' })
    @ApiResponse({ status: 200, description: 'Product submitted for review', type: ProductResponseDto })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'SELLER role required' })
    @ApiResponse({ status: 404, description: 'Product was not found' })
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
    @ApiOperation({ summary: 'Get products awaiting moderation' })
    @ApiResponse({ status: 200, description: 'Products awaiting moderation', type: PaginatedProductsResponseDto })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'ADMIN role required' })
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
    @ApiOperation({ summary: 'Approve a product for publication' })
    @ApiParam({ name: 'id', description: 'Product ID' })
    @ApiBody({ type: ModerateProductDto })
    @ApiResponse({ status: 200, description: 'Product approved', type: ProductResponseDto })
    @ApiResponse({ status: 400, description: 'Invalid data' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'ADMIN role required' })
    @ApiResponse({ status: 404, description: 'Product was not found' })
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
    @ApiOperation({ summary: 'Reject a product' })
    @ApiParam({ name: 'id', description: 'Product ID' })
    @ApiBody({ type: ModerateProductDto })
    @ApiResponse({ status: 200, description: 'Product rejected', type: ProductResponseDto })
    @ApiResponse({ status: 400, description: 'Invalid data' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'ADMIN role required' })
    @ApiResponse({ status: 404, description: 'Product was not found' })
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
    @ApiOperation({ summary: 'Get detailed product information by ID' })
    @ApiParam({ name: 'id', description: 'Product ID', example: 'prod_999xyz' })
    @ApiResponse({
        status: 200,
        description: 'Product found',
        type: ProductResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Product was not found' })
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
    @ApiOperation({ summary: 'Create a new product (approved Seller only)' })
    @ApiConsumes('multipart/form-data', 'application/json')
    @ApiBody({ type: CreateProductDto })
    @ApiResponse({
        status: 201,
        description: 'Product created successfully',
        type: ProductResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid request data or file',
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({
        status: 403,
        description: 'Forbidden (ADMIN role required)',
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
    @ApiOperation({ summary: 'Update product data (ADMIN only)' })
    @ApiParam({ name: 'id', description: 'Product ID', example: 'prod_999xyz' })
    @ApiConsumes('multipart/form-data', 'application/json')
    @ApiBody({ type: UpdateProductDto })
    @ApiResponse({
        status: 200,
        description: 'Product updated successfully',
        type: ProductResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Invalid data' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Product was not found' })
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
        summary: 'Soft-delete/archive a product (ADMIN only)',
    })
    @ApiParam({ name: 'id', description: 'Product ID', example: 'prod_999xyz' })
    @ApiResponse({
        status: 200,
        description: 'Product archived successfully',
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Product was not found' })
    remove(@Param('id') id: string, @CurrentUser() seller: AuthUser) {
        return this.productsService.remove(id, seller.id);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER)
    @Patch(':id/restore')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Restore a product from the archive (ADMIN only)' })
    @ApiParam({ name: 'id', description: 'Product ID', example: 'prod_999xyz' })
    @ApiResponse({
        status: 200,
        description: 'Product restored from archive successfully',
        type: ProductResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Product was not found' })
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
