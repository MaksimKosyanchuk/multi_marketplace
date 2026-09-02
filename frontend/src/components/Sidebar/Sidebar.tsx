import React from 'react';
import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.css';

export interface SidebarItem {
    id: string;
    label: string;
    icon?: React.ReactNode;
    end?: boolean; 
    to?: string; 
    onClick?: () => void; 
}

interface SidebarProps {
    title?: string;
    items: SidebarItem[];
    className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
    title,
    items,
    className = '',
}) => {
    return (
        <aside className={`${styles.sidebar} ${className}`}>
            {title && (
                <div className={styles.header}>
                    <h2 className={styles.title}>{title}</h2>
                </div>
            )}

            <nav className={styles.nav}>
                {items.map((item) => {
                    const content = (
                        <>
                            {item.icon && <span className={styles.icon}>{item.icon}</span>}
                            <span className={styles.label}>{item.label}</span>
                        </>
                    );

                    if (item.to) {
                        return (
                            <NavLink
                                key={item.id}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) =>
                                    `${styles.navItem} ${isActive ? styles.active : ''}`
                                }
                            >
                                {content}
                            </NavLink>
                        );
                    }

                    return (
                        <button
                            key={item.id}
                            className={styles.navItem}
                            onClick={item.onClick}
                            type="button"
                        >
                            {content}
                        </button>
                    );
                })}
            </nav>
        </aside>
    );
};