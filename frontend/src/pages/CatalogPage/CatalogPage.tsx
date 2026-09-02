import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    type Product,
    ProductSort,
    type QueryProductParams,
} from '../../types/product.type';
import { productService } from '../../services/productService';
import { cartService } from '../../services/cartService';
import { useAuth } from '../../context/AuthContext/useAuth';
import { ProductCard } from '../../components/ProductCard/ProductCard';
import { Modal } from '../../components/Modal/Modal';
import { Button } from '../../components/Ui/Button/Button';
import styles from './CatalogPage.module.css';

interface CartItem {
    productId?: string;
    product?: {
        id: string;
    };
}

interface CartData {
    items: CartItem[];
}

type ModalType = 'auth' | 'cart_success' | 'cart_error' | null;

export const CatalogPage: React.FC = () => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();

    const [products, setProducts] = useState<Product[]>([]);
    const [cartItemIds, setCartItemIds] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [modalType, setModalType] = useState<ModalType>(null);
    const [selectedProductName, setSelectedProductName] =
        useState<string>('');

    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<ProductSort>(ProductSort.NEWEST);
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(1);

    const fetchCart = useCallback(async () => {
        if (!isAuthenticated) {
            setCartItemIds([]);
            return;
        }

        try {
            const cartData = (await cartService.getCart()) as CartData;

            const ids = cartData.items
                .map((item) => item.productId ?? item.product?.id)
                .filter((id): id is string => id !== undefined);

            setCartItemIds(ids);
        } catch (err: unknown) {
            console.error('Помилка завантаження кошика:', err);
        }
    }, [isAuthenticated]);

    const fetchProducts = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const params: QueryProductParams = {
                page,
                limit: 8,
                sort,
                ...(search.trim() && {
                    search: search.trim(),
                }),
            };

            const data = await productService.getAll(params);

            setProducts(data.items);
            setPageCount(data.meta.pageCount);
        } catch {
            setError('Не вдалося завантажити товари');
        } finally {
            setIsLoading(false);
        }
    }, [page, sort, search]);

    useEffect(() => {
        const loadData = async () => {
            await Promise.all([
                fetchProducts(),
                fetchCart(),
            ]);
        };

        void loadData();
    }, [fetchProducts, fetchCart]);

    const handleAddToCart = async (product: Product) => {
        if (!isAuthenticated) {
            setModalType('auth');
            return;
        }

        try {
            await cartService.addToCart(product.id, 1);

            setCartItemIds((prev) => {
                if (prev.includes(product.id)) {
                    return prev;
                }

                return [...prev, product.id];
            });

            setSelectedProductName(product.name);
            setModalType('cart_success');
        } catch (err: unknown) {
            console.error('Помилка додавання в кошик:', err);
            setModalType('cart_error');
        }
    };

    const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setPage(1);
    };

    const handleSortChange = (
        e: React.ChangeEvent<HTMLSelectElement>,
    ) => {
        setSort(e.target.value as ProductSort);
        setPage(1);
    };

    const closeModal = () => setModalType(null);

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Каталог товарів</h1>

            <div className={styles.toolbar}>
                <form
                    onSubmit={handleSearchSubmit}
                    className={styles.searchForm}
                >
                    <input
                        type="text"
                        placeholder="Пошук товарів..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={styles.searchInput}
                    />

                    <button
                        type="submit"
                        className={styles.searchBtn}
                    >
                        Шукати
                    </button>
                </form>

                <div className={styles.sortWrapper}>
                    <label
                        htmlFor="sort"
                        className={styles.sortLabel}
                    >
                        Сортування:
                    </label>

                    <select
                        id="sort"
                        value={sort}
                        onChange={handleSortChange}
                        className={styles.select}
                    >
                        <option value={ProductSort.NEWEST}>
                            Спочатку нові
                        </option>

                        <option value={ProductSort.PRICE_ASC}>
                            Від дешевих до дорогих
                        </option>

                        <option value={ProductSort.PRICE_DESC}>
                            Від дорогих до дешевих
                        </option>
                    </select>
                </div>
            </div>

            {isLoading ? (
                <div className={styles.status}>
                    Завантаження товарів...
                </div>
            ) : error ? (
                <div className={styles.statusError}>
                    {error}
                </div>
            ) : products.length === 0 ? (
                <div className={styles.status}>
                    Товарів не знайдено
                </div>
            ) : (
                <>
                    <div className={styles.grid}>
                        {products.map((product) => (
                            <ProductCard
                                key={product.id}
                                product={product}
                                isInCart={cartItemIds.includes(
                                    product.id,
                                )}
                                onAddToCart={handleAddToCart}
                            />
                        ))}
                    </div>

                    {pageCount > 1 && (
                        <div className={styles.pagination}>
                            <button
                                type="button"
                                disabled={page === 1}
                                onClick={() =>
                                    setPage((p) => p - 1)
                                }
                                className={styles.pageBtn}
                            >
                                Назад
                            </button>

                            <span className={styles.pageInfo}>
                                {page} з {pageCount}
                            </span>

                            <button
                                type="button"
                                disabled={page === pageCount}
                                onClick={() =>
                                    setPage((p) => p + 1)
                                }
                                className={styles.pageBtn}
                            >
                                Вперед
                            </button>
                        </div>
                    )}
                </>
            )}

            <Modal
                isOpen={modalType !== null}
                onClose={closeModal}
                title={
                    modalType === 'auth'
                        ? 'Потрібна авторизація'
                        : modalType === 'cart_success'
                            ? 'Товар додано!'
                            : 'Помилка'
                }
                actions={
                    modalType === 'auth' ? (
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
                    ) : modalType === 'cart_success' ? (
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
                    ) : (
                        <Button
                            variant="primary"
                            size="small"
                            onClick={closeModal}
                        >
                            Зрозуміло
                        </Button>
                    )
                }
            >
                <p>
                    {modalType === 'auth' &&
                        'Щоб додати товар до кошика та оформити замовлення, увійдіть у свій акаунт.'}
                    {modalType === 'cart_success' &&
                        `Товар «${selectedProductName}» успішно додано до вашого кошика.`}
                    {modalType === 'cart_error' &&
                        'Не вдалося додати товар у кошик. Спробуйте пізніше.'}
                </p>
            </Modal>
        </div>
    );
};

export default CatalogPage;