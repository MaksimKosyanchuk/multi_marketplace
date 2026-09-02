import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext/useAuth';
import { Role } from '../../types';

interface ProtectedRouteProps {
    allowedRoles?: Role[];
    redirectTo?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
    allowedRoles,
    redirectTo = '/login', // 🟢 Змінено з '/404' на '/login'
}) => {
    const { user, isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return <div>Завантаження...</div>;
    }
    if (!isAuthenticated || !user) {
        return <Navigate to={redirectTo} replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return <Navigate to="/404" replace />;
    }

    return <Outlet />;
};