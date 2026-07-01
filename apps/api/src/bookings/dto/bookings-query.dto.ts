import { IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../common/is-calendar-date';

export class BookingsQueryDto {
  @IsOptional()
  @IsCalendarDate()
  date?: string;
}
