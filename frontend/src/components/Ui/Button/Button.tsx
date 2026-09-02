import React from 'react';
import styles from './Button.module.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary';
    size?: 'small' | 'medium';
    children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'medium',
    children,
    className = '',
    ...props
}) => {
    return (
        <button
            className={`${styles.btn} ${styles[variant]} ${styles[size]} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
};
