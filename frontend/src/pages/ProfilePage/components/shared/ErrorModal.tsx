import React from 'react';
import { Modal } from '../../../../components/Modal/Modal';
import { Button } from '../../../../components/Ui/Button/Button';

interface ErrorModalProps {
    message: string | null;
    onClose: () => void;
}

export const ErrorModal: React.FC<ErrorModalProps> = ({ message, onClose }) => (
    <Modal
        isOpen={Boolean(message)}
        onClose={onClose}
        title="Помилка"
        actions={
            <Button variant="primary" size="small" onClick={onClose}>
                Зрозуміло
            </Button>
        }
    >
        <p>{message}</p>
    </Modal>
);
