import type { Meta, StoryObj } from '@storybook/react-vite';
import { OrderItemCard } from './OrderItem';
import type { Order } from '../../services/orderService';

const mockOrder: Order = {
    id: 'a1b2c3d4-e5f6-7890-abcd-1234567890ef',
    createdAt: '2026-09-01T10:30:00.000Z',
    status: 'NEW',
    userId: 'user-123',
    totalAmount: 145.50,
    items: [
        { id: 'item-1', productId: 'prod-101', productName: 'Кросівки Nike Air Max', quantity: 1, price: 120.50 },
        { id: 'item-2', productId: 'prod-102', productName: 'Спортивні шкарпетки (3 паки)', quantity: 2, price: 12.50 },
    ],
};

const meta: Meta<typeof OrderItemCard> = {
    title: 'UI/OrderItemCard',
    component: OrderItemCard,
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <div style={{ maxWidth: '600px', padding: '16px' }}>
                <Story />
            </div>
        ),
    ],
    argTypes: {
        isAdmin: { control: 'boolean', description: 'Режим адміністратора' },
        onPay: { action: 'onPay clicked' },
        onCancel: { action: 'onCancel clicked' },
        onStatusChange: { action: 'onStatusChange triggered' },
    },
};

export default meta;
type Story = StoryObj<typeof OrderItemCard>;

export const NewOrder: Story = {
    args: {
        order: mockOrder,
        isAdmin: false,
    },
};

export const ProcessingOrder: Story = {
    args: {
        order: {
            ...mockOrder,
            status: 'PROCESSING',
        },
        isAdmin: false,
    },
};

export const ShippedOrder: Story = {
    args: {
        order: {
            ...mockOrder,
            status: 'SHIPPED',
        },
        isAdmin: false,
    },
};

export const CompletedOrder: Story = {
    args: {
        order: {
            ...mockOrder,
            status: 'COMPLETED',
        },
        isAdmin: false,
    },
};

export const CancelledOrder: Story = {
    args: {
        order: {
            ...mockOrder,
            status: 'CANCELLED',
        },
        isAdmin: false,
    },
};

export const AdminView: Story = {
    args: {
        order: {
            ...mockOrder,
            status: 'PROCESSING',
        },
        isAdmin: true,
    },
};


export const AdminTerminalState: Story = {
    args: {
        order: {
            ...mockOrder,
            status: 'COMPLETED',
        },
        isAdmin: true,
    },
};