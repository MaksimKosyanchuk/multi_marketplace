import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './AuthForm.module.css';

interface AuthFormProps {
    type: 'login' | 'register';
    onSubmit: (data: {
        email: string;
        password: string;
        nickName?: string;
    }) => Promise<void>;
    error: string | null;
    isSubmitting: boolean;
    onGoogleLogin?: () => Promise<void>;
}

interface FormErrors {
    email?: string;
    password?: string;
    nickName?: string;
}

export const AuthForm: React.FC<AuthFormProps> = ({
    type,
    onSubmit,
    error,
    isSubmitting,
    onGoogleLogin,
}) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [nickName, setNickName] = useState('');
    const [fieldErrors, setFieldErrors] = useState<FormErrors>({});

    const isLogin = type === 'login';

    const validate = (): boolean => {
        const errors: FormErrors = {};

        if (!email.trim()) {
            errors.email = 'Email обов’язковий';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors.email = 'Некоректний формат Email';
        }

        if (!password) {
            errors.password = 'Пароль обов’язковий';
        } else if (password.length < 8 || password.length > 72) {
            errors.password = 'Пароль повинен містити від 8 до 72 символів';
        }

        if (!isLogin) {
            if (!nickName.trim()) {
                errors.nickName = 'Нікнейм обов’язковий';
            } else if (nickName.length < 2 || nickName.length > 40) {
                errors.nickName =
                    'Нікнейм повинен містити від 2 до 40 символів';
            }
        }

        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!validate()) {
            return;
        }

        await onSubmit({
            email,
            password,
            ...(isLogin ? {} : { nickName }),
        });
    };

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>
                {isLogin ? 'Увійти в акаунт' : 'Створити акаунт'}
            </h1>

            {error && <div className={styles.error}>{error}</div>}

            <form onSubmit={handleSubmit} className={styles.form} noValidate>
                {!isLogin && (
                    <div className={styles.field}>
                        <label className={styles.label}>Нікнейм</label>
                        <input
                            type="text"
                            className={`${styles.input} ${fieldErrors.nickName ? styles.inputError : ''}`}
                            value={nickName}
                            onChange={(e) => setNickName(e.target.value)}
                        />
                        {fieldErrors.nickName && (
                            <span className={styles.errorMessage}>
                                {fieldErrors.nickName}
                            </span>
                        )}
                    </div>
                )}

                <div className={styles.field}>
                    <label className={styles.label}>Email</label>
                    <input
                        type="email"
                        className={`${styles.input} ${fieldErrors.email ? styles.inputError : ''}`}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    {fieldErrors.email && (
                        <span className={styles.errorMessage}>
                            {fieldErrors.email}
                        </span>
                    )}
                </div>

                <div className={styles.field}>
                    <label className={styles.label}>Пароль</label>
                    <input
                        type="password"
                        className={`${styles.input} ${fieldErrors.password ? styles.inputError : ''}`}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    {fieldErrors.password && (
                        <span className={styles.errorMessage}>
                            {fieldErrors.password}
                        </span>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={isSubmitting}
                    className={styles.submitBtn}
                >
                    {isSubmitting
                        ? 'Завантаження...'
                        : isLogin
                          ? 'Увійти'
                          : 'Зареєструватися'}
                </button>
            </form>

            {onGoogleLogin && (
                <button
                    type="button"
                    disabled={isSubmitting}
                    className={styles.googleBtn}
                    onClick={() => void onGoogleLogin()}
                >
                    Продовжити через Google
                </button>
            )}

            <div
                style={{
                    marginTop: '1rem',
                    textAlign: 'center',
                    fontSize: '0.9rem',
                }}
            >
                {isLogin ? (
                    <p>
                        Ще не маєте акаунта?{' '}
                        <Link to="/register">Зареєструватися</Link>
                    </p>
                ) : (
                    <p>
                        Вже маєте акаунт? <Link to="/login">Увійти</Link>
                    </p>
                )}
            </div>
        </div>
    );
};
