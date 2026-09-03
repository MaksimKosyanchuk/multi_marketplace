import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { ProductCard } from './ProductCard';
import { AuthProvider } from '../../context/AuthContext/AuthContext';
import type { Product } from '../../types/product.type';

const mockProduct: Product = {
    id: 'prod-101',
    sellerId: 'seller-1',
    name: 'Кросівки Nike Air Max',
    description:
        'Класичні зручні кросівки для щоденного носіння та занять спортом.',
    price: 120.5,
    stock: 10,
    categoryId: 'cat-1',
    imageUrl: 'https://via.placeholder.com/300x200',
    isArchived: false,
    category: {
        id: 'cat-1',
        name: 'Взуття',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
};

const meta: Meta<typeof ProductCard> = {
    title: 'UI/ProductCard',
    component: ProductCard,
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <AuthProvider>
                <MemoryRouter>
                    <div style={{ maxWidth: '360px', padding: '16px' }}>
                        <Story />
                    </div>
                </MemoryRouter>
            </AuthProvider>
        ),
    ],
    argTypes: {
        isAdmin: { control: 'boolean', description: 'Режим адміністратора' },
        isInCart: { control: 'boolean', description: 'Чи додано вже в кошик' },
        onEdit: { action: 'onEdit clicked' },
        onRestore: { action: 'onRestore clicked' },
        onAddToCart: { action: 'onAddToCart clicked' },
    },
};

export default meta;
type Story = StoryObj<typeof ProductCard>;

export const Default: Story = {
    args: {
        product: mockProduct,
        isAdmin: false,
        isInCart: false,
    },
};

export const InCart: Story = {
    args: {
        product: mockProduct,
        isAdmin: false,
        isInCart: true,
    },
};

export const WithoutImage: Story = {
    args: {
        product: {
            ...mockProduct,
            imageUrl: '',
        },
        isAdmin: false,
    },
};

export const AdminView: Story = {
    args: {
        product: mockProduct,
        isAdmin: true,
    },
};

export const ArchivedAdminView: Story = {
    args: {
        product: {
            ...mockProduct,
            isArchived: true,
        },
        isAdmin: true,
    },
};
