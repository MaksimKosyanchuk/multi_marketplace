import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectSellerApplicationDto {
    @ApiProperty({ example: 'Please provide complete store information.' })
    @IsString()
    @MinLength(3)
    @MaxLength(1000)
    reason: string;
}
