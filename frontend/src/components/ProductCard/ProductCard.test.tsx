import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductCard } from './ProductCard';
import type { Product } from '../../types/product.type';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
    };
});

const mockUseAuth = vi.fn().mockReturnValue({ isAuthenticated: true, user: null });

vi.mock('../../context/AuthContext/useAuth', () => ({
    useAuth: () => mockUseAuth(),
}));

vi.mock('../../services/cartService', () => ({
    cartService: {
        addToCart: vi.fn(),
    },
}));

vi.mock('../../utils/getImageUrl', () => ({
    getImageUrl: (url: string) => `http://localhost:5000/${url}`,
}));

const mockProduct: Product = {
    id: '1',
    name: 'Test Smartphone',
    description: 'A very good phone',
    price: 999.99,
    imageUrl: 'uploads/phone.jpg',
    isArchived: false,
    categoryId: 'cat-1',
    category: { id: 'cat-1', name: 'Electronics' },
    stock: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

describe('ProductCard Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders product details correctly', () => {
        mockUseAuth.mockReturnValue({ isAuthenticated: true });

        render(<ProductCard product={mockProduct} />);

        expect(screen.getByText('Test Smartphone')).toBeInTheDocument();
        expect(screen.getByText('A very good phone')).toBeInTheDocument();
        expect(screen.getByText('Electronics')).toBeInTheDocument();
        expect(screen.getByText('$999.99')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /у кошик/i })).toBeInTheDocument();
    });

    it('shows authorization modal if unauthenticated user clicks add to cart', async () => {
        mockUseAuth.mockReturnValue({ isAuthenticated: false });
        const user = userEvent.setup();

        render(<ProductCard product={mockProduct} />);

        const addButton = screen.getByRole('button', { name: /у кошик/i });
        await user.click(addButton);

        expect(screen.getByText('Потрібна авторизація')).toBeInTheDocument();
        expect(screen.getByText(/увійдіть у свій акаунт/i)).toBeInTheDocument();
    });

    it('renders archive badge and restore button when isAdmin and product is archived', () => {
        const archivedProduct = { ...mockProduct, isArchived: true };
        const mockRestore = vi.fn();

        render(
            <ProductCard 
                product={archivedProduct} 
                isAdmin={true} 
                onRestore={mockRestore} 
            />
        );

        expect(screen.getByText('В архіві')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /відновити/i })).toBeInTheDocument();
    });

    it('renders edit button when isAdmin and product is active', () => {
        const mockEdit = vi.fn();

        render(
            <ProductCard 
                product={mockProduct} 
                isAdmin={true} 
                onEdit={mockEdit} 
            />
        );

        expect(screen.getByRole('button', { name: /редагувати/i })).toBeInTheDocument();
    });

    it('renders "В кошику" button when isInCart is true', () => {
        render(<ProductCard product={mockProduct} isInCart={true} />);

        expect(screen.getByRole('button', { name: /в кошику/i })).toBeInTheDocument();
    });
});