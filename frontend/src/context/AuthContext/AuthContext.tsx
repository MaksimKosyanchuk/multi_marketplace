import React, {
    useEffect,
    useMemo,
    useState,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import type { User, LoginDto, RegisterDto } from '../../types';
import { authService } from '../../services/authService';
import { AuthContext } from './AuthContext.context';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    useEffect(() => {
        const initAuth = async () => {
            const token = localStorage.getItem('accessToken');

            if (!token) {
                setIsLoading(false);
                return;
            }

            try {
                const userData = await authService.getMe();
                setUser(userData);
            } catch {
                localStorage.removeItem('accessToken');
                localStorage.removeItem('user');
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };

        void initAuth();
    }, []);

    const socket = useMemo<Socket | null>(() => {
        if (!user) {
            return null;
        }

        const token = localStorage.getItem('accessToken');

        if (!token) {
            return null;
        }

        return io(
            import.meta.env.VITE_API_URL || 'http://localhost:5000',
            {
                auth: { token },
                transports: ['websocket'],
            },
        );
    }, [user]);

    useEffect(() => {
        if (!socket) {
            return;
        }

        socket.on('connect', () => {
            console.log('⚡ Socket connected:', socket.id);
        });

        socket.on('connect_error', (err) => {
            console.error('❌ Socket connection error:', err.message);
        });

        return () => {
            socket.disconnect();
        };
    }, [socket]);

    const login = async (dto: LoginDto) => {
        const data = await authService.login(dto);

        localStorage.setItem('accessToken', data.accessToken);

        if (data.user) {
            setUser(data.user);
            return;
        }

        const userData = await authService.getMe();
        setUser(userData);
    };

    const register = async (dto: RegisterDto) => {
        const data = await authService.register(dto);

        localStorage.setItem('accessToken', data.accessToken);

        if (data.user) {
            setUser(data.user);
            return;
        }

        const userData = await authService.getMe();
        setUser(userData);
    };

    const logout = async () => {
        try {
            await authService.logout();
        } finally {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('user');

            setUser(null);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                socket,
                isAuthenticated: !!user,
                isLoading,
                login,
                register,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};