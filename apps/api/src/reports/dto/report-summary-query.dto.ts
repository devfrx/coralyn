import { IsIn, IsOptional } from 'class-validator';
import type { ReportPeriod } from '@coralyn/contracts';

const PERIODS: ReportPeriod[] = ['today', 'week', 'season'];

export class ReportSummaryQueryDto {
  @IsOptional()
  @IsIn(PERIODS, { message: 'period must be one of today|week|season' })
  period?: ReportPeriod;
}
