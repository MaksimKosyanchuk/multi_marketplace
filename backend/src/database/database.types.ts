import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type DatabaseClient = PrismaService | Prisma.TransactionClient;
