import { IsIn, IsOptional, Matches } from 'class-validator';
import type { BookingType, QuoteBookingInput } from '@coralyn/contracts';
import { IsCalendarDate } from './is-calendar-date';
import { UUID_SHAPE } from './create-booking.dto';

const TYPES: BookingType[] = ['daily', 'periodic', 'subscription'];

export class QuoteBookingDto implements QuoteBookingInput {
  @Matches(UUID_SHAPE, { message: 'umbrellaId must be a UUID' })
  umbrellaId!: string;

  @Matches(UUID_SHAPE, { message: 'timeSlotId must be a UUID' })
  timeSlotId!: string;

  @IsIn(TYPES)
  type!: BookingType;

  @IsCalendarDate()
  startDate!: string;

  @IsOptional()
  @IsCalendarDate()
  endDate?: string;

  @IsOptional()
  @Matches(UUID_SHAPE, { message: 'packageId must be a UUID' })
  packageId?: string;
}
