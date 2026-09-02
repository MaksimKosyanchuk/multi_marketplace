import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Role, SellerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSellerApplicationDto } from './dto/create-seller-application.dto';

@Injectable()
export class SellersService {
    constructor(private readonly prisma: PrismaService) {}

    async apply(userId: string, dto: CreateSellerApplicationDto) {
        const existing = await this.prisma.sellerProfile.findUnique({
            where: { userId },
        });

        if (existing?.status === SellerStatus.APPROVED) {
            throw new ConflictException('User is already an approved seller');
        }
        if (existing?.status === SellerStatus.PENDING) {
            throw new ConflictException('Seller application is already pending');
        }

        return this.prisma.sellerProfile.upsert({
            where: { userId },
            create: { userId, ...dto },
            update: {
                ...dto,
                status: SellerStatus.PENDING,
                rejectionReason: null,
                reviewedAt: null,
                reviewedById: null,
            },
        });
    }

    async getMine(userId: string) {
        const profile = await this.prisma.sellerProfile.findUnique({
            where: { userId },
        });
        if (!profile) throw new NotFoundException('Seller application not found');
        return profile;
    }

    listApplications(status?: SellerStatus) {
        return this.prisma.sellerProfile.findMany({
            where: status ? { status } : undefined,
            include: { user: { select: { id: true, email: true, nickName: true } } },
            orderBy: { createdAt: 'asc' },
        });
    }

    async approve(profileId: string, adminId: string) {
        return this.prisma.$transaction(async (tx) => {
            const profile = await tx.sellerProfile.findUnique({
                where: { id: profileId },
            });
            if (!profile) throw new NotFoundException('Seller application not found');
            if (profile.status !== SellerStatus.PENDING) {
                throw new ConflictException('Only pending applications can be approved');
            }

            await tx.user.update({
                where: { id: profile.userId },
                data: { role: Role.SELLER },
            });

            return tx.sellerProfile.update({
                where: { id: profileId },
                data: {
                    status: SellerStatus.APPROVED,
                    reviewedById: adminId,
                    reviewedAt: new Date(),
                    rejectionReason: null,
                },
            });
        });
    }

    async reject(profileId: string, adminId: string, reason: string) {
        const profile = await this.prisma.sellerProfile.findUnique({
            where: { id: profileId },
        });
        if (!profile) throw new NotFoundException('Seller application not found');
        if (profile.status !== SellerStatus.PENDING) {
            throw new ConflictException('Only pending applications can be rejected');
        }

        return this.prisma.sellerProfile.update({
            where: { id: profileId },
            data: {
                status: SellerStatus.REJECTED,
                reviewedById: adminId,
                reviewedAt: new Date(),
                rejectionReason: reason,
            },
        });
    }
}
