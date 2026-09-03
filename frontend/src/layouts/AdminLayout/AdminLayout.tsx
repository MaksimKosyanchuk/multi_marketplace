import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar, type SidebarItem } from '../../components/Sidebar/Sidebar';
import styles from './AdminLayout.module.css';

const adminNavItems: SidebarItem[] = [
    { id: 'dashboard', label: 'Дашборд', icon: '📊', to: '/admin/dashboard' }, 
    { id: 'orders', label: 'Замовлення', icon: '📦', to: '/admin/orders' },
    { id: 'disputes', label: 'Спори', icon: '⚖️', to: '/admin/disputes' },
    { id: 'approvals', label: 'Одобрення', icon: '✅', to: '/admin/approvals' },
    { id: 'categories', label: 'Категорії', icon: '📁', to: '/admin/categories' },
    { id: 'site', label: '← На сайт', icon: '🏠', to: '/' },
];
export const AdminLayout: React.FC = () => {
    return (
        <div className={styles.layout}>
            <Sidebar title="Admin Panel" items={adminNavItems} />

            <main className={styles.mainContent}>
                <Outlet />
            </main>
        </div>
    );
};