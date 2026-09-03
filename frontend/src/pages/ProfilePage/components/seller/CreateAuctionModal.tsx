import React from 'react';
import styles from '../../ProfilePage.module.css';
import { Modal } from '../../../../components/Modal/Modal';
import { Button } from '../../../../components/Ui/Button/Button';
import type { Category } from '../../../../services/categoryService';
import type { AuctionFormState } from '../types';

interface CreateAuctionModalProps {
    isOpen: boolean;
    onClose: () => void;
    auctionForm: AuctionFormState;
    onFormChange: (updater: (current: AuctionFormState) => AuctionFormState) => void;
    categories: Category[];
    isCreatingAuction: boolean;
    onSubmit: (event: React.FormEvent) => void;
}

export const CreateAuctionModal: React.FC<CreateAuctionModalProps> = ({
    isOpen,
    onClose,
    auctionForm,
    onFormChange,
    categories,
    isCreatingAuction,
    onSubmit,
}) => (
    <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Створити аукціон"
        actions={
            <>
                <Button type="button" variant="secondary" onClick={onClose}>
                    Скасувати
                </Button>
                <Button type="submit" form="create-auction-form" disabled={isCreatingAuction}>
                    {isCreatingAuction ? 'Створення...' : 'Створити'}
                </Button>
            </>
        }
    >
        <form id="create-auction-form" onSubmit={onSubmit} className={styles.form}>
            <input
                required
                placeholder="Назва аукціону"
                value={auctionForm.name}
                onChange={(event) =>
                    onFormChange((current) => ({ ...current, name: event.target.value }))
                }
            />
            <textarea
                placeholder="Опис"
                value={auctionForm.description}
                onChange={(event) =>
                    onFormChange((current) => ({ ...current, description: event.target.value }))
                }
            />
            <select
                required
                value={auctionForm.categoryId}
                onChange={(event) =>
                    onFormChange((current) => ({ ...current, categoryId: event.target.value }))
                }
            >
                <option value="">Оберіть категорію</option>
                {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                        {category.name}
                    </option>
                ))}
            </select>
            <input
                required
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Стартова ціна"
                value={auctionForm.startingPrice}
                onChange={(event) =>
                    onFormChange((current) => ({ ...current, startingPrice: event.target.value }))
                }
            />
            <input
                required
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Крок ставки"
                value={auctionForm.minBidIncrement}
                onChange={(event) =>
                    onFormChange((current) => ({ ...current, minBidIncrement: event.target.value }))
                }
            />
            <input
                required
                type="datetime-local"
                value={auctionForm.endsAt}
                onChange={(event) =>
                    onFormChange((current) => ({ ...current, endsAt: event.target.value }))
                }
            />
        </form>
    </Modal>
);
