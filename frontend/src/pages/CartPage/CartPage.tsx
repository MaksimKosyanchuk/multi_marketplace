import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { cartService } from '../../services/cartService';
import { orderService } from '../../services/orderService';
import { Modal } from '../../components/Modal/Modal';
import { Button } from '../../components/Ui/Button/Button';
import styles from './CartPage.module.css';

export interface CartItem {
    id: string;
    quantity: number;
    product: {
        id: string;
        name?: string;
        title?: string;
        sellerId?: string;
        seller?: { id?: string; nickName?: string; email?: string };
        price: number;
        imageUrl?: string;
        stock: number;
    };
}

export interface CartData {
    id: string;
    items: CartItem[];
    totalAmount?: number;
}

export const CartPage: React.FC = () => {
    const navigate = useNavigate();

    const [cart, setCart] = useState<CartData | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);

    useEffect(() => {
        let isMounted = true;

        const loadCart = async () => {
            setIsLoading(true);

            try {
                const data = await cartService.getCart();

                if (isMounted) {
                    setCart(data);
                }
            } catch (err) {
                console.error('Помилка завантаження кошика:', err);
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        void loadCart();

        return () => {
            isMounted = false;
        };
    }, []);

    const getErrorMessage = (
        err: unknown,
        fallbackMessage: string,
    ): string => {
        if (err instanceof AxiosError && err.response?.data?.message) {
            const message = err.response.data.message;

            return Array.isArray(message) ? message[0] : message;
        }

        return fallbackMessage;
    };

    const handleQuantityChange = async (
        itemId: string,
        newQuantity: number,
    ) => {
        if (newQuantity < 1 || !cart) return;

        const previousCart = cart;

        setCart((currentCart) => {
            if (!currentCart) return currentCart;

            return {
                ...currentCart,
                items: currentCart.items.map((item) =>
                    item.id === itemId
                        ? {
                            ...item,
                            quantity: newQuantity,
                        }
                        : item,
                ),
            };
        });

        setUpdatingItemId(itemId);

        try {
            await cartService.updateItemQuantity(itemId, newQuantity);
        } catch (err) {
            setCart(previousCart);

            setErrorMessage(
                getErrorMessage(
                    err,
                    'Не вдалося оновити кількість товару.',
                ),
            );
        } finally {
            setUpdatingItemId(null);
        }
    };

    const handleRemoveItem = async (itemId: string) => {
        if (!cart) return;

        const previousCart = cart;

        setCart((currentCart) => {
            if (!currentCart) return currentCart;

            return {
                ...currentCart,
                items: currentCart.items.filter(
                    (item) => item.id !== itemId,
                ),
            };
        });

        setUpdatingItemId(itemId);

        try {
            await cartService.removeItem(itemId);
        } catch (err) {
            setCart(previousCart);

            setErrorMessage(
                getErrorMessage(
                    err,
                    'Не вдалося видалити товар з кошика.',
                ),
            );
        } finally {
            setUpdatingItemId(null);
        }
    };

    const handleCheckout = async () => {
        setIsSubmitting(true);

        try {
            await orderService.checkout();

            setShowSuccessModal(true);
        } catch (err) {
            setErrorMessage(
                getErrorMessage(
                    err,
                    'Не вдалося оформити замовлення.',
                ),
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCloseModal = () => {
        setShowSuccessModal(false);
        setCart(null);
    };

    const totalPrice =
        cart?.items.reduce(
            (sum, item) => sum + item.product.price * item.quantity,
            0,
        )         ?? cart?.totalAmount
        ?? 0;

    if (isLoading) {
        return (
            <div className={styles.container}>
                Завантаження кошика...
            </div>
        );
    }

    if (!cart || cart.items.length === 0) {
        return (
            <div className={styles.emptyContainer}>
                <h2>Ваш кошик порожній 🛒</h2>

                <p>
                    Перегляньте каталог та додайте потрібні товари.
                </p>

                <Link to="/">
                    <Button variant="primary" size="medium">
                        Перейти до каталогу
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Мій кошик</h1>

            <div className={styles.layout}>
                <div className={styles.itemsList}>
                    {cart.items.map((item) => (
                        <div
                            key={item.id}
                            className={styles.cartItem}
                        >
                            <div className={styles.imageWrapper}>
                                {item.product.imageUrl ? (
                                    <img
                                        src={item.product.imageUrl}
                                        alt={item.product.name ?? item.product.title ?? 'Товар'}
                                    />
                                ) : (
                                    <div
                                        className={
                                            styles.placeholder
                                        }
                                    >
                                        Немає фото
                                    </div>
                                )}
                            </div>

                            <div className={styles.itemInfo}>
                                <Link
                                    to={`/products/${item.product.id}`}
                                    className={styles.productName}
                                >
                                    {item.product.name ?? item.product.title ?? 'Товар'}
                                </Link>

                                <div className={styles.seller}>
                                    Продавець:{' '}
                                    {item.product.seller?.nickName ??
                                        item.product.seller?.email ??
                                        item.product.sellerId ??
                                        'Невідомий'}
                                </div>
                                <div
                                    className={
                                        styles.productPrice
                                    }
                                >
                                    ${item.product.price} / шт.
                                </div>
                            </div>

                            <div
                                className={
                                    styles.quantityControls
                                }
                            >
                                <button
                                    className={styles.qtyBtn}
                                    disabled={
                                        updatingItemId ===
                                            item.id ||
                                        item.quantity <= 1
                                    }
                                    onClick={() =>
                                        void handleQuantityChange(
                                            item.id,
                                            item.quantity - 1,
                                        )
                                    }
                                >
                                    −
                                </button>

                                <span
                                    className={styles.quantity}
                                >
                                    {item.quantity}
                                </span>

                                <button
                                    className={styles.qtyBtn}
                                    disabled={
                                        updatingItemId ===
                                            item.id ||
                                        item.quantity >=
                                            item.product.stock
                                    }
                                    onClick={() =>
                                        void handleQuantityChange(
                                            item.id,
                                            item.quantity + 1,
                                        )
                                    }
                                >
                                    +
                                </button>
                            </div>

                            <div className={styles.itemTotal}>
                                $
                                {(
                                    item.product.price *
                                    item.quantity
                                ).toFixed(2)}
                            </div>

                            <button
                                className={styles.removeBtn}
                                disabled={
                                    updatingItemId === item.id
                                }
                                onClick={() =>
                                    void handleRemoveItem(item.id)
                                }
                                title="Видалити"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>

                <div className={styles.summaryCard}>
                    <h2 className={styles.summaryTitle}>
                        Підсумок замовлення
                    </h2>

                    <div className={styles.summaryRow}>
                        <span>Кількість товарів:</span>

                        <span>
                            {cart.items.reduce(
                                (sum, item) =>
                                    sum + item.quantity,
                                0,
                            )}{' '}
                            шт.
                        </span>
                    </div>

                    <div
                        className={`${styles.summaryRow} ${styles.totalRow}`}
                    >
                        <span>Разом:</span>

                        <span className={styles.totalPrice}>
                            ${totalPrice.toFixed(2)}
                        </span>
                    </div>

                    <div className={styles.actionWrapper}>
                        <Button
                            variant="primary"
                            size="medium"
                            className={styles.checkoutBtn}
                            onClick={() =>
                                void handleCheckout()
                            }
                            disabled={isSubmitting}
                        >
                            {isSubmitting
                                ? 'Оформлення...'
                                : 'Оформити замовлення'}
                        </Button>
                    </div>
                </div>
            </div>

            <Modal
                isOpen={Boolean(errorMessage)}
                onClose={() => setErrorMessage(null)}
                title="Увага"
                actions={
                    <Button
                        variant="primary"
                        size="small"
                        onClick={() =>
                            setErrorMessage(null)
                        }
                    >
                        Зрозуміло
                    </Button>
                }
            >
                <p>{errorMessage}</p>
            </Modal>

            <Modal
                isOpen={showSuccessModal}
                onClose={handleCloseModal}
                title="Замовлення успішно створено 🎉"
                actions={
                    <>
                        <Button
                            variant="secondary"
                            size="small"
                            onClick={() => navigate('/')}
                        >
                            На головну
                        </Button>

                        <Button
                            variant="primary"
                            size="small"
                            onClick={() =>
                                navigate('/profile')
                            }
                        >
                            До моїх замовлень
                        </Button>
                    </>
                }
            >
                <p>
                    Ваше замовлення прийнято в обробку. Ви
                    можете переглянути його та оплатити у
                    профілі.
                </p>
            </Modal>
        </div>
    );
};

export default CartPage;