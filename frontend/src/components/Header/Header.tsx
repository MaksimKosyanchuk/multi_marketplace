import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext/useAuth';
import { Role } from '../../types';
import styles from './Header.module.css';

export const Header: React.FC = () => {
    const { user, isAuthenticated, logout } = useAuth();

    return (
        <header className={styles.header}>
            <Link to="/" className={styles.logo}>
                Mini Marketplace
            </Link>

            <nav className={styles.nav}>
                <Link to="/" className={styles.link}>
                    Каталог
                </Link>

                {isAuthenticated ? (
                    <>
                        {user?.role === Role.CUSTOMER && (
                            <Link to="/cart" className={styles.link}>
                                Кошик
                            </Link>
                        )}
                        <Link to="/profile" className={styles.link}>
                            Профіль / Замовлення
                        </Link>

                        {user?.role === Role.ADMIN && (
                            <Link to="/admin" className={styles.adminBtn}>
                                Адмін-панель
                            </Link>
                        )}

                        <button onClick={logout} className={styles.logoutBtn}>
                            Вийти
                        </button>
                    </>
                ) : (
                    <Link to="/login" className={styles.authBtn}>
                        Авторизуватися
                    </Link>
                )}
            </nav>
        </header>
    );
};
