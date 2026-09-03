import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import type { Product } from '../../types/product.type';
import { cartService } from '../../services/cartService';
import { useAuth } from '../../context/AuthContext/useAuth';
import { Modal } from '../Modal/Modal';
import { Button } from '../Ui/Button/Button';
import { getImageUrl } from '../../utils/getImageUrl';
import { Role } from '../../types';
import styles from './ProductCard.module.css';

interface ProductCardProps {
    product: Product;
    isAdmin?: boolean;
    isInCart?: boolean;
    onEdit?: (product: Product) => void;
    onDelete?: (product: Product) => void;
    onRestore?: (product: Product) => Promise<void> | void;
    onPublish?: (product: Product) => Promise<void> | void;
    onAddToCart?: (product: Product) => Promise<void> | void;
}

type ModalState = 'none' | 'auth' | 'success' | 'error';

const productStatusLabels: Record<NonNullable<Product['status']>, string> = {
    DRAFT: 'Чернетка',
    PENDING_APPROVAL: 'На модерації',
    ACTIVE: 'Активний',
    REJECTED: 'Відхилений',
    ARCHIVED: 'В архіві',
    SOLD: 'Проданий',
};

export const ProductCard: React.FC<ProductCardProps> = ({
    product,
    isAdmin = false,
    isInCart = false,
    onEdit,
    onDelete,
    onRestore,
    onPublish,
    onAddToCart,
}) => {
    const navigate = useNavigate();
    const { isAuthenticated, user } = useAuth();

    const [isLoading, setIsLoading] = useState(false);
    const [modalState, setModalState] = useState<ModalState>('none');
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [imageError, setImageError] = useState(false);

    if (!product || typeof product !== 'object' || !product.id) {
        return (
            <div className={styles.cardError}>
                <p>Помилка: Некоректні дані товару.</p>
            </div>
        );
    }

    const numericPrice = Number(product.price);
    const isValidPrice = !isNaN(numericPrice) && numericPrice >= 0;

    const isOutOfStock = product.stock <= 0;
    const isArchived = product.isArchived || product.status === 'ARCHIVED';

    const fullImageUrl = product.imageUrl
        ? getImageUrl(product.imageUrl)
        : null;

    const handleAddToCart = async () => {
        if (!product.id || isOutOfStock) return;

        if (!isValidPrice) {
            setErrorMessage('Неможливо додати товар з некоректною ціною.');
            setModalState('error');
            return;
        }

        if (onAddToCart) {
            try {
                await onAddToCart(product);
            } catch {
                setErrorMessage('Не вдалося додати товар у кошик.');
                setModalState('error');
            }
            return;
        }

        if (!isAuthenticated) {
            setModalState('auth');
            return;
        }

        if (user && user.role !== Role.CUSTOMER) {
            setErrorMessage(
                'Купувати товари можуть лише покупці. Для продажу потрібен статус продавця.',
            );
            setModalState('error');
            return;
        }

        setIsLoading(true);
        try {
            await cartService.addToCart(product.id, 1);
            setModalState('success');
        } catch (err) {
            if (err instanceof AxiosError && err.response?.data?.message) {
                const msg = Array.isArray(err.response.data.message)
                    ? err.response.data.message[0]
                    : err.response.data.message;
                setErrorMessage(msg);
            } else {
                setErrorMessage(
                    'Не вдалося додати товар у кошик. Спробуйте пізніше.',
                );
            }
            setModalState('error');
        } finally {
            setIsLoading(false);
        }
    };

    const closeModal = () => setModalState('none');

    const renderActionButton = () => {
        if (isAdmin) {
            if (isArchived) {
                return (
                    <Button
                        variant="secondary"
                        size="medium"
                        onClick={() => onRestore?.(product)}
                        className={styles.restoreBtn}
                    >
                        Відновити
                    </Button>
                );
            }

            if (product.status === 'DRAFT') {
                return (
                    <div className={styles.footer}>
                        <Button
                            variant="primary"
                            size="medium"
                            onClick={() => onPublish?.(product)}
                            className={styles.addBtn}
                        >
                            Опублікувати
                        </Button>
                        <Button
                            variant="secondary"
                            size="medium"
                            onClick={() => onDelete?.(product)}
                            className={styles.deleteBtn}
                        >
                            Видалити
                        </Button>
                    </div>
                );
            }

            return (
                <Button
                    variant="secondary"
                    size="medium"
                    onClick={() => onDelete?.(product)}
                    className={styles.deleteBtn}
                >
                    Видалити
                </Button>
            );
        }

        if (isOutOfStock) {
            return (
                <Button
                    variant="secondary"
                    size="medium"
                    disabled={true}
                    className={styles.outOfStockBtn}
                >
                    Немає в наявності
                </Button>
            );
        }

        if (isInCart) {
            return (
                <Button
                    variant="secondary"
                    size="medium"
                    onClick={() => navigate('/cart')}
                    className={styles.inCartBtn}
                >
                    В кошику
                </Button>
            );
        }

        return (
            <Button
                variant="primary"
                size="medium"
                onClick={handleAddToCart}
                disabled={isLoading || !isValidPrice}
                className={styles.addBtn}
            >
                {isLoading ? 'Додавання...' : 'У кошик'}
            </Button>
        );
    };

    return (
        <>
            <div
                className={`${styles.card} ${isArchived ? styles.archivedCard : ''}`}
            >
                {isArchived && (
                    <div className={styles.archivedBadge}>В архіві</div>
                )}

                {/* Плашка "Немає в наявності" для клієнтської частини */}
                {!isAdmin && isOutOfStock && !isArchived && (
                    <div className={styles.outOfStockBadge}>
                        Немає в наявності
                    </div>
                )}

                <div className={styles.imageWrapper}>
                    {fullImageUrl && !imageError ? (
                        <img
                            src={fullImageUrl}
                            alt={product.name || 'Товар'}
                            className={styles.image}
                            onError={() => setImageError(true)}
                        />
                    ) : (
                        <div className={styles.placeholder}>Немає фото</div>
                    )}
                </div>

                <div className={styles.content}>
                    <div className={styles.header}>
                        <div className={styles.titleGroup}>
                            {product.category?.name && (
                                <span className={styles.category}>
                                    {product.category.name}
                                </span>
                            )}
                            <h3 className={styles.title}>
                                <Link to={`/product/${product.id}`}>
                                    {product.name || 'Без назви'}
                                </Link>
                            </h3>
                        </div>
                        <span className={styles.price}>
                            ${isValidPrice ? numericPrice.toFixed(2) : '0.00'}
                        </span>
                    </div>

                    {isAdmin && product.status && (
                        <span
                            className={`${styles.statusBadge} ${styles[`status${product.status}`]}`}
                        >
                            Статус: {productStatusLabels[product.status]}
                        </span>
                    )}

                    {product.description && (
                        <p className={styles.description}>
                            {product.description}
                        </p>
                    )}

                    <div className={styles.footer}>{renderActionButton()}</div>
                </div>
            </div>

            {!isAdmin && (
                <>
                    <Modal
                        isOpen={modalState === 'auth'}
                        onClose={closeModal}
                        title="Потрібна авторизація"
                        actions={
                            <>
                                <Button
                                    variant="secondary"
                                    size="small"
                                    onClick={closeModal}
                                >
                                    Скасувати
                                </Button>
                                <Button
                                    variant="primary"
                                    size="small"
                                    onClick={() => {
                                        closeModal();
                                        navigate('/login');
                                    }}
                                >
                                    Увійти
                                </Button>
                            </>
                        }
                    >
                        <p>
                            Щоб додати товар до кошика та оформити замовлення,
                            увійдіть у свій акаунт.
                        </p>
                    </Modal>

                    <Modal
                        isOpen={modalState === 'success'}
                        onClose={closeModal}
                        title="Товар додано!"
                        actions={
                            <>
                                <Button
                                    variant="secondary"
                                    size="small"
                                    onClick={closeModal}
                                >
                                    Продовжити покупки
                                </Button>
                                <Button
                                    variant="primary"
                                    size="small"
                                    onClick={() => {
                                        closeModal();
                                        navigate('/cart');
                                    }}
                                >
                                    Перейти в кошик
                                </Button>
                            </>
                        }
                    >
                        <p>
                            Товар <strong>«{product.name || 'Товар'}»</strong>{' '}
                            успішно додано до вашого кошика.
                        </p>
                    </Modal>

                    <Modal
                        isOpen={modalState === 'error'}
                        onClose={closeModal}
                        title="Не вдалося додати товар"
                        actions={
                            <Button
                                variant="primary"
                                size="small"
                                onClick={closeModal}
                            >
                                Зрозуміло
                            </Button>
                        }
                    >
                        <p>{errorMessage}</p>
                    </Modal>
                </>
            )}
        </>
    );
};
