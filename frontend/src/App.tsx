import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext/AuthContext';

// Layouts
import { MainLayout } from './layouts/MainLayout/MainLayout';
import { AdminLayout } from './layouts/AdminLayout/AdminLayout';

// Components
import { ProtectedRoute } from './components/ProtectedRoute/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute/AdminRoute';

// Pages
import CatalogPage from './pages/CatalogPage/CatalogPage';
import ProductPage from './pages/ProductPage/ProductPage';
import LoginPage from './pages/LoginPage/LoginPage';
import RegisterPage from './pages/RegisterPage/RegisterPage';
import GoogleRegisterPage from './pages/GoogleRegisterPage/GoogleRegisterPage';
import CartPage from './pages/CartPage/CartPage';
import ProfilePage from './pages/ProfilePage/ProfilePage';

// Admin Pages
import DashboardPage from './pages/AdminPage/DashboardPage/DashboardPage';
import OrdersPage from './pages/AdminPage/OrdersPage/OrdersPage';
import ProductsPage from './pages/AdminPage/ProductsPage/ProductsPage';
import CategoriesPage from './pages/AdminPage/CategoriesPage/CategoriesPage';

import NotFoundPage from './pages/NotFoundPage/NotFoundPage';

export function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<MainLayout />}>
                        <Route index element={<CatalogPage />} />
                        <Route path="product/:id" element={<ProductPage />} />
                        <Route path="login" element={<LoginPage />} />
                        <Route path="register" element={<RegisterPage />} />
                        <Route
                            path="register/google"
                            element={<GoogleRegisterPage />}
                        />

                        <Route element={<ProtectedRoute />}>
                            <Route path="cart" element={<CartPage />} />
                            <Route path="profile" element={<ProfilePage />} />
                        </Route>
                    </Route>

                    <Route element={<AdminRoute />}>
                        <Route path="/admin" element={<AdminLayout />}>
                            <Route
                                index
                                element={<Navigate to="dashboard" replace />}
                            />
                            <Route path="products" element={<ProductsPage />} />
                            <Route
                                path="categories"
                                element={<CategoriesPage />}
                            />
                            <Route
                                path="dashboard"
                                element={<DashboardPage />}
                            />
                            <Route path="orders" element={<OrdersPage />} />
                        </Route>
                    </Route>

                    <Route path="404" element={<NotFoundPage />} />
                    <Route path="*" element={<Navigate to="/404" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
