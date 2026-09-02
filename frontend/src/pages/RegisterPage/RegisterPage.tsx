import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext/useAuth';
import { AuthForm } from '../../components/AuthForm/AuthForm';

export default function RegisterPage() {
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { register } = useAuth();
    const navigate = useNavigate();

    const handleRegister = async (data: { email: string; password: string; nickName?: string }) => {
        setError(null);
        setIsSubmitting(true);
        try {
            await register({ email: data.email, password: data.password, nickName: data.nickName ?? '' });
            navigate('/');
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const serverMessage = err.response?.data?.message;
                setError(Array.isArray(serverMessage) ? serverMessage.join(', ') : serverMessage || 'Не вдалося зареєструватися');
            } else {
                setError('Не вдалося зареєструватися. Перевірте з’єднання з сервером.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return <AuthForm type="register" onSubmit={handleRegister} error={error} isSubmitting={isSubmitting} />;
}