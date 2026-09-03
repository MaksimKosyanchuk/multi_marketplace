import React from 'react';
import styles from '../../ProfilePage.module.css';
import { Button } from '../../../../components/Ui/Button/Button';

interface CustomerInfoSectionProps {
    sellerApplicationStatus: string | null;
    onApplyForSeller: () => void;
}

export const CustomerInfoSection: React.FC<CustomerInfoSectionProps> = ({
    sellerApplicationStatus,
    onApplyForSeller,
}) => (
    <>
        <div className={styles.profileHint}>
            Ви можете купувати товари в каталозі.
        </div>
        {sellerApplicationStatus === 'PENDING' ? (
            <div className={styles.profileHint}>
                Заявка на статус продавця вже подана та очікує перевірки.
            </div>
        ) : sellerApplicationStatus !== 'APPROVED' ? (
            <Button type="button" onClick={onApplyForSeller}>
                Подати заявку на продавця
            </Button>
        ) : null}
    </>
);
