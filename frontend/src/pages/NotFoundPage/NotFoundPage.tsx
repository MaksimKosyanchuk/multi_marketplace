import React from 'react';
import { Link } from 'react-router-dom';
import styles from './NotFoundPage.module.css';

export const NotFoundPage: React.FC = () => {
    return (
        <div className={styles.container}>
            <h1 className={styles.code}>404</h1>
            <h2 className={styles.title}>Сторінку не знайдено</h2>
            <p className={styles.description}>
                Вибачте, але сторінки, яку ви шукаєте, не існує або вона була
                переміщена.
            </p>
            <Link to="/" className={styles.homeBtn}>
                Повернутися на головну
            </Link>
        </div>
    );
};

export default NotFoundPage;
