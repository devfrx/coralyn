import { IsIn, IsNumber, IsOptional, Matches, Min } from 'class-validator';
import type { BookingType, CreateRateInput } from '@coralyn/contracts';
import { UUID_SHAPE } from '../../common/uuid';
import { IsCalendarDate } from '../../common/is-calendar-date';

const TYPES: BookingType[] = ['daily', 'periodic', 'subscription'];

export class CreateRateDto implements CreateRateInput {
  @Matches(UUID_SHAPE, { message: 'seasonId must be a UUID' })
  seasonId!: string;

  @IsOptional()
  @IsIn(TYPES)
  type?: BookingType;

  @IsOptional()
  @Matches(UUID_SHAPE, { message: 'sectorId must be a UUID' })
  sectorId?: string;

  @IsOptional()
  @Matches(UUID_SHAPE, { message: 'rowId must be a UUID' })
  rowId?: string;

  @IsOptional()
  @Matches(UUID_SHAPE, { message: 'packageId must be a UUID' })
  packageId?: string;

  @IsOptional()
  @Matches(UUID_SHAPE, { message: 'timeSlotId must be a UUID' })
  timeSlotId?: string;

  @IsOptional()
  @IsCalendarDate()
  periodStart?: string;

  @IsOptional()
  @IsCalendarDate()
  periodEnd?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;
}
