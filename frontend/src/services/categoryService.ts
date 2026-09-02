import {api} from '../services/api'; 

export interface Category {
    id: string;
    name: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface CreateCategoryDto {
    name: string;
}

export interface UpdateCategoryDto {
    name: string;
}

export const categoriesService = {
    async getAllCategories(): Promise<Category[]> {
        const response = await api.get<Category[]>('/categories');
        return response.data;
    },

    async getCategoryById(id: string): Promise<Category> {
        const response = await api.get<Category>(`/categories/${id}`);
        return response.data;
    },

    async createCategory(dto: CreateCategoryDto): Promise<Category> {
        const response = await api.post<Category>('/categories', dto);
        return response.data;
    },

    async updateCategory(id: string, dto: UpdateCategoryDto): Promise<Category> {
        const response = await api.patch<Category>(`/categories/${id}`, dto);
        return response.data;
    },

    async deleteCategory(id: string): Promise<void> {
        await api.delete(`/categories/${id}`);
    },
};