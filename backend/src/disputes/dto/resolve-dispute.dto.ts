import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveDisputeDto {
    @ApiProperty({
        enum: [
            DisputeStatus.RESOLVED_FOR_CUSTOMER,
            DisputeStatus.RESOLVED_FOR_SELLER,
            DisputeStatus.CLOSED,
        ],
    })
    @IsEnum(DisputeStatus)
    status: DisputeStatus;

    @ApiPropertyOptional({ example: 'Возврат одобрен' })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    resolution?: string;
}
