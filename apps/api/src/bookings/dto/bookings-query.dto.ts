import { IsOptional } from 'class-validator';
import { IsCalendarDate } from './is-calendar-date';

export class BookingsQueryDto {
  @IsOptional()
  @IsCalendarDate()
  date?: string;
}
