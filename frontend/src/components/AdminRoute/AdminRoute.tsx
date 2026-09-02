import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext/useAuth';

export const AdminRoute = () => {
    const { user, isLoading } = useAuth();

    if (isLoading) return <div>Загрузка...</div>;

    return user && user.role === 'ADMIN' ? (
        <Outlet />
    ) : (
        <Navigate to="/" replace />
    );
};
