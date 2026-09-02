import { api } from './api';
import type { AuthResponse, LoginDto, RegisterDto, User } from '../types/index';

export const authService = {
    async login(dto: LoginDto): Promise<AuthResponse> {
        const response = await api.post<AuthResponse>('/auth/login', dto);
        return response.data;
    },

    async register(dto: RegisterDto): Promise<AuthResponse> {
        const response = await api.post<AuthResponse>('/auth/register', dto);
        return response.data;
    },

    async logout(): Promise<void> {
        await api.post('/auth/logout');
    },

    async getMe(): Promise<User> {
        const response = await api.get<User>('/auth/me');
        return response.data;
    },
};
