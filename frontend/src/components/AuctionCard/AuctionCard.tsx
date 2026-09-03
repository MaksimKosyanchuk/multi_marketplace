import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { Product } from '../../types/product.type';
import { Role } from '../../types';
import { useAuth } from '../../context/AuthContext/useAuth';
import { Button } from '../Ui/Button/Button';
import { getImageUrl } from '../../utils/getImageUrl';
import styles from '../ProductCard/ProductCard.module.css';

interface AuctionCardProps {
    product: Product;
    onEdit?: (product: Product) => void;
    onDelete?: (product: Product) => void;
    onPublish?: (product: Product) => Promise<void> | void;
}

const labels: Record<string, string> = {
    DRAFT: 'Чернетка',
    PENDING_APPROVAL: 'Очікує перевірки',
    ACTIVE: 'Активний',
    SOLD: 'Проданий переможцю',
    EXPIRED: 'Завершений без ставок',
    ENDED: 'Завершений',
    CANCELLED: 'Скасований',
};

export const AuctionCard: React.FC<AuctionCardProps> = ({
    product,
    onEdit,
    onDelete,
    onPublish,
}) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const isSellerManagement =
        user?.role === Role.SELLER || user?.role === Role.ADMIN;
    const status = product.auctionStatus ?? product.status ?? 'DRAFT';
    const finished = ['SOLD', 'EXPIRED', 'ENDED', 'CANCELLED'].includes(status);
    const imageUrl = product.imageUrl ? getImageUrl(product.imageUrl) : null;

    return (
        <div className={styles.card}>
            <div className={styles.imageWrapper}>
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt={product.name || 'Аукціон'}
                        className={styles.image}
                    />
                ) : (
                    <div className={styles.placeholder}>Немає фото</div>
                )}
            </div>
            <div className={styles.content}>
                <div className={styles.header}>
                    <div className={styles.titleGroup}>
                        <span className={styles.category}>Аукціон</span>
                        <h3 className={styles.title}>{product.name}</h3>
                    </div>
                    <span className={styles.price}>
                        ${Number(product.price).toFixed(2)}
                    </span>
                </div>
                {product.description && (
                    <p className={styles.description}>{product.description}</p>
                )}
                <span className={styles.statusBadge}>
                    {labels[status] ?? status}
                </span>
                <div className={styles.footer}>
                    {product.auctionId &&
                        (status === 'ACTIVE' || finished) && (
                        <Button
                            variant="primary"
                            size="medium"
                            onClick={() =>
                                navigate(`/auction/${product.auctionId}`)
                            }
                        >
                            {isSellerManagement && !finished
                                ? status === 'ACTIVE'
                                    ? 'Перейти до аукціону'
                                    : 'Перейти'
                                : 'Перейти до аукціону'}
                        </Button>
                    )}
                    {isSellerManagement && status === 'DRAFT' && (
                        <>
                            <Button
                                variant="secondary"
                                size="medium"
                                onClick={() => onEdit?.(product)}
                            >
                                Редагувати
                            </Button>
                            <Button
                                variant="primary"
                                size="medium"
                                onClick={() => onPublish?.(product)}
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
                        </>
                    )}
                    {isSellerManagement && status === 'PENDING_APPROVAL' && (
                            <Button
                                variant="secondary"
                                size="medium"
                                onClick={() => onDelete?.(product)}
                                className={styles.deleteBtn}
                            >
                                Скасувати
                            </Button>
                        )}
                    {isSellerManagement && status === 'ACTIVE' && (
                        <Button
                            variant="secondary"
                            size="medium"
                            onClick={() => onDelete?.(product)}
                            className={styles.deleteBtn}
                        >
                            Видалити
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};
