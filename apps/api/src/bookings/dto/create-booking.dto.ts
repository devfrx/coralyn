import { IsIn, IsOptional, Matches } from 'class-validator';
import type { BookingType, CreateBookingInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';
export { UUID_SHAPE } from '../../common/uuid';
import { UUID_SHAPE } from '../../common/uuid';

export const TYPES: BookingType[] = ['daily', 'periodic', 'subscription'];

export class CreateBookingDto implements CreateBookingInput {
  @Matches(UUID_SHAPE, { message: 'customerId must be a UUID' })
  customerId!: string;

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
