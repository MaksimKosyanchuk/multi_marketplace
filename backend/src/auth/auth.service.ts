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
import { Role } from '@prisma/client/edge';

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

        const userCount = await this.prisma.user.count();

        const role = userCount === 0 ? Role.ADMIN : Role.CUSTOMER;

        const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

        const user = await this.usersService.create({
            email: dto.email,
            passwordHash,
            nickName: dto.nickName,
            role,
        });

        this.logger.log(`User registered ${user.id}`);

        return this.issueTokens(user.id, user.email, user.role);
    }

    async login(dto: LoginDto) {
        const user = await this.usersService.findByEmail(dto.email);

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const matches = await bcrypt.compare(dto.password, user.passwordHash);

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
