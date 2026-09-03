import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext/AuthContext';
import type { Product } from '../../types/product.type';
import { AuctionCard } from './AuctionCard';

const mockAuction: Product = {
    id: 'auction-product-101',
    sellerId: 'seller-1',
    name: 'Vintage film camera',
    description: 'A fully working 35mm camera for collectors and enthusiasts.',
    price: 250,
    stock: 1,
    categoryId: 'cat-cameras',
    imageUrl: 'https://placehold.co/640x420/png',
    isArchived: false,
    type: 'AUCTION',
    status: 'ACTIVE',
    auctionId: 'auction-101',
    auctionStatus: 'ACTIVE',
    category: {
        id: 'cat-cameras',
        name: 'Cameras',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
};

const meta: Meta<typeof AuctionCard> = {
    title: 'UI/AuctionCard',
    component: AuctionCard,
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
        onEdit: { action: 'edit' },
        onDelete: { action: 'delete' },
        onPublish: { action: 'publish' },
        onApprove: { action: 'approve' },
        onReject: { action: 'reject' },
    },
};

export default meta;
type Story = StoryObj<typeof AuctionCard>;

export const Active: Story = {
    args: {
        product: mockAuction,
    },
};

export const Draft: Story = {
    args: {
        product: {
            ...mockAuction,
            status: 'DRAFT',
            auctionStatus: 'DRAFT',
        },
    },
};

export const PendingApproval: Story = {
    args: {
        product: {
            ...mockAuction,
            status: 'PENDING_APPROVAL',
            auctionStatus: 'DRAFT',
        },
    },
};

export const Sold: Story = {
    args: {
        product: {
            ...mockAuction,
            auctionStatus: 'SOLD',
            status: 'SOLD',
        },
    },
};
