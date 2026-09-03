import React from 'react';
import styles from '../ProfilePage.module.css';
import type { ProfileTab, ActiveTab } from './types';

interface ProfileTabsNavProps {
    tabs: ProfileTab[];
    activeTab: ActiveTab;
    onTabChange: (tab: ActiveTab) => void;
}

export const ProfileTabsNav: React.FC<ProfileTabsNavProps> = ({
    tabs,
    activeTab,
    onTabChange,
}) => (
    <div className={styles.tabs}>
        {tabs.map((tab) => (
            <button
                key={tab.key}
                type="button"
                className={`${styles.tabBtn} ${
                    activeTab === tab.key ? styles.activeTab : ''
                }`}
                onClick={() => onTabChange(tab.key)}
            >
                {tab.label}
            </button>
        ))}
    </div>
);
