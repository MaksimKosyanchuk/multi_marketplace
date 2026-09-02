import { api } from './api';
import type { Notification } from '../types/marketplace.type';

export const notificationService = {
    async list(unreadOnly = false): Promise<Notification[]> {
        const { data } = await api.get<Notification[]>('/notifications', {
            params: { unreadOnly },
        });
        return data;
    },
    async markRead(id: string): Promise<void> {
        await api.patch(`/notifications/${id}/read`);
    },
};
