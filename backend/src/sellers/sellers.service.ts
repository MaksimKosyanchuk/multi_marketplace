import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Role, SellerStatus } from '@prisma/client';
import { SellerProfileRepository } from '../database/seller-profile.repository';
import { UnitOfWork } from '../database/unit-of-work';
import { CreateSellerApplicationDto } from './dto/create-seller-application.dto';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class SellersService {
    constructor(
        private readonly sellerProfiles: SellerProfileRepository,
        private readonly unitOfWork: UnitOfWork,
        private readonly logger: LoggerService,
    ) {}

    async apply(userId: string, dto: CreateSellerApplicationDto) {
        const existing = await this.sellerProfiles.findByUserId(userId);

        if (existing?.status === SellerStatus.APPROVED) {
            throw new ConflictException('User is already an approved seller');
        }
        if (existing?.status === SellerStatus.PENDING) {
            throw new ConflictException(
                'Seller application is already pending',
            );
        }

        const application = await this.sellerProfiles.upsertForUser(
            userId,
            { userId, ...dto },
            {
                ...dto,
                status: SellerStatus.PENDING,
                rejectionReason: null,
                reviewedAt: null,
                reviewedById: null,
            },
        );
        void this.logger.audit(
            SellersService.name,
            'Seller application submitted',
            {
                userId,
                sellerProfileId: application.id,
                operation: 'seller_application.create',
            },
        );
        return application;
    }

    async getMine(userId: string) {
        return this.sellerProfiles.findByUserId(userId);
    }

    listApplications(status?: SellerStatus) {
        return this.sellerProfiles.listApplications(status);
    }

    async approve(profileId: string, adminId: string) {
        return this.unitOfWork.run(
            async ({ sellerProfileRepository, userRepository }) => {
                const profile =
                    await sellerProfileRepository.findById(profileId);
                if (!profile)
                    throw new NotFoundException('Seller application not found');
                if (profile.status !== SellerStatus.PENDING) {
                    throw new ConflictException(
                        'Only pending applications can be approved',
                    );
                }

                const claimed = await sellerProfileRepository.claimPending(
                    profileId,
                    {
                        status: SellerStatus.APPROVED,
                        reviewedById: adminId,
                        reviewedAt: new Date(),
                        rejectionReason: null,
                    },
                );
                if (!claimed.count)
                    throw new ConflictException(
                        'Application was already processed',
                    );
                await userRepository.updateRole(profile.userId, Role.SELLER);

                const approved = await sellerProfileRepository.update(
                    profileId,
                    {
                        status: SellerStatus.APPROVED,
                    },
                );
                void this.logger.audit(
                    SellersService.name,
                    'Seller application approved',
                    {
                        sellerProfileId: profileId,
                        userId: profile.userId,
                        adminId,
                        operation: 'seller_application.approve',
                    },
                );
                return approved;
            },
        );
    }

    async reject(profileId: string, adminId: string, reason: string) {
        const profile = await this.sellerProfiles.findById(profileId);
        if (!profile)
            throw new NotFoundException('Seller application not found');
        if (profile.status !== SellerStatus.PENDING) {
            throw new ConflictException(
                'Only pending applications can be rejected',
            );
        }

        const updated = await this.sellerProfiles.claimPending(profileId, {
            status: SellerStatus.REJECTED,
            reviewedById: adminId,
            reviewedAt: new Date(),
            rejectionReason: reason,
        });
        if (!updated.count)
            throw new ConflictException('Application was already processed');
        const rejected = await this.sellerProfiles.findByIdOrThrow(profileId);
        void this.logger.audit(
            SellersService.name,
            'Seller application rejected',
            {
                sellerProfileId: profileId,
                userId: profile.userId,
                adminId,
                operation: 'seller_application.reject',
            },
        );
        return rejected;
    }
}
