import React, { useEffect, useState, useCallback } from 'react';
import {
    categoriesService,
    type Category,
} from '../../../services/categoryService';
import styles from './CategoriesPage.module.css';

export default function CategoriesPage() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(
        null,
    );
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

    const [name, setName] = useState('');

    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const fetchCategories = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await categoriesService.getAllCategories();
            setCategories(data);
        } catch (err) {
            console.error('Помилка завантаження категорій:', err);
            setError('Не вдалося завантажити категорії.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        let isMounted = true;

        const loadCategories = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const data = await categoriesService.getAllCategories();
                if (isMounted) {
                    setCategories(data);
                }
            } catch (err) {
                if (isMounted) {
                    console.error('Помилка завантаження категорій:', err);
                    setError('Не вдалося завантажити категорії.');
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        loadCategories();

        return () => {
            isMounted = false;
        };
    }, [fetchCategories]);

    const handleOpenCreateModal = () => {
        setSelectedCategory(null);
        setName('');
        setSubmitError(null);
        setShowDeleteConfirm(false);
        setModalMode('create');
    };

    const handleOpenEditModal = (category: Category) => {
        setSelectedCategory(category);
        setName(category.name);
        setSubmitError(null);
        setShowDeleteConfirm(false);
        setModalMode('edit');
    };

    const handleCloseModal = () => {
        setModalMode(null);
        setSelectedCategory(null);
        setName('');
        setSubmitError(null);
        setShowDeleteConfirm(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setSubmitError(null);

        const payload = {
            name: name.trim(),
        };

        try {
            if (modalMode === 'create') {
                const created = await categoriesService.createCategory(payload);
                setCategories((prev) => [...prev, created]);
            } else if (modalMode === 'edit' && selectedCategory) {
                const updated = await categoriesService.updateCategory(
                    selectedCategory.id,
                    payload,
                );
                setCategories((prev) =>
                    prev.map((cat) =>
                        cat.id === selectedCategory.id ? updated : cat,
                    ),
                );
            }
            handleCloseModal();
        } catch (err: unknown) {
            console.error('Помилка при збереженні категорії:', err);
            const serverMessage = (
                err as { response?: { data?: { message?: string | string[] } } }
            )?.response?.data?.message;
            const errorText = Array.isArray(serverMessage)
                ? serverMessage.join(', ')
                : serverMessage || 'Не вдалося зберегти зміни.';
            setSubmitError(errorText);
        } finally {
            setIsSaving(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!selectedCategory) return;

        setIsSaving(true);
        setSubmitError(null);
        try {
            await categoriesService.deleteCategory(selectedCategory.id);
            setCategories((prev) =>
                prev.filter((cat) => cat.id !== selectedCategory.id),
            );
            handleCloseModal();
        } catch (err: unknown) {
            console.error('Помилка при видаленні категорії:', err);
            const serverMessage = (
                err as { response?: { data?: { message?: string } } }
            )?.response?.data?.message;
            setSubmitError(
                serverMessage ||
                    'Не вдалося видалити категорію. Можливо, до неї прив’язані товари.',
            );
            setShowDeleteConfirm(false);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2>Керування категоріями</h2>
                <div className={styles.headerActions}>
                    <button
                        className={styles.createBtn}
                        onClick={handleOpenCreateModal}
                    >
                        + Створити категорію
                    </button>
                    <button
                        className={styles.refreshBtn}
                        onClick={fetchCategories}
                    >
                        Оновити
                    </button>
                </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            {isLoading ? (
                <div className={styles.loading}>Завантаження категорій...</div>
            ) : categories.length === 0 ? (
                <p className={styles.empty}>Категорій немає.</p>
            ) : (
                <div className={styles.list}>
                    {categories.map((cat) => (
                        <div key={cat.id} className={styles.categoryCard}>
                            <div className={styles.categoryInfo}>
                                <h3>{cat.name}</h3>
                            </div>
                            <button
                                className={styles.editBtn}
                                onClick={() => handleOpenEditModal(cat)}
                            >
                                Редагувати
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {modalMode && (
                <div className={styles.modalOverlay} onClick={handleCloseModal}>
                    <div
                        className={styles.modalContent}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.modalHeader}>
                            <h3>
                                {modalMode === 'create'
                                    ? 'Створення категорії'
                                    : 'Редагування категорії'}
                            </h3>
                            <button
                                className={styles.closeBtn}
                                onClick={handleCloseModal}
                            >
                                ✕
                            </button>
                        </div>

                        {submitError && (
                            <div className={styles.submitError}>
                                {submitError}
                            </div>
                        )}

                        {showDeleteConfirm ? (
                            <div className={styles.confirmBox}>
                                <p>
                                    Ви дійсно хочете видалити категорію{' '}
                                    <strong>«{selectedCategory?.name}»</strong>?
                                </p>
                                <div className={styles.confirmActions}>
                                    <button
                                        type="button"
                                        className={styles.cancelBtn}
                                        onClick={() =>
                                            setShowDeleteConfirm(false)
                                        }
                                        disabled={isSaving}
                                    >
                                        Скасувати
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.deleteBtn}
                                        onClick={handleConfirmDelete}
                                        disabled={isSaving}
                                    >
                                        {isSaving
                                            ? 'Видалення...'
                                            : 'Так, видалити'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form
                                onSubmit={handleSubmit}
                                className={styles.form}
                            >
                                <label className={styles.label}>
                                    Назва категорії:
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) =>
                                            setName(e.target.value)
                                        }
                                        required
                                    />
                                </label>

                                <div className={styles.modalActions}>
                                    {modalMode === 'edit' && (
                                        <button
                                            type="button"
                                            className={styles.deleteBtn}
                                            onClick={() =>
                                                setShowDeleteConfirm(true)
                                            }
                                            disabled={isSaving}
                                        >
                                            Видалити категорію
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
                                            disabled={isSaving}
                                        >
                                            {isSaving
                                                ? 'Збереження...'
                                                : modalMode === 'create'
                                                    ? 'Створити'
                                                    : 'Зберегти'}
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
