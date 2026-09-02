import {
    ConflictException,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload';
import { Role } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { GoogleLoginDto } from './dto/google-login.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        private readonly config: ConfigService,
        private readonly prisma: PrismaService,
    ) {}

    async register(dto: RegisterDto) {
        const existing = await this.usersService.findByEmail(dto.email);

        if (existing) {
            throw new ConflictException('Email is already registered');
        }

        const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
        let user;
        try {
            user = await this.prisma.$transaction(
                async (tx) => {
                    const userCount = await tx.user.count();
                    return tx.user.create({
                        data: {
                            email: dto.email.toLowerCase(),
                            passwordHash,
                            nickName: dto.nickName,
                            role: userCount === 0 ? Role.ADMIN : Role.CUSTOMER,
                            cart: { create: {} },
                        },
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

        this.logger.log(`User registered ${user.id}`);

        return this.issueTokens(user.id, user.email, user.role);
    }

    async login(dto: LoginDto) {
        const user = await this.usersService.findByEmail(dto.email);

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
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
                throw new UnauthorizedException('Google account email is not verified');
            }

            const email = profile.email.toLowerCase();
            let user = await this.usersService.findByEmail(email);
            if (user) {
                if (user.googleId && user.googleId !== profile.sub) {
                    throw new ConflictException('Email is linked to another Google account');
                }
                if (!user.googleId) {
                    user = await this.prisma.user.update({
                        where: { id: user.id },
                        data: { googleId: profile.sub },
                    });
                }
            } else {
                user = await this.prisma.user.create({
                    data: {
                        email,
                        googleId: profile.sub,
                        nickName: profile.name?.trim() || email.split('@')[0],
                        role: Role.CUSTOMER,
                        cart: { create: {} },
                    },
                });
            }
            return this.issueTokens(user.id, user.email, user.role);
        }

        const matches =
            user.passwordHash !== null &&
            (await bcrypt.compare(dto.password, user.passwordHash));

        if (!matches) {
            throw new UnauthorizedException('Invalid credentials');
        }

        return this.issueTokens(user.id, user.email, user.role);
    }

    async refresh(refreshToken: string) {
        const tokenHash = this.hashToken(refreshToken);

        const stored = await this.prisma.refreshToken.findUnique({
            where: { tokenHash },
            include: { user: true },
        });

        if (!stored || stored.expiresAt < new Date()) {
            if (stored) {
                await this.prisma.refreshToken.delete({
                    where: { id: stored.id },
                });
            }

            throw new UnauthorizedException('Invalid refresh token');
        }

        await this.prisma.refreshToken.delete({
            where: { id: stored.id },
        });

        return this.issueTokens(
            stored.user.id,
            stored.user.email,
            stored.user.role,
        );
    }

    async logout(refreshToken: string): Promise<void> {
        const tokenHash = this.hashToken(refreshToken);

        await this.prisma.refreshToken.deleteMany({
            where: { tokenHash },
        });
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

        await this.prisma.refreshToken.create({
            data: {
                tokenHash: this.hashToken(refreshToken),
                userId,
                expiresAt,
            },
        });

        return {
            accessToken,
            refreshToken,
        };
    }

    private hashToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    private parseDurationDays(value: string): number {
        const match = /^(\d+)d$/.exec(value);

        return match ? Number(match[1]) : 7;
    }
}
