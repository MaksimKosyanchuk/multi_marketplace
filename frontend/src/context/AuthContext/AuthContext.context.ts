import { createContext } from 'react';
import type { User, LoginDto, RegisterDto } from '../../types';
import type { GoogleLoginResponse } from '../../services/authService';
import type { getMarketplaceSocket } from '../../services/socketClient';

type MarketplaceSocket = ReturnType<typeof getMarketplaceSocket>;

export interface AuthContextType {
    user: User | null;
    socket: MarketplaceSocket;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (dto: LoginDto) => Promise<void>;
    register: (dto: RegisterDto) => Promise<void>;
    loginWithGoogle: (accessToken: string) => Promise<GoogleLoginResponse>;
    completeGoogleRegistration: (input: {
        accessToken: string;
        registrationToken: string;
        nickName: string;
        password: string;
    }) => Promise<void>;
    logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
    undefined,
);
