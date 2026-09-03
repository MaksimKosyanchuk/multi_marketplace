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
    ApiBody,
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
    @ApiBody({ type: RegisterDto })
    @ApiOperation({ summary: 'Register a new user' })
    @ApiResponse({
        status: 201,
        description:
            'User registered successfully. Returns an accessToken and sets a refreshToken in an HttpOnly cookie.',
        type: AuthTokenResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid data (DTO validation error)',
    })
    @ApiResponse({
        status: 409,
        description: 'A user with this email already exists',
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
    @ApiBody({ type: LoginDto })
    @ApiOperation({ summary: 'Authenticate a user' })
    @ApiResponse({
        status: 200,
        description:
            'Login successful. Returns an accessToken and sets a refreshToken in an HttpOnly cookie.',
        type: AuthTokenResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Invalid email or password' })
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
    @ApiOperation({ summary: 'Sign in with a Google OAuth2 access token' })
    @ApiBody({ type: GoogleLoginDto })
    @ApiResponse({ status: 200, description: 'Google sign-in successful', type: AuthTokenResponseDto })
    @ApiResponse({ status: 400, description: 'Invalid access token' })
    @ApiResponse({ status: 401, description: 'Google authentication failed' })
    async googleLogin(
        @Body() dto: GoogleLoginDto,
        @Res({ passthrough: true }) res: Response,
    ) {
        const tokens = await this.authService.loginWithGoogle(dto);
        if (!('accessToken' in tokens)) return tokens;
        this.setRefreshTokenCookie(res, tokens.refreshToken);
        return { accessToken: tokens.accessToken };
    }

    @Post('google/register/complete')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @ApiOperation({ summary: 'Complete Google registration' })
    @ApiBody({ type: GoogleRegisterCompleteDto })
    @ApiResponse({ status: 201, description: 'Registration completed', type: AuthTokenResponseDto })
    @ApiResponse({ status: 400, description: 'Invalid data' })
    @ApiResponse({ status: 409, description: 'User already exists' })
    async completeGoogleRegistration(
        @Body() dto: GoogleRegisterCompleteDto,
        @Res({ passthrough: true }) res: Response,
    ) {
        const tokens = await this.authService.completeGoogleRegistration(dto);
        this.setRefreshTokenCookie(res, tokens.refreshToken);
        return { accessToken: tokens.accessToken };
    }

    @Post('refresh')
    @ApiCookieAuth('refreshToken')
    @ApiOperation({ summary: 'Refresh the token pair (token rotation)' })
    @ApiResponse({
        status: 200,
        description: 'Tokens refreshed successfully.',
        type: AuthTokenResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: 'Refresh token is missing from the cookie or is invalid',
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
    @ApiOperation({ summary: 'Sign out (revoke the refresh token)' })
    @ApiResponse({
        status: 200,
        description: 'Signed out successfully; cookie cleared',
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
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
    @ApiOperation({ summary: 'Get the current user profile' })
    @ApiResponse({
        status: 200,
        description: 'Current user data',
        type: UserProfileResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
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
