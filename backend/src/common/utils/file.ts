import * as fs from 'fs/promises';
import * as path from 'path';

export async function deleteFile(relativePath?: string | null): Promise<void> {
    if (!relativePath) return;

    const cleanPath = relativePath.startsWith('/')
        ? relativePath.slice(1)
        : relativePath;
    const absolutePath = path.join(process.cwd(), cleanPath);

    try {
        await fs.unlink(absolutePath);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.error(`Failed to delete file at ${absolutePath}:`, err);
        }
    }
}
