import { createContext } from 'react';
import type { Socket } from 'socket.io-client';
import type { User, LoginDto, RegisterDto } from '../../types';

export interface AuthContextType {
    user: User | null;
    socket: Socket | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (dto: LoginDto) => Promise<void>;
    register: (dto: RegisterDto) => Promise<void>;
    logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
    undefined,
);