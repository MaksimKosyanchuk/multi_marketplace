import React from 'react';
import styles from '../ProfilePage.module.css';
import type { User, Role } from '../../../types';
import { CustomerInfoSection } from './customer/CustomerInfoSection';
import { SellerInfoSection } from './seller/SellerInfoSection';
import { AdminInfoSection } from './admin/AdminInfoSection';

interface InfoTabProps {
    user: User | null;
    userRole: Role;
    isCustomer: boolean;
    isSeller: boolean;
    isAdmin: boolean;
    sellerApplicationStatus: string | null;
    onApplyForSeller: () => void;
}

export const InfoTab: React.FC<InfoTabProps> = ({
    user,
    userRole,
    isCustomer,
    isSeller,
    isAdmin,
    sellerApplicationStatus,
    onApplyForSeller,
}) => (
    <div className={styles.section}>
        <h2>Дані профілю</h2>

        <div className={styles.profileInfoCard}>
            <div className={styles.profileRow}>
                <span className={styles.label}>Email</span>
                <strong>{user?.email ?? '—'}</strong>
            </div>
            <div className={styles.profileRow}>
                <span className={styles.label}>Нікнейм</span>
                <strong>{user?.nickName ?? '—'}</strong>
            </div>
            <div className={styles.profileRow}>
                <span className={styles.label}>Роль</span>
                <strong>{userRole}</strong>
            </div>

            {isCustomer && (
                <CustomerInfoSection
                    sellerApplicationStatus={sellerApplicationStatus}
                    onApplyForSeller={onApplyForSeller}
                />
            )}
            {isSeller && <SellerInfoSection />}
            {isAdmin && <AdminInfoSection />}
        </div>
    </div>
);
