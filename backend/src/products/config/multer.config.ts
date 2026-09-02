import { diskStorage } from 'multer';
import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

type MulterCallback = (error: Error | null, acceptFile: boolean) => void;

export const productMulterOptions = {
    storage: diskStorage({
        destination: './uploads/products',
        filename: (
            _req: Request,
            file: Express.Multer.File,
            cb: (error: Error | null, filename: string) => void,
        ) => {
            const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
            cb(null, uniqueName);
        },
    }),
    fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        cb: MulterCallback,
    ): void => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
            cb(
                new BadRequestException(
                    'Only image files (jpg, jpeg, png, webp) are allowed',
                ),
                false,
            );
            return;
        }
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
};
