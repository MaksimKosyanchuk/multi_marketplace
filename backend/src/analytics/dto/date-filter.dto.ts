import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class DateFilterDto {
    @ApiPropertyOptional({
        description: 'Period start date in YYYY-MM-DD format',
        example: '2026-08-01',
    })
    @IsOptional()
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'Параметр "from" должен быть в формате YYYY-MM-DD',
    })
    from?: string;

    @ApiPropertyOptional({
        description: 'Period end date in YYYY-MM-DD format',
        example: '2026-08-31',
    })
    @IsOptional()
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'Параметр "to" должен быть в формате YYYY-MM-DD',
    })
    to?: string;
}
