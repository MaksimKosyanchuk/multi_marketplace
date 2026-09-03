import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OrderItemCard } from './OrderItem';
import type { Order } from '../../services/orderService';

const renderOrder = (order: React.ReactElement) =>
    render(<MemoryRouter>{order}</MemoryRouter>);

const mockOrder: Order = {
    id: '12345678-abcd-efgh-ijkl-mnopqrstuvwx',
    status: 'NEW',
    userId: 'user-123',
    totalAmount: 150.50,
    createdAt: new Date().toISOString(),
    items: [
        {
            id: 'item-1',
            productId: 'prod-1',
            productName: 'Wireless Mouse',
            price: 50.25,
            quantity: 2,
        },
    ],
};

describe('OrderItemCard Component', () => {
    it('renders order details correctly', () => {
        renderOrder(<OrderItemCard order={mockOrder} onPay={vi.fn()} onCancel={vi.fn()} />);

        expect(screen.getByText('Замовлення #12345678')).toBeInTheDocument();
        expect(screen.getByText('Очікує оплати')).toBeInTheDocument();
        expect(screen.getByText('Wireless Mouse')).toBeInTheDocument();
        expect(screen.getByText('2 шт. × $50.25')).toBeInTheDocument();
        expect(
            screen.getByText((content) => content.includes('150.50')),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /оплатити/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /скасувати/i })).toBeInTheDocument();
    });

    it('calls onPay when pay button is clicked', async () => {
        const mockPay = vi.fn().mockResolvedValue(undefined);
        const user = userEvent.setup();

        renderOrder(<OrderItemCard order={mockOrder} onPay={mockPay} />);

        await user.click(screen.getByRole('button', { name: /оплатити/i }));

        expect(mockPay).toHaveBeenCalledTimes(1);
        expect(mockPay).toHaveBeenCalledWith(mockOrder.id);
    });

    it('opens cancellation confirmation modal when cancel button is clicked', async () => {
        const user = userEvent.setup();

        renderOrder(<OrderItemCard order={mockOrder} onCancel={vi.fn()} />);

        await user.click(screen.getByRole('button', { name: /скасувати/i }));

        expect(screen.getByText('Підтвердження скасування')).toBeInTheDocument();
        expect(screen.getByText(/ви дійсно бажаєте скасувати замовлення/i)).toBeInTheDocument();
    });

    it('calls onCancel after confirming in the modal', async () => {
        const mockCancel = vi.fn().mockResolvedValue(undefined);
        const user = userEvent.setup();

        renderOrder(<OrderItemCard order={mockOrder} onCancel={mockCancel} />);

        await user.click(screen.getByRole('button', { name: /скасувати/i }));
        
        const confirmButtons = screen.getAllByRole('button', { name: /скасувати замовлення/i });
        await user.click(confirmButtons[0]);

        expect(mockCancel).toHaveBeenCalledTimes(1);
        expect(mockCancel).toHaveBeenCalledWith(mockOrder.id);
    });

    it('renders status select and handles status change when isAdmin is true', async () => {
        const mockStatusChange = vi.fn().mockResolvedValue(undefined);
        const user = userEvent.setup();

        renderOrder(
            <OrderItemCard 
                order={mockOrder} 
                isAdmin={true} 
                onStatusChange={mockStatusChange} 
            />
        );

        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();

        await user.selectOptions(select, 'CANCELLED');

        expect(mockStatusChange).toHaveBeenCalledTimes(1);
        expect(mockStatusChange).toHaveBeenCalledWith(mockOrder.id, 'CANCELLED');
    });

    it('renders error state when order data is invalid', () => {
        // @ts-expect-error testing invalid props
        renderOrder(<OrderItemCard order={null} />);

        expect(screen.getByText(/помилка: некоректні дані замовлення/i)).toBeInTheDocument();
    });
});