import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext/useAuth';
import { AuthForm } from '../../components/AuthForm/AuthForm';

export default function LoginPage() {
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleLogin = async (data: { email: string; password: string }) => {
        setError(null);
        setIsSubmitting(true);
        try {
            await login({ email: data.email, password: data.password });
            navigate('/');
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const serverMessage = err.response?.data?.message;
                setError(Array.isArray(serverMessage) ? serverMessage.join(', ') : serverMessage || 'Невірний email або пароль');
            } else {
                setError('Не вдалося увійти. Перевірте з’єднання з сервером.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return <AuthForm type="login" onSubmit={handleLogin} error={error} isSubmitting={isSubmitting} />;
}