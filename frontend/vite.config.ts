/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    css: {
        devSourcemap: true,
    },
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'components',
                    environment: 'jsdom',
                    globals: true,
                    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
                    setupFiles: ['./test/setup.ts'],
                },
            },
        ],
    },
});