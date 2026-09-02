import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
    title: 'Ui/Button',
    component: Button,
    tags: ['autodocs'],
    argTypes: {
        children: {
            control: 'text',
            description: 'Текст або контент всередині кнопки',
        },
        variant: {
            control: { type: 'inline-radio' },
            options: ['primary', 'secondary'],
            description: 'Колір та стиль кнопки',
        },
        size: {
            control: { type: 'inline-radio' },
            options: ['small', 'medium'],
            description: 'Розмір кнопки',
        },
        disabled: {
            control: 'boolean',
            description: 'Стан блокування кнопки',
        },
        onClick: { action: 'clicked' },
    },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
    args: {
        children: 'Застосувати',
        variant: 'primary',
        size: 'medium',
    },
};

export const Secondary: Story = {
    args: {
        children: '📥 Експорт в CSV',
        variant: 'secondary',
        size: 'medium',
    },
};

export const Small: Story = {
    args: {
        children: 'Фільтр',
        variant: 'primary',
        size: 'small',
    },
};

export const Disabled: Story = {
    args: {
        children: 'Завантаження...',
        variant: 'secondary',
        disabled: true,
    },
};