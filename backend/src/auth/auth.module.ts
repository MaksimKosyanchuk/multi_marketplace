import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { RedisModule } from '../redis/redis.module';

@Module({
    imports: [
        PassportModule,

        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
            }),
        }),

        PrismaModule,
        UsersModule,
        RedisModule,
    ],

    controllers: [AuthController],

    providers: [AuthService, JwtStrategy],

    exports: [AuthService, JwtModule],
})
export class AuthModule {}
