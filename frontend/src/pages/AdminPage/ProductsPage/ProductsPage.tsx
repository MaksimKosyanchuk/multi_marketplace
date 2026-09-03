import React, { useEffect, useState, useCallback, useRef } from 'react';
import { productService } from '../../../services/productService';
import { categoriesService, type Category } from '../../../services/categoryService';
import { ProductCard } from '../../../components/ProductCard/ProductCard';
import { getImageUrl } from '../../../utils/getImageUrl';
import styles from './ProductsPage.module.css';
import type { Product } from '../../../types/product.type';
import { Role } from '../../../types';
import { useAuth } from '../../../context/AuthContext/useAuth';
import { auctionService } from '../../../services/auctionService';
import { AuctionCard } from '../../../components/AuctionCard/AuctionCard';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE_MB = 5;

interface FormErrors {
    name?: string;
    type?: string;
    price?: string;
    stock?: string;
    categoryId?: string;
}

interface ProductResponseItems {
    items?: Product[];
    products?: Product[];
}

export default function ProductsPage({ sellerMode = false }: { sellerMode?: boolean }) {
    const { user } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState<number | ''>('');
    const [stock, setStock] = useState<number | ''>('');
    const [categoryId, setCategoryId] = useState('');
    const [type, setType] = useState<'FIXED_PRICE' | 'AUCTION' | ''>('');
    const [minBidIncrement, setMinBidIncrement] = useState<number | ''>('');
    const [auctionEndsAt, setAuctionEndsAt] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [fileError, setFileError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const [isSaving, setIsSaving] = useState<boolean>(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [productsRes, categoriesData] = await Promise.all([
                user?.role === Role.SELLER
                    ? productService.getSellerProducts({ includeArchived: true })
                    : productService.getAll({ includeArchived: true }),
                categoriesService.getAllCategories(),
            ]);

            const resObj = productsRes as ProductResponseItems;
            const productsList = (Array.isArray(productsRes)
                ? productsRes
                : resObj.items || resObj.products || []
            ).filter(
                (product) =>
                    (user?.role !== Role.SELLER ||
                        product.sellerId === user.id) &&
                    (!sellerMode || product.type === 'FIXED_PRICE'),
            );

            setProducts(productsList);
            setCategories(categoriesData);
        } catch (err) {
            console.error('Помилка завантаження даних:', err);
            setError('Не вдалося завантажити товари або категорії.');
        } finally {
            setIsLoading(false);
        }
    }, [user, sellerMode]);

    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [productsRes, categoriesData] = await Promise.all([
                    user?.role === Role.SELLER
                        ? productService.getSellerProducts({
                            includeArchived: true,
                        })
                        : productService.getAll({ includeArchived: true }),
                    categoriesService.getAllCategories(),
                ]);

                if (isMounted) {
                    const resObj = productsRes as ProductResponseItems;
                    const productsList = (Array.isArray(productsRes)
                        ? productsRes
                        : resObj.items || resObj.products || []
                    ).filter(
                        (product) =>
                            (user?.role !== Role.SELLER ||
                                product.sellerId === user.id) &&
                            (!sellerMode || product.type === 'FIXED_PRICE'),
                    );

                    setProducts(productsList);
                    setCategories(categoriesData);
                }
            } catch (err) {
                if (isMounted) {
                    console.error('Помилка завантаження даних:', err);
                    setError('Не вдалося завантажити товари або категорії.');
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        void loadData();

        return () => {
            isMounted = false;
        };
    }, [fetchData, user, sellerMode]);

    const handleOpenCreateModal = () => {
        setSelectedProduct(null);
        setName('');
        setDescription('');
        setPrice('');
        setStock('');
        setCategoryId('');
        setType(sellerMode ? 'FIXED_PRICE' : '');
        setMinBidIncrement('');
        setAuctionEndsAt('');
        setImageFile(null);
        setImagePreview(null);
        setFormErrors({});
        setFileError(null);
        setSubmitError(null);
        setShowDeleteConfirm(false);
        setModalMode('create');
    };

    const handleOpenEditModal = (product: Product) => {
        setSelectedProduct(product);
        setName(product.name || '');
        setDescription(product.description || '');
        setPrice(product.price !== undefined ? product.price : '');
        setStock(product.stock !== undefined ? product.stock : '');
        setCategoryId(product.categoryId || '');
        setType(product.type ?? '');
        setMinBidIncrement('');
        setAuctionEndsAt('');
        setImageFile(null);
        setImagePreview(getImageUrl(product.imageUrl));
        setFormErrors({});
        setFileError(null);
        setSubmitError(null);
        setShowDeleteConfirm(false);
        setModalMode('edit');
    };

    const handleCloseModal = () => {
        if (imagePreview && imagePreview.startsWith('blob:')) {
            URL.revokeObjectURL(imagePreview);
        }
        setModalMode(null);
        setSelectedProduct(null);
        setImageFile(null);
        setImagePreview(null);
        setFormErrors({});
        setFileError(null);
        setSubmitError(null);
        setShowDeleteConfirm(false);
    };

    const handleFileChange = (file: File | null) => {
        setFileError(null);

        if (imagePreview && imagePreview.startsWith('blob:')) {
            URL.revokeObjectURL(imagePreview);
        }

        if (!file) {
            setImageFile(null);
            setImagePreview(getImageUrl(selectedProduct?.imageUrl));
            return;
        }

        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            setFileError('Недопустимий формат файлу. Дозволено: JPG, PNG, WEBP, GIF.');
            return;
        }

        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            setFileError(`Файл занадто великий. Максимальний розмір: ${MAX_FILE_SIZE_MB} МБ.`);
            return;
        }

        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileChange(e.dataTransfer.files[0]);
        }
    };

    const handleRemoveImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (imagePreview && imagePreview.startsWith('blob:')) {
            URL.revokeObjectURL(imagePreview);
        }
        setImageFile(null);
        setImagePreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const validateForm = (): boolean => {
        const errors: FormErrors = {};

        if (!name.trim()) {
            errors.name = 'Назва товару є обов’язковою';
        } else if (name.trim().length < 2) {
            errors.name = 'Назва повинна містити як мінімум 2 символи';
        }

        const numPrice = Number(price);
        if (price === '' || isNaN(numPrice)) {
            errors.price = 'Введіть коректну ціну';
        } else if (numPrice < 0) {
            errors.price = 'Ціна не може бути від’ємною';
        }

        const numStock = Number(stock);
        if (type !== 'AUCTION' && (stock === '' || isNaN(numStock))) {
            errors.stock = 'Введіть кількість';
        } else if (type !== 'AUCTION' && numStock < 0) {
            errors.stock = 'Кількість не може бути від’ємною';
        } else if (type !== 'AUCTION' && !Number.isInteger(numStock)) {
            errors.stock = 'Кількість повинна бути цілим числом';
        }

        if (!categoryId) {
            errors.categoryId = 'Оберіть категорію';
        }
        if (!type) {
            errors.type = 'Оберіть тип товару';
        }
        if (
            modalMode === 'create' &&
            type === 'AUCTION' &&
            (!minBidIncrement ||
                Number(minBidIncrement) <= 0 ||
                !auctionEndsAt ||
                new Date(auctionEndsAt) <= new Date())
        ) {
            errors.type = 'Для аукціону вкажіть крок ставки та майбутній дедлайн';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!validateForm() || fileError) {
            return;
        }

        setIsSaving(true);
        setSubmitError(null);
        try {
            const formData = new FormData();
            formData.append('name', name.trim());
            formData.append('description', description.trim());
            formData.append('price', String(price));
            formData.append('stock', type === 'AUCTION' ? '1' : String(stock));
            formData.append('categoryId', categoryId);
            if (modalMode === 'create') {
                formData.append('type', type);
            }

            if (imageFile) {
                formData.append('image', imageFile);
            } else if (modalMode === 'edit') {
                if (imagePreview === null) {
                    formData.append('imageUrl', '');
                }
            }

            if (modalMode === 'create') {
                const created = await productService.createProduct(formData);
                if (type === 'AUCTION') {
                    await auctionService.create({
                        productId: created.id,
                        startingPrice: Number(price),
                        minBidIncrement: Number(minBidIncrement),
                        startsAt: new Date().toISOString(),
                        endsAt: new Date(auctionEndsAt).toISOString(),
                    });
                }
                setProducts((prev) => [created, ...prev]);
            } else if (modalMode === 'edit' && selectedProduct) {
                const updated = await productService.updateProduct(selectedProduct.id, formData);
                setProducts((prev) =>
                    prev.map((p) => (p.id === selectedProduct.id ? updated : p))
                );
            }
            handleCloseModal();
        } catch (err: unknown) {
            console.error('Помилка при збереженні товару:', err);
            const serverMessage = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
            const errorText = Array.isArray(serverMessage)
                ? serverMessage.join(', ')
                : serverMessage || 'Не вдалося зберегти зміни.';
            setSubmitError(errorText);
        } finally {
            setIsSaving(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!selectedProduct) return;

        setIsSaving(true);
        setSubmitError(null);
        try {
            await productService.deleteProduct(selectedProduct.id);
            setProducts((prev) =>
                prev.map((p) =>
                    p.id === selectedProduct.id
                        ? { ...p, isArchived: true, status: 'ARCHIVED' }
                        : p,
                ),
            );
            handleCloseModal();
        } catch (err: unknown) {
            console.error('Помилка при видаленні товару:', err);
            setSubmitError('Не вдалося архівувати товар. Спробуйте пізніше.');
            setShowDeleteConfirm(false);
        } finally {
            setIsSaving(false);
        }
    };

    const handleRestoreProductInline = async (productToRestore: Product) => {
        try {
            const updated = await productService.restoreProduct(productToRestore.id);
            setProducts((prev) =>
                prev.map((p) => (p.id === productToRestore.id ? updated : p))
            );
        } catch (err: unknown) {
            console.error('Помилка при відновленні товару:', err);
            setError('Не вдалося відновити товар з архіву.');
        }
    };

    const handlePublishProductInline = async (productToPublish: Product) => {
        try {
            const updated = await productService.submitForApproval(productToPublish.id);
            setProducts((prev) =>
                prev.map((p) => (p.id === productToPublish.id ? updated : p)),
            );
        } catch (err: unknown) {
            console.error('Помилка при публікації товару:', err);
            setError('Не вдалося відправити товар на модерацію.');
        }
    };

    const handleDeleteProductInline = (product: Product) => {
        setSelectedProduct(product);
        setShowDeleteConfirm(true);
        setModalMode('edit');
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2>Керування товарами</h2>
                <div className={styles.headerActions}>
                    <button className={styles.createBtn} onClick={handleOpenCreateModal}>
                        + Створити товар
                    </button>
                    <button className={styles.refreshBtn} onClick={() => void fetchData()}>
                        Оновити
                    </button>
                </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            {isLoading ? (
                <div className={styles.loading}>Завантаження товарів...</div>
            ) : products.length === 0 ? (
                <p className={styles.empty}>Товарів немає.</p>
            ) : (
                <div className={styles.grid}>
                    {products.map((product) => (
                        product.type === 'AUCTION' ? (
                            <AuctionCard
                                key={product.id}
                                product={product}
                                onEdit={handleOpenEditModal}
                                onDelete={handleDeleteProductInline}
                                onPublish={handlePublishProductInline}
                            />
                        ) : (
                            <ProductCard
                                key={product.id}
                                product={product}
                                isAdmin={true}
                                onEdit={handleOpenEditModal}
                                onDelete={handleDeleteProductInline}
                                onRestore={handleRestoreProductInline}
                                onPublish={handlePublishProductInline}
                            />
                        )
                    ))}
                </div>
            )}

            {modalMode && (
                <div className={styles.modalOverlay} onClick={handleCloseModal}>
                    <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3>{modalMode === 'create' ? 'Створення товару' : 'Редагування товару'}</h3>
                            <button className={styles.closeBtn} onClick={handleCloseModal}>
                                ✕
                            </button>
                        </div>

                        {submitError && <div className={styles.submitError}>{submitError}</div>}

                        {showDeleteConfirm ? (
                            <div className={styles.confirmBox}>
                                <p>Ви дійсно хочете видалити товар <strong>«{selectedProduct?.name}»</strong>?</p>
                                <div className={styles.confirmActions}>
                                    <button
                                        type="button"
                                        className={styles.cancelBtn}
                                        onClick={() => setShowDeleteConfirm(false)}
                                        disabled={isSaving}
                                    >
                                        Скасувати
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.deleteBtn}
                                        onClick={() => void handleConfirmDelete()}
                                        disabled={isSaving}
                                    >
                                        {isSaving ? 'Видалення...' : 'Так, архівувати'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={(e) => void handleSubmit(e)} className={styles.form} noValidate>
                                {modalMode === 'create' && !sellerMode ? (
                                    <label>
                                        Тип товару:
                                        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} required>
                                            <option value="">Оберіть тип</option>
                                            <option value="FIXED_PRICE">Звичайний товар</option>
                                            <option value="AUCTION">Аукціон</option>
                                        </select>
                                        {formErrors.type && (
                                            <span className={styles.fieldError}>{formErrors.type}</span>
                                        )}
                                    </label>
                                ) : (
                                    <div className={styles.label}>
                                        Тип товару: <strong>{type === 'AUCTION' ? 'Аукціон' : 'Фіксована ціна'}</strong>
                                    </div>
                                )}
                                {modalMode === 'create' && type === 'AUCTION' && (
                                    <div className={styles.row}>
                                        <label className={styles.label}>
                                            Мінімальний крок ставки:
                                            <input
                                                type="number"
                                                min="0.01"
                                                step="0.01"
                                                value={minBidIncrement}
                                                onChange={(e) => setMinBidIncrement(e.target.value ? Number(e.target.value) : '')}
                                            />
                                        </label>
                                        <label className={styles.label}>
                                            Дедлайн:
                                            <input
                                                type="datetime-local"
                                                value={auctionEndsAt}
                                                onChange={(e) => setAuctionEndsAt(e.target.value)}
                                            />
                                        </label>
                                    </div>
                                )}
                                <label className={styles.label}>
                                    Назва:
                                    <input
                                        type="text"
                                        className={`${styles.input} ${formErrors.name ? styles.inputError : ''}`}
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                    {formErrors.name && (
                                        <span className={styles.fieldError}>{formErrors.name}</span>
                                    )}
                                </label>

                                <label className={styles.label}>
                                    Опис:
                                    <textarea
                                        className={styles.textarea}
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={3}
                                    />
                                </label>

                                <div className={styles.row}>
                                    <label className={styles.label}>
                                        {type === 'AUCTION' ? 'Стартова ціна' : 'Ціна ($)'}:
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            className={`${styles.input} ${formErrors.price ? styles.inputError : ''}`}
                                            value={price}
                                            onChange={(e) => setPrice(e.target.value !== '' ? Number(e.target.value) : '')}
                                        />
                                        {formErrors.price && (
                                            <span className={styles.fieldError}>{formErrors.price}</span>
                                        )}
                                    </label>

                                    {type !== 'AUCTION' && <label className={styles.label}>
                                        Кількість на складі:
                                        <input
                                            type="number"
                                            min="0"
                                            className={`${styles.input} ${formErrors.stock ? styles.inputError : ''}`}
                                            value={stock}
                                            onChange={(e) => setStock(e.target.value !== '' ? Number(e.target.value) : '')}
                                        />
                                        {formErrors.stock && (
                                            <span className={styles.fieldError}>{formErrors.stock}</span>
                                        )}
                                    </label>}
                                </div>

                                <label className={styles.label}>
                                    Категорія:
                                    <select
                                        className={`${styles.select} ${formErrors.categoryId ? styles.inputError : ''}`}
                                        value={categoryId}
                                        onChange={(e) => setCategoryId(e.target.value)}
                                    >
                                        <option value="">Оберіть категорію</option>
                                        {categories.map((cat) => (
                                            <option key={cat.id} value={cat.id}>
                                                {cat.name}
                                            </option>
                                        ))}
                                    </select>
                                    {formErrors.categoryId && (
                                        <span className={styles.fieldError}>{formErrors.categoryId}</span>
                                    )}
                                </label>

                                <div className={styles.label}>
                                    <span>Зображення товару:</span>
                                    <div
                                        className={styles.dropZone}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={handleDrop}
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp,image/gif"
                                            className={styles.hiddenFileInput}
                                            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                                        />
                                        {imagePreview ? (
                                            <div className={styles.previewContainer}>
                                                <img 
                                                    src={imagePreview} 
                                                    alt="Прев’ю" 
                                                    className={styles.previewImage}
                                                    onError={() => setImagePreview(null)}
                                                />
                                                <button
                                                    type="button"
                                                    className={styles.removeImageBtn}
                                                    onClick={handleRemoveImage}
                                                    title="Видалити зображення"
                                                >
                                                    ✕ Видалити фото
                                                </button>
                                            </div>
                                        ) : (
                                            <div className={styles.dropText}>
                                                <p>Перетягніть сюди файл або <span>натисніть для вибору</span></p>
                                                <small>JPG, PNG, WEBP, GIF (до 5 МБ)</small>
                                            </div>
                                        )}
                                    </div>
                                    {fileError && <span className={styles.fieldError}>{fileError}</span>}
                                </div>

                                <div className={styles.modalActions}>
                                    {modalMode === 'edit' && (
                                        <button
                                            type="button"
                                            className={styles.deleteBtn}
                                            onClick={() => setShowDeleteConfirm(true)}
                                            disabled={isSaving}
                                        >
                                            Видалити товар
                                        </button>
                                    )}

                                    <div className={styles.rightActions}>
                                        <button
                                            type="button"
                                            className={styles.cancelBtn}
                                            onClick={handleCloseModal}
                                            disabled={isSaving}
                                        >
                                            Скасувати
                                        </button>
                                        <button
                                            type="submit"
                                            className={styles.saveBtn}
                                            disabled={isSaving || !!fileError}
                                        >
                                            {isSaving ? 'Збереження...' : modalMode === 'create' ? 'Створити' : 'Зберегти'}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}