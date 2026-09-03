import { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext/useAuth';
import styles from '../../components/AuthForm/AuthForm.module.css';

interface GoogleRegistrationState {
    email?: string;
    accessToken?: string;
    registrationToken?: string;
}

export default function GoogleRegisterPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const { completeGoogleRegistration } = useAuth();
    const state = (location.state as GoogleRegistrationState | null) ?? null;
    const [nickName, setNickName] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Type guard: ensure required fields are present
    if (!state?.email || !state.accessToken || !state.registrationToken)
        return <Navigate to="/login" replace />;

    // After guard, these are guaranteed to be strings
    const email = state.email;
    const accessToken = state.accessToken;
    const registrationToken = state.registrationToken;

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        if (nickName.trim().length < 2 || nickName.trim().length > 40) {
            setError('Нікнейм повинен містити від 2 до 40 символів');
            return;
        }
        if (password.length < 8 || password.length > 72) {
            setError('Пароль повинен містити від 8 до 72 символів');
            return;
        }
        setIsSubmitting(true);
        try {
            await completeGoogleRegistration({
                accessToken,
                registrationToken,
                nickName: nickName.trim(),
                password,
            });
            navigate('/');
        } catch (err: unknown) {
            setError(
                axios.isAxiosError(err)
                    ? String(
                          err.response?.data?.message ??
                              'Не вдалося завершити реєстрацію',
                      )
                    : 'Не вдалося завершити реєстрацію',
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Завершення реєстрації</h1>
            <p className={styles.subtitle}>
                Підтвердіть дані для створення акаунта
            </p>
            {error && <div className={styles.error}>{error}</div>}
            <form
                className={styles.form}
                onSubmit={(event) => void submit(event)}
                noValidate
            >
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="google-email">
                        Email
                    </label>
                    <input
                        id="google-email"
                        className={styles.input}
                        value={email}
                        readOnly
                        disabled
                    />
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="google-nickname">
                        Нікнейм
                    </label>
                    <input
                        id="google-nickname"
                        className={styles.input}
                        value={nickName}
                        onChange={(event) => setNickName(event.target.value)}
                        minLength={2}
                        maxLength={40}
                        required
                    />
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="google-password">
                        Пароль
                    </label>
                    <input
                        id="google-password"
                        type="password"
                        className={styles.input}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        minLength={8}
                        maxLength={72}
                        required
                    />
                </div>
                <button
                    type="submit"
                    className={styles.submitBtn}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? 'Створення...' : 'Завершити реєстрацію'}
                </button>
            </form>
        </div>
    );
}
