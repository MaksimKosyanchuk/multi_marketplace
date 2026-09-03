import React, { useCallback, useEffect, useState } from 'react';
import { AuctionCard } from '../../../components/AuctionCard/AuctionCard';
import { ProductCard } from '../../../components/ProductCard/ProductCard';
import { productService } from '../../../services/productService';
import { sellerService } from '../../../services/sellerService';
import type { Product } from '../../../types/product.type';
import styles from './ApprovalsPage.module.css';

interface SellerApplication {
    id: string;
    displayName: string;
    description?: string;
    user?: { email?: string; nickName?: string };
}

export const ApprovalsPage: React.FC = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [applications, setApplications] = useState<SellerApplication[]>([]);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [pendingProducts, pendingApplications] = await Promise.all([
                productService.getPendingApproval(),
                sellerService.listPendingApplications(),
            ]);
            setProducts(pendingProducts);
            setApplications(pendingApplications as SellerApplication[]);
            setError(null);
        } catch (err) {
            console.error('Помилка завантаження одобрень:', err);
            setError('Не вдалося завантажити список заявок.');
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const moderateProduct = async (product: Product, approve: boolean) => {
        try {
            if (approve) {
                await productService.approveProduct(product.id);
            } else {
                await productService.rejectProduct(product.id);
            }
            setProducts((current) => current.filter((item) => item.id !== product.id));
        } catch (err) {
            console.error('Помилка модерації товару:', err);
            setError('Не вдалося обробити товар.');
        }
    };

    const moderateApplication = async (application: SellerApplication, approve: boolean) => {
        try {
            if (approve) {
                await sellerService.approveApplication(application.id);
            } else {
                await sellerService.rejectApplication(application.id);
            }
            setApplications((current) => current.filter((item) => item.id !== application.id));
        } catch (err) {
            console.error('Помилка модерації заявки продавця:', err);
            setError('Не вдалося обробити заявку продавця.');
        }
    };

    const pendingAuctions = products.filter((product) => product.type === 'AUCTION');
    const pendingRegularProducts = products.filter((product) => product.type !== 'AUCTION');

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>Одобрення</h1>
                <button type="button" onClick={() => void load()}>Оновити</button>
            </div>
            {error && <div className={styles.error}>{error}</div>}

            <section>
                <h2>Заявки продавців</h2>
                {applications.length === 0 ? <p>Очікуючих заявок немає.</p> : (
                    <div className={styles.list}>
                        {applications.map((application) => (
                            <article className={styles.application} key={application.id}>
                                <div>
                                    <strong>{application.displayName}</strong>
                                    <span>{application.user?.email ?? application.user?.nickName ?? 'Користувач'}</span>
                                    {application.description && <p>{application.description}</p>}
                                </div>
                                <div className={styles.actions}>
                                    <button type="button" onClick={() => void moderateApplication(application, true)}>Одобрити</button>
                                    <button type="button" onClick={() => void moderateApplication(application, false)}>Відхилити</button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <section>
                <h2>Аукціони на перевірці</h2>
                {pendingAuctions.length === 0 ? <p>Очікуючих аукціонів немає.</p> : (
                    <div className={styles.grid}>
                        {pendingAuctions.map((product) => (
                            <AuctionCard
                                key={product.id}
                                product={product}
                                onApprove={() => moderateProduct(product, true)}
                                onReject={() => moderateProduct(product, false)}
                            />
                        ))}
                    </div>
                )}
            </section>

            <section>
                <h2>Товари на перевірці</h2>
                {pendingRegularProducts.length === 0 ? <p>Очікуючих товарів немає.</p> : (
                    <div className={styles.grid}>
                        {pendingRegularProducts.map((product) => (
                            <ProductCard
                                key={product.id}
                                product={product}
                                isAdmin
                                onApprove={() => moderateProduct(product, true)}
                                onReject={() => moderateProduct(product, false)}
                            />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

export default ApprovalsPage;
