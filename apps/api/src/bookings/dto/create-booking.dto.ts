import { IsNumber, IsUUID, Max, Min } from 'class-validator';
import type { CreateBookingInput } from '@coralyn/contracts';
import { IsCalendarDate } from './is-calendar-date';

export class CreateBookingDto implements CreateBookingInput {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  umbrellaId!: string;

  @IsUUID()
  timeSlotId!: string;

  @IsCalendarDate()
  date!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  totalPrice!: number;
}
