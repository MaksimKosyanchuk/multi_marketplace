import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

type MockUser = {
    id: string;
    email: string;
    passwordHash: string;
    nickName: string;
    role: 'CUSTOMER' | 'ADMIN';
};

type MockRefreshToken = {
    id: string;
    tokenHash: string;
    userId: string;
    expiresAt: Date;
    createdAt: Date;
    user: MockUser;
};

type AuthResult = {
    accessToken: string;
    refreshToken: string;
};

type MockLogger = {
    log: jest.Mock<void, [message: string, ...optionalParams: unknown[]]>;
    error: jest.Mock<void, [message: string, ...optionalParams: unknown[]]>;
    warn: jest.Mock<void, [message: string, ...optionalParams: unknown[]]>;
    debug: jest.Mock<void, [message: string, ...optionalParams: unknown[]]>;
    verbose: jest.Mock<void, [message: string, ...optionalParams: unknown[]]>;
};

type MockUsersService = {
    findByEmail: jest.Mock<Promise<MockUser | null>, [email: string]>;

    create: jest.Mock<
        Promise<MockUser>,
        [
            data: {
                email: string;
                passwordHash: string;
                nickName: string;
                role: 'CUSTOMER' | 'ADMIN';
            },
        ]
    >;

    findByIdOrThrow: jest.Mock<Promise<MockUser>, [id: string]>;
};

type MockJwtService = {
    signAsync: jest.Mock<Promise<string>, [payload: Record<string, unknown>]>;
};

type MockConfigService = {
    get: jest.Mock<
        string | undefined,
        [propertyPath: string, defaultValue?: string]
    >;
};

type MockPrismaService = {
    user: {
        count: jest.Mock<Promise<number>, []>;
        create: jest.Mock<Promise<MockUser>, [Record<string, unknown>]>;
    };
    $transaction: jest.Mock;

    refreshToken: {
        findUnique: jest.Mock<
            Promise<MockRefreshToken | null>,
            [
                {
                    where: {
                        tokenHash: string;
                    };
                    include: {
                        user: true;
                    };
                },
            ]
        >;

        delete: jest.Mock<
            Promise<MockRefreshToken>,
            [
                {
                    where: {
                        id: string;
                    };
                },
            ]
        >;

        deleteMany: jest.Mock<
            Promise<{ count: number }>,
            [
                {
                    where: {
                        tokenHash: string;
                    };
                },
            ]
        >;

        create: jest.Mock<
            Promise<MockRefreshToken>,
            [
                {
                    data: {
                        userId: string;
                        tokenHash: string;
                        expiresAt: Date;
                    };
                },
            ]
        >;
    };
};

describe('AuthService', () => {
    let service: AuthService;

    const mockUser: MockUser = {
        id: 'user-uuid-123',
        email: 'test@example.com',
        passwordHash: 'hashed_password',
        nickName: 'Tester',
        role: 'CUSTOMER',
    };

    const mockUsersService: MockUsersService = {
        findByEmail: jest.fn<Promise<MockUser | null>, [string]>(),

        create: jest.fn<
            Promise<MockUser>,
            [
                {
                    email: string;
                    passwordHash: string;
                    nickName: string;
                    role: 'CUSTOMER' | 'ADMIN';
                },
            ]
        >(),

        findByIdOrThrow: jest.fn<Promise<MockUser>, [string]>(),
    };

    const mockJwtService: MockJwtService = {
        signAsync: jest.fn<Promise<string>, [Record<string, unknown>]>(),
    };

    const mockConfigService: MockConfigService = {
        get: jest.fn<string | undefined, [string, string?]>(),
    };

    const mockPrismaService: MockPrismaService = {
        user: {
            count: jest.fn<Promise<number>, []>(),
            create: jest.fn<Promise<MockUser>, [Record<string, unknown>]>(),
        },

        $transaction: jest.fn(),

        refreshToken: {
            findUnique: jest.fn<
                Promise<MockRefreshToken | null>,
                [
                    {
                        where: {
                            tokenHash: string;
                        };
                        include: {
                            user: true;
                        };
                    },
                ]
            >(),

            delete: jest.fn<
                Promise<MockRefreshToken>,
                [
                    {
                        where: {
                            id: string;
                        };
                    },
                ]
            >(),

            deleteMany: jest.fn<
                Promise<{ count: number }>,
                [
                    {
                        where: {
                            tokenHash: string;
                        };
                    },
                ]
            >(),

            create: jest.fn<
                Promise<MockRefreshToken>,
                [
                    {
                        data: {
                            userId: string;
                            tokenHash: string;
                            expiresAt: Date;
                        };
                    },
                ]
            >(),
        },
    };

    const mockLoggerService: MockLogger = {
        log: jest.fn<void, [string, ...unknown[]]>(),
        error: jest.fn<void, [string, ...unknown[]]>(),
        warn: jest.fn<void, [string, ...unknown[]]>(),
        debug: jest.fn<void, [string, ...unknown[]]>(),
        verbose: jest.fn<void, [string, ...unknown[]]>(),
    };

    const hashToken = (token: string): string =>
        createHash('sha256').update(token).digest('hex');

    const getHashMock = (): jest.Mock<Promise<string>, [string, number]> =>
        bcrypt.hash as unknown as jest.Mock<Promise<string>, [string, number]>;

    const getCompareMock = (): jest.Mock<Promise<boolean>, [string, string]> =>
        bcrypt.compare as unknown as jest.Mock<
            Promise<boolean>,
            [string, string]
        >;

    const createMockRefreshToken = (
        id: string,
        user: MockUser,
    ): MockRefreshToken => ({
        id,
        tokenHash: 'some_hash',
        userId: user.id,
        expiresAt: new Date(),
        createdAt: new Date(),
        user,
    });

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                {
                    provide: UsersService,
                    useValue: mockUsersService,
                },
                {
                    provide: JwtService,
                    useValue: mockJwtService,
                },
                {
                    provide: ConfigService,
                    useValue: mockConfigService,
                },
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
                {
                    provide: LoggerService,
                    useValue: mockLoggerService,
                },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);

        jest.clearAllMocks();
        mockPrismaService.$transaction.mockImplementation(
            async (callback: (tx: MockPrismaService) => Promise<MockUser>) =>
                callback(mockPrismaService),
        );
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('register', () => {
        const registerDto = {
            email: 'test@example.com',
            password: 'Password123',
            nickName: 'Tester',
        };

        it('should throw ConflictException if email is already registered', async () => {
            mockUsersService.findByEmail.mockResolvedValue(mockUser);

            await expect(service.register(registerDto)).rejects.toThrow(
                ConflictException,
            );

            expect(mockUsersService.findByEmail).toHaveBeenCalledWith(
                registerDto.email,
            );

            expect(mockUsersService.create).not.toHaveBeenCalled();
        });

        it('should register user and return access and refresh tokens', async () => {
            mockUsersService.findByEmail.mockResolvedValue(null);

            getHashMock().mockResolvedValue('hashed_password');

            mockPrismaService.user.count.mockResolvedValue(1);
            mockPrismaService.user.create.mockResolvedValue(mockUser);

            mockJwtService.signAsync.mockResolvedValue('access_token_123');

            mockConfigService.get.mockReturnValue('7d');

            const mockCreatedToken = createMockRefreshToken(
                'token-id-1',
                mockUser,
            );

            mockPrismaService.refreshToken.create.mockResolvedValue(
                mockCreatedToken,
            );

            const result: AuthResult = await service.register(registerDto);

            expect(result.accessToken).toBe('access_token_123');

            expect(typeof result.refreshToken).toBe('string');

            expect(result.refreshToken.length).toBeGreaterThan(0);

            expect(mockUsersService.findByEmail).toHaveBeenCalledWith(
                registerDto.email,
            );

            expect(getHashMock()).toHaveBeenCalledWith(
                registerDto.password,
                10,
            );

            expect(mockPrismaService.user.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        email: registerDto.email,
                        passwordHash: 'hashed_password',
                        nickName: registerDto.nickName,
                        role: 'CUSTOMER',
                    }),
                }),
            );

            expect(mockJwtService.signAsync).toHaveBeenCalledWith({
                sub: mockUser.id,
                email: mockUser.email,
                role: mockUser.role,
            });

            expect(mockPrismaService.refreshToken.create).toHaveBeenCalledTimes(
                1,
            );

            const createCall =
                mockPrismaService.refreshToken.create.mock.calls[0];

            expect(createCall).toBeDefined();

            if (!createCall) {
                throw new Error('refreshToken.create was not called');
            }

            expect(createCall[0].data.userId).toBe(mockUser.id);

            expect(typeof createCall[0].data.tokenHash).toBe('string');

            expect(createCall[0].data.tokenHash.length).toBeGreaterThan(0);

            expect(createCall[0].data.expiresAt).toBeInstanceOf(Date);
        });
    });

    describe('login', () => {
        const loginDto = {
            email: 'test@example.com',
            password: 'Password123',
        };

        it('should throw UnauthorizedException if user is not found', async () => {
            mockUsersService.findByEmail.mockResolvedValue(null);

            await expect(service.login(loginDto)).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('should throw UnauthorizedException if password does not match', async () => {
            mockUsersService.findByEmail.mockResolvedValue(mockUser);

            getCompareMock().mockResolvedValue(false);

            await expect(service.login(loginDto)).rejects.toThrow(
                UnauthorizedException,
            );

            expect(getCompareMock()).toHaveBeenCalledWith(
                loginDto.password,
                mockUser.passwordHash,
            );
        });

        it('should return tokens on valid credentials', async () => {
            mockUsersService.findByEmail.mockResolvedValue(mockUser);

            getCompareMock().mockResolvedValue(true);

            mockJwtService.signAsync.mockResolvedValue('access_token_123');

            mockConfigService.get.mockReturnValue('14d');

            const mockCreatedToken = createMockRefreshToken(
                'token-id-1',
                mockUser,
            );

            mockPrismaService.refreshToken.create.mockResolvedValue(
                mockCreatedToken,
            );

            const result: AuthResult = await service.login(loginDto);

            expect(result.accessToken).toBe('access_token_123');

            expect(typeof result.refreshToken).toBe('string');

            expect(result.refreshToken.length).toBeGreaterThan(0);
        });
    });

    describe('refresh', () => {
        const rawToken = 'sample_refresh_token';
        const hashed = hashToken(rawToken);

        it('should throw UnauthorizedException if token is not found in database', async () => {
            mockPrismaService.refreshToken.findUnique.mockResolvedValue(null);

            await expect(service.refresh(rawToken)).rejects.toThrow(
                UnauthorizedException,
            );

            expect(
                mockPrismaService.refreshToken.findUnique,
            ).toHaveBeenCalledWith({
                where: {
                    tokenHash: hashed,
                },
                include: {
                    user: true,
                },
            });
        });

        it('should delete token and throw UnauthorizedException if token is expired', async () => {
            const expiredToken: MockRefreshToken = {
                id: 'token-id-1',
                tokenHash: hashed,
                userId: mockUser.id,
                expiresAt: new Date(Date.now() - 10000),
                createdAt: new Date(),
                user: mockUser,
            };

            mockPrismaService.refreshToken.findUnique.mockResolvedValue(
                expiredToken,
            );

            await expect(service.refresh(rawToken)).rejects.toThrow(
                UnauthorizedException,
            );

            expect(mockPrismaService.refreshToken.delete).toHaveBeenCalledWith({
                where: {
                    id: expiredToken.id,
                },
            });
        });

        it('should rotate refresh token and return new token pair', async () => {
            const validToken: MockRefreshToken = {
                id: 'token-id-1',
                tokenHash: hashed,
                userId: mockUser.id,
                expiresAt: new Date(Date.now() + 100000),
                createdAt: new Date(),
                user: mockUser,
            };

            mockPrismaService.refreshToken.findUnique.mockResolvedValue(
                validToken,
            );

            mockPrismaService.refreshToken.delete.mockResolvedValue(validToken);

            mockJwtService.signAsync.mockResolvedValue('new_access_token');

            mockConfigService.get.mockReturnValue('7d');

            const mockCreatedToken = createMockRefreshToken(
                'token-id-2',
                mockUser,
            );

            mockPrismaService.refreshToken.create.mockResolvedValue(
                mockCreatedToken,
            );

            const result: AuthResult = await service.refresh(rawToken);

            expect(result.accessToken).toBe('new_access_token');

            expect(typeof result.refreshToken).toBe('string');

            expect(result.refreshToken.length).toBeGreaterThan(0);

            expect(mockPrismaService.refreshToken.delete).toHaveBeenCalledWith({
                where: {
                    id: validToken.id,
                },
            });

            expect(
                mockPrismaService.refreshToken.findUnique,
            ).toHaveBeenCalledWith({
                where: {
                    tokenHash: hashed,
                },
                include: {
                    user: true,
                },
            });
        });
    });

    describe('logout', () => {
        it('should delete tokens associated with hashed refresh token', async () => {
            const rawToken = 'logout_token';
            const hashed = hashToken(rawToken);

            mockPrismaService.refreshToken.deleteMany.mockResolvedValue({
                count: 1,
            });

            await service.logout(rawToken);

            expect(
                mockPrismaService.refreshToken.deleteMany,
            ).toHaveBeenCalledWith({
                where: {
                    tokenHash: hashed,
                },
            });
        });
    });

    describe('me', () => {
        it('should return user info without sensitive fields', async () => {
            mockUsersService.findByIdOrThrow.mockResolvedValue(mockUser);

            const result = await service.me(mockUser.id);

            expect(result).toEqual({
                id: mockUser.id,
                email: mockUser.email,
                nickName: mockUser.nickName,
                role: mockUser.role,
            });

            expect(mockUsersService.findByIdOrThrow).toHaveBeenCalledWith(
                mockUser.id,
            );

            expect(
                Object.prototype.hasOwnProperty.call(result, 'passwordHash'),
            ).toBe(false);
        });
    });
});
