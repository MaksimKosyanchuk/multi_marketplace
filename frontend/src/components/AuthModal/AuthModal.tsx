import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './AuthModal.module.css';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
    const navigate = useNavigate();

    if (!isOpen) return null;

    const handleLoginClick = () => {
        onClose();
        navigate('/login');
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h3 className={styles.title}>Потрібна авторизація</h3>
                    <button className={styles.closeBtn} onClick={onClose}>
                        ✕
                    </button>
                </div>
                <p className={styles.description}>
                    Щоб додавати товари до кошика та оформлювати замовлення,
                    будь ласка, увійдіть у свій акаунт.
                </p>
                <div className={styles.actions}>
                    <button className={styles.cancelBtn} onClick={onClose}>
                        Скасувати
                    </button>
                    <button
                        className={styles.loginBtn}
                        onClick={handleLoginClick}
                    >
                        Увійти
                    </button>
                </div>
            </div>
        </div>
    );
};
