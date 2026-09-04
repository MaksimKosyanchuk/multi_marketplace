import {
    ConflictException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload';
import { Role, User } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { GoogleLoginDto } from './dto/google-login.dto';
import { GoogleRegisterCompleteDto } from './dto/google-register-complete.dto';
import { RedisService } from '../redis/redis.service';
import { LoggerService } from '../logger/logger.service';
import { RefreshTokenRepository } from '../database/refresh-token.repository';
import { UnitOfWork } from '../database/unit-of-work';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        private readonly config: ConfigService,
        private readonly unitOfWork: UnitOfWork,
        private readonly refreshTokens: RefreshTokenRepository,
        private readonly redis: RedisService,
        private readonly logger: LoggerService,
    ) {}

    async register(dto: RegisterDto) {
        const existing = await this.usersService.findByEmail(dto.email);

        if (existing) {
            void this.logger.warn(
                AuthService.name,
                'Registration rejected: email already registered',
                { email: dto.email },
            );
            throw new ConflictException('Email is already registered');
        }

        const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
        let user: User;
        try {
            user = await this.unitOfWork.run<User>(
                async ({ userRepository }) => {
                    const userCount = await userRepository.count();
                    return userRepository.create({
                        email: dto.email.toLowerCase(),
                        passwordHash,
                        nickName: dto.nickName,
                        role: userCount === 0 ? Role.ADMIN : Role.CUSTOMER,
                    });
                },
                {
                    isolationLevel:
                        Prisma.TransactionIsolationLevel.Serializable,
                },
            );
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException('Email is already registered');
            }
            throw error;
        }

        void this.logger.log(AuthService.name, 'User registered', {
            userId: user.id,
            operation: 'register',
        });

        return this.issueTokens(user.id, user.email, user.role);
    }

    async login(dto: LoginDto) {
        const user = await this.usersService.findByEmail(dto.email);

        if (!user) {
            void this.logger.warn(
                AuthService.name,
                'Login failed: user not found',
                { email: dto.email },
            );
            throw new UnauthorizedException('Invalid credentials');
        }

        const matches =
            user.passwordHash !== null &&
            (await bcrypt.compare(dto.password, user.passwordHash));

        if (!matches) {
            void this.logger.warn(
                AuthService.name,
                'Login failed: invalid password',
                { userId: user.id },
            );
            throw new UnauthorizedException('Invalid credentials');
        }

        await this.invalidateRefreshTokens(user.id);
        void this.logger.log(AuthService.name, 'User logged in', {
            userId: user.id,
            operation: 'login',
        });
        return this.issueTokens(user.id, user.email, user.role);
    }

    async loginWithGoogle(dto: GoogleLoginDto) {
        const response = await fetch(
            'https://openidconnect.googleapis.com/v1/userinfo',
            { headers: { Authorization: `Bearer ${dto.accessToken}` } },
        );
        if (!response.ok) {
            throw new UnauthorizedException('Invalid Google access token');
        }
        const profile = (await response.json()) as {
            sub?: string;
            email?: string;
            email_verified?: boolean;
            name?: string;
        };
        if (!profile.sub || !profile.email || profile.email_verified !== true) {
            throw new UnauthorizedException(
                'Google account email is not verified',
            );
        }

        const email = profile.email.toLowerCase();
        const user = await this.usersService.findByEmail(email);
        if (user) {
            await this.invalidateRefreshTokens(user.id);
            return this.issueTokens(user.id, user.email, user.role);
        }
        const registrationToken = randomBytes(32).toString('hex');
        await this.redis.set(
            `auth:google-registration:${registrationToken}`,
            JSON.stringify({
                email,
                tokenHash: this.hashToken(dto.accessToken),
            }),
            600,
        );
        return {
            status: 'REGISTRATION_REQUIRED' as const,
            registrationToken,
            email,
        };
    }

    async completeGoogleRegistration(dto: GoogleRegisterCompleteDto) {
        const key = `auth:google-registration:${dto.registrationToken}`;
        const stored = await this.redis.get(key);
        if (!stored) {
            throw new UnauthorizedException('Google registration has expired');
        }
        const pending = JSON.parse(stored) as {
            email: string;
            tokenHash: string;
        };
        const response = await fetch(
            'https://openidconnect.googleapis.com/v1/userinfo',
            { headers: { Authorization: `Bearer ${dto.accessToken}` } },
        );
        if (!response.ok) {
            throw new UnauthorizedException('Invalid Google access token');
        }
        const profile = (await response.json()) as {
            email?: string;
            email_verified?: boolean;
        };
        const email = profile.email?.toLowerCase();
        if (
            !email ||
            profile.email_verified !== true ||
            email !== pending.email ||
            this.hashToken(dto.accessToken) !== pending.tokenHash
        ) {
            throw new UnauthorizedException(
                'Google registration token mismatch',
            );
        }
        const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
        let user: User;
        try {
            user = await this.unitOfWork.run<User>(async ({ userRepository }) =>
                userRepository.create({
                    email,
                    nickName: dto.nickName.trim(),
                    passwordHash,
                    role: Role.CUSTOMER,
                }),
            );
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException('Email is already registered');
            }
            throw error;
        }
        await this.redis.del(key);
        return this.issueTokens(user.id, user.email, user.role);
    }

    async refresh(refreshToken: string) {
        const tokenHash = this.hashToken(refreshToken);

        const stored = await this.refreshTokens.findByTokenHash(tokenHash);

        if (!stored || stored.expiresAt < new Date()) {
            if (stored) {
                await this.refreshTokens.deleteById(stored.id);
            }

            throw new UnauthorizedException('Invalid refresh token');
        }

        await this.refreshTokens.deleteById(stored.id);

        return this.issueTokens(
            stored.user.id,
            stored.user.email,
            stored.user.role,
        );
    }

    async logout(refreshToken: string): Promise<void> {
        const tokenHash = this.hashToken(refreshToken);

        await this.refreshTokens.deleteByTokenHash(tokenHash);
    }

    async me(userId: string) {
        const user = await this.usersService.findByIdOrThrow(userId);

        return {
            id: user.id,
            email: user.email,
            nickName: user.nickName,
            role: user.role,
        };
    }

    private async issueTokens(
        userId: string,
        email: string,
        role: JwtPayload['role'],
    ) {
        const payload: JwtPayload = {
            sub: userId,
            email,
            role,
        };

        const accessToken = await this.jwtService.signAsync(payload);

        const refreshToken = randomBytes(48).toString('hex');

        const days = this.parseDurationDays(
            this.config.get<string>('JWT_REFRESH_EXPIRES', '7d'),
        );

        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

        await this.refreshTokens.create({
            tokenHash: this.hashToken(refreshToken),
            userId,
            expiresAt,
        });

        return {
            accessToken,
            refreshToken,
        };
    }

    private hashToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    /** Revokes every existing refresh token so a new login invalidates prior sessions. */
    private async invalidateRefreshTokens(userId: string): Promise<void> {
        await this.refreshTokens.deleteByUserId(userId);
    }

    private parseDurationDays(value: string): number {
        const match = /^(\d+)d$/.exec(value);

        return match ? Number(match[1]) : 7;
    }
}
