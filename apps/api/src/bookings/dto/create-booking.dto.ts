import { IsIn, IsOptional, Matches } from 'class-validator';
import type { BookingType, CreateBookingInput } from '@coralyn/contracts';
import { IsCalendarDate } from './is-calendar-date';

// UUID in forma canonica 8-4-4-4-12, SENZA vincolo di versione/variante RFC-4122: il seed di
// sviluppo e l'id del tenant usano UUID sintetici che Postgres accetta come `uuid` ma che @IsUUID()
// rifiuterebbe. Validiamo la *forma* e lasciamo alla FK il controllo di esistenza nel tenant (→ 422).
export const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const TYPES: BookingType[] = ['daily', 'periodic', 'subscription'];

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
