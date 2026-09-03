import { useEffect, useState, useSyncExternalStore } from 'react';
import { useParams } from 'react-router-dom';
import { productService } from '../../services/productService';
import { reviewService } from '../../services/reviewService';
import { cartService } from '../../services/cartService';
import { onStockUpdate } from '../../services/socketClient';
import { realtimeStore } from '../../services/realtimeStore';
import { useAuth } from '../../context/AuthContext/useAuth';
import { Button } from '../../components/Ui/Button/Button';
import type { Product } from '../../types/product.type';
import type { ReviewSummary } from '../../types/marketplace.type';
import styles from './ProductPage.module.css';

export default function ProductPage() {
    const { id } = useParams<{ id: string }>();
    const [product, setProduct] = useState<Product | null>(null);
    const [reviews, setReviews] = useState<ReviewSummary | null>(null);
    const [added, setAdded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { socket } = useAuth();
    const realtimeStock = useSyncExternalStore(
        realtimeStore.subscribe,
        () => (id ? realtimeStore.getSnapshot().stock[id] : undefined),
    );

    useEffect(() => {
        if (!id) return;
        void Promise.all([productService.getById(id), reviewService.listForProduct(id)])
            .then(([loadedProduct, loadedReviews]) => {
                setProduct(loadedProduct);
                setReviews(loadedReviews);
            })
            .catch(() => setError('Не вдалося завантажити товар'));
        if (!socket) return;
        return onStockUpdate((update) => {
            if (update.productId === id) {
                setProduct((current) => current ? { ...current, stock: update.quantity } : current);
            }
        });
    }, [id, socket]);

    useEffect(() => {
        if (realtimeStock === undefined) return;
        setProduct((current) => current ? { ...current, stock: realtimeStock } : current);
    }, [realtimeStock]);

    if (error) return <div className={styles.container}>{error}</div>;
    if (!product) return <div className={styles.container}>Завантаження...</div>;

    const addToCart = async () => {
        await cartService.addToCart(product.id);
        setAdded(true);
    };

    return (
        <main className={styles.container}>
            <section className={styles.product}>
                {product.imageUrl && <img className={styles.image} src={product.imageUrl} alt={product.name} />}
                <div className={styles.info}>
                    <span className={styles.category}>{product.category?.name ?? 'Товар'}</span>
                    <h1>{product.name}</h1>
                    <p>{product.description || 'Опис товару відсутній.'}</p>
                    <strong>${Number(product.price).toFixed(2)}</strong>
                    <span className={styles.stock}>В наявності: {product.stock}</span>
                    <Button onClick={() => void addToCart()} disabled={product.stock < 1 || added}>
                        {added ? 'Додано до кошика' : 'Додати в кошик'}
                    </Button>
                </div>
            </section>
            <section className={styles.reviews}>
                <h2>Відгуки та рейтинг</h2>
                <div className={styles.rating}>
                    <span className={styles.stars}>{'★'.repeat(Math.round(reviews?.averageRating ?? 0))}{'☆'.repeat(5 - Math.round(reviews?.averageRating ?? 0))}</span>
                    <span>{(reviews?.averageRating ?? 0).toFixed(1)} ({reviews?.reviewCount ?? 0})</span>
                </div>
                {reviews?.reviews.map((review) => (
                    <article className={styles.review} key={review.id}>
                        <strong>{review.author?.nickName ?? 'Покупець'}</strong>
                        <span className={styles.stars}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
                        {review.comment && <p>{review.comment}</p>}
                    </article>
                ))}
            </section>
        </main>
    );
}
