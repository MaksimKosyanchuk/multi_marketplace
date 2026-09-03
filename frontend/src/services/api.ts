import axios, { type InternalAxiosRequestConfig, AxiosHeaders } from 'axios';
import type { AuthResponse } from '../types/index';
import { createIdempotencyKey } from './requestMeta';

export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true,
});

api.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        if (!config.headers) {
            config.headers = new AxiosHeaders();
        } else if (!(config.headers instanceof AxiosHeaders)) {
            config.headers = new AxiosHeaders(config.headers);
        }

        if (!config.headers.has('x-correlation-id')) {
            config.headers.set('x-correlation-id', createIdempotencyKey());
        }

        const token = localStorage.getItem('accessToken');
        if (token) {
            config.headers.set('Authorization', `Bearer ${token}`);
        }

        if (config.data instanceof FormData) {
            config.headers.delete('Content-Type');
        }

        return config;
    },
    (error) => Promise.reject(error),
);

let isRefreshing = false;
let failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (err: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else if (token) {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        const isAuthEndpoint =
            originalRequest?.url?.includes('/auth/login') ||
            originalRequest?.url?.includes('/auth/register') ||
            originalRequest?.url?.includes('/auth/google');

        if (error.response?.status === 401 && isAuthEndpoint) {
            return Promise.reject(error);
        }

        if (error.response?.status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                })
                    .then((token) => {
                        if (originalRequest.headers instanceof AxiosHeaders) {
                            originalRequest.headers.set('Authorization', `Bearer ${token}`);
                        } else {
                            originalRequest.headers = new AxiosHeaders({
                                ...originalRequest.headers,
                                Authorization: `Bearer ${token}`,
                            });
                        }
                        return api(originalRequest);
                    })
                    .catch((err) => Promise.reject(err));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const { data } = await axios.post<AuthResponse>(
                    `${api.defaults.baseURL}/auth/refresh`,
                    {},
                    { withCredentials: true },
                );

                localStorage.setItem('accessToken', data.accessToken);
                window.dispatchEvent(new Event('auth:refreshed'));
                api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;

                processQueue(null, data.accessToken);

                if (originalRequest.headers instanceof AxiosHeaders) {
                    originalRequest.headers.set('Authorization', `Bearer ${data.accessToken}`);
                } else {
                    originalRequest.headers = new AxiosHeaders({
                        ...originalRequest.headers,
                        Authorization: `Bearer ${data.accessToken}`,
                    });
                }
                return api(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                localStorage.removeItem('accessToken');
                localStorage.removeItem('user');

                if (!window.location.pathname.includes('/login')) {
                    window.location.href = '/login';
                }

                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    },
);