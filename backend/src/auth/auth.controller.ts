import {
    Body,
    Controller,
    Get,
    Post,
    Req,
    Res,
    UnauthorizedException,
    UseGuards,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiCookieAuth,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
    AuthTokenResponseDto,
    UserProfileResponseDto,
} from './dto/auth-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GoogleLoginDto } from './dto/google-login.dto';
import { Throttle } from '@nestjs/throttler';
import { GoogleRegisterCompleteDto } from './dto/google-register-complete.dto';

interface RequestWithCookies extends Request {
    cookies: {
        refreshToken?: string;
    } & Record<string, any>;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('register')
    @ApiOperation({ summary: 'Регистрация нового пользователя' })
    @ApiResponse({
        status: 201,
        description:
            'Пользователь успешно зарегистрирован. Возвращает accessToken и устанавливает refreshToken в HttpOnly cookie.',
        type: AuthTokenResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Невалидные данные (Ошибка валидации DTO)',
    })
    @ApiResponse({
        status: 409,
        description: 'Пользователь с таким email уже существует',
    })
    async register(
        @Body() dto: RegisterDto,
        @Res({ passthrough: true }) res: Response,
    ) {
        const tokens = await this.authService.register(dto);
        this.setRefreshTokenCookie(res, tokens.refreshToken);
        return { accessToken: tokens.accessToken };
    }

    @Post('login')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @ApiOperation({ summary: 'Авторизация пользователя' })
    @ApiResponse({
        status: 200,
        description:
            'Успешный вход. Возвращает accessToken и устанавливает refreshToken в HttpOnly cookie.',
        type: AuthTokenResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Неверный email или пароль' })
    async login(
        @Body() dto: LoginDto,
        @Res({ passthrough: true }) res: Response,
    ) {
        const tokens = await this.authService.login(dto);
        this.setRefreshTokenCookie(res, tokens.refreshToken);
        return { accessToken: tokens.accessToken };
    }

    @Post('google')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @ApiOperation({ summary: 'Вход через Google OAuth2 access token' })
    async googleLogin(
        @Body() dto: GoogleLoginDto,
        @Res({ passthrough: true }) res: Response,
    ) {
        const tokens = await this.authService.loginWithGoogle(dto);
        this.setRefreshTokenCookie(res, tokens.refreshToken);
        return { accessToken: tokens.accessToken };
    }

    @Post('google/register/complete')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @ApiOperation({ summary: 'Завершить Google-регистрацию' })
    async completeGoogleRegistration(
        @Body() dto: GoogleRegisterCompleteDto,
        @Res({ passthrough: true }) res: Response,
    ) {
        const tokens =
            await this.authService.completeGoogleRegistration(dto);
        this.setRefreshTokenCookie(res, tokens.refreshToken);
        return { accessToken: tokens.accessToken };
    }

    @Post('refresh')
    @ApiCookieAuth('refreshToken')
    @ApiOperation({ summary: 'Обновление пара токенов (Token Rotation)' })
    @ApiResponse({
        status: 200,
        description: 'Токены успешно обновлены.',
        type: AuthTokenResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: 'Refresh token отсутствует в cookie или недействителен',
    })
    async refresh(
        @Req() req: RequestWithCookies,
        @Res({ passthrough: true }) res: Response,
    ) {
        const refreshToken = req.cookies?.refreshToken;

        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token is missing');
        }

        const tokens = await this.authService.refresh(refreshToken);
        this.setRefreshTokenCookie(res, tokens.refreshToken);
        return { accessToken: tokens.accessToken };
    }

    @Post('logout')
    @ApiCookieAuth('refreshToken')
    @ApiOperation({ summary: 'Выход из системы (отзыв refresh токена)' })
    @ApiResponse({
        status: 200,
        description: 'Успешный выход, cookie очищена',
    })
    async logout(
        @Req() req: RequestWithCookies,
        @Res({ passthrough: true }) res: Response,
    ) {
        const refreshToken = req.cookies?.refreshToken;

        if (refreshToken) {
            await this.authService.logout(refreshToken);
        }

        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
        });
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Получение профиля текущего пользователя' })
    @ApiResponse({
        status: 200,
        description: 'Данные текущего пользователя',
        type: UserProfileResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Неавторизован' })
    me(@Req() req: Request & { user: { id: string } }) {
        return this.authService.me(req.user.id);
    }

    private setRefreshTokenCookie(res: Response, refreshToken: string) {
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/auth',
        });
    }
}
