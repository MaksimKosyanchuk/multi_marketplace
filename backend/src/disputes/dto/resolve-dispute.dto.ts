import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveDisputeDto {
    @ApiProperty({
        enum: [
            DisputeStatus.RESOLVED_FOR_CUSTOMER,
            DisputeStatus.RESOLVED_FOR_SELLER,
        ],
    })
    @IsIn([
        DisputeStatus.RESOLVED_FOR_CUSTOMER,
        DisputeStatus.RESOLVED_FOR_SELLER,
    ])
    status: DisputeStatus;

    @ApiPropertyOptional({ example: 'Refund approved' })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    resolution?: string;
}
