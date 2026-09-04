import { Injectable, NotFoundException } from '@nestjs/common';
import { User, Role } from '@prisma/client';
import { UserRepository } from '../database/user.repository';

@Injectable()
export class UsersService {
    constructor(private readonly usersRepository: UserRepository) {}

    findByEmail(email: string): Promise<User | null> {
        return this.usersRepository.findByEmail(email.toLowerCase());
    }

    async findByIdOrThrow(id: string): Promise<User> {
        const user = await this.usersRepository.findById(id);
        if (!user) {
            throw new NotFoundException('User not found');
        }
        return user;
    }

    create(data: {
        email: string;
        passwordHash?: string | null;
        nickName: string;
        role?: Role;
    }): Promise<User> {
        return this.usersRepository.create({
            ...data,
            email: data.email.toLowerCase(),
        });
    }
}
