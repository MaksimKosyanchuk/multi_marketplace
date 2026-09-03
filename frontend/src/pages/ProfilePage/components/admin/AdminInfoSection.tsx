import React from 'react';
import { Link } from 'react-router-dom';
import styles from '../../ProfilePage.module.css';

export const AdminInfoSection: React.FC = () => (
    <div className={styles.profileActions}>
        <Link to="/admin" className={styles.adminLink}>
            Відкрити адмін-панель
        </Link>
    </div>
);
