import React from 'react';
import styles from './Footer.module.css';

export const Footer: React.FC = () => {
    return (
        <footer className={styles.footer}>
            <div className={styles.content}>
                <span className={styles.copyright}>
                    © {new Date().getFullYear()} Mini Marketplace. Всі права
                    захищено.
                </span>
                <span>Built with React + NestJS</span>
            </div>
        </footer>
    );
};
