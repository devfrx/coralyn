import { IsOptional, Matches } from 'class-validator';

export class MappaQueryDto {
  /** ISO yyyy-mm-dd; opzionale (default: oggi). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'data deve essere in formato yyyy-mm-dd' })
  data?: string;
}
