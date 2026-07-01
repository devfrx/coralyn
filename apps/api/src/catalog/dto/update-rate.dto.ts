import { IsIn, IsNumber, IsOptional, Matches, Min } from 'class-validator';
import type { BookingType, RateUnit, UpdateRateInput } from '@coralyn/contracts';
import { UUID_SHAPE } from '../../common/uuid';
import { IsCalendarDate } from '../../common/is-calendar-date';

const TYPES: BookingType[] = ['daily', 'periodic', 'subscription'];
const UNITS: RateUnit[] = ['day', 'period'];

export class UpdateRateDto implements UpdateRateInput {
  // Le dimensioni accettano `| null` (azzera la dimensione in edit). @IsOptional() di class-validator
  // salta la validazione sia per `undefined` che per `null`, quindi i decorator sotto restano invariati.
  @IsOptional() @IsIn(TYPES) type?: BookingType | null;
  @IsOptional() @Matches(UUID_SHAPE, { message: 'sectorId must be a UUID' }) sectorId?: string | null;
  @IsOptional() @Matches(UUID_SHAPE, { message: 'rowId must be a UUID' }) rowId?: string | null;
  @IsOptional() @Matches(UUID_SHAPE, { message: 'packageId must be a UUID' }) packageId?: string | null;
  @IsOptional() @Matches(UUID_SHAPE, { message: 'timeSlotId must be a UUID' }) timeSlotId?: string | null;
  @IsOptional() @IsCalendarDate() periodStart?: string | null;
  @IsOptional() @IsCalendarDate() periodEnd?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price?: number;
  @IsOptional() @IsIn(UNITS) unit?: RateUnit;
}
