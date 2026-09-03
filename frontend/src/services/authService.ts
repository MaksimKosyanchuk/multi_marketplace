import axios from 'axios';
import { api } from './api';
import type { AuthResponse, LoginDto, RegisterDto, User } from '../types/index';

export interface GoogleLoginResponse {
    accessToken?: string;
    status?: 'REGISTRATION_REQUIRED';
    email?: string;
    registrationToken?: string;
}

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
    async refreshAccessToken(): Promise<string> {
        const response = await axios.post<AuthResponse>(
            `${api.defaults.baseURL}/auth/refresh`,
            undefined,
            { withCredentials: true },
        );
        return response.data.accessToken;
    },

    async loginWithGoogle(accessToken: string): Promise<GoogleLoginResponse> {
        const response = await api.post<GoogleLoginResponse>('/auth/google', {
            accessToken,
        });
        return response.data;
    },

    async completeGoogleRegistration(input: {
        accessToken: string;
        registrationToken: string;
        nickName: string;
        password: string;
    }): Promise<AuthResponse> {
        const response = await api.post<AuthResponse>(
            '/auth/google/register/complete',
            input,
        );
        return response.data;
    },
};
