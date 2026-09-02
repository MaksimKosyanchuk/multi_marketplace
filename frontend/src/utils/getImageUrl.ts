// src/utils/getImageUrl.ts
export const getImageUrl = (path: string | null | undefined): string | null => {
    if (!path) return null;
    
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const baseUrl = API_URL.replace(/\/api\/?$/, '');

    const formattedPath = path.startsWith('/') ? path : `/${path}`;

    return `${baseUrl}${formattedPath}`;
};