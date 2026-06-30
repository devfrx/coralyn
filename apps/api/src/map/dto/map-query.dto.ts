import { IsOptional, Matches } from 'class-validator';

export class MapQueryDto {
  /** ISO yyyy-mm-dd; optional (default: today). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in yyyy-mm-dd format' })
  date?: string;
}
