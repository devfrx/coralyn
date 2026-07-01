import { IsNotEmpty, IsString } from 'class-validator';
import type { CreateSeasonInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';

export class CreateSeasonDto implements CreateSeasonInput {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsCalendarDate()
  startDate!: string;

  @IsCalendarDate()
  endDate!: string;
}
