import { IsOptional, Matches } from 'class-validator';
import type { CreateBookingInput } from '@coralyn/contracts';
import { IsCalendarDate } from './is-calendar-date';

// UUID in forma canonica 8-4-4-4-12, SENZA vincolo di versione/variante RFC-4122: il seed di
// sviluppo e l'id del tenant (00000000-...-0001) usano UUID sintetici che Postgres accetta come
// `uuid` ma che @IsUUID() rifiuterebbe. Validiamo la *forma* (evita 500 da cast Postgres su input
// malformato) e lasciamo alla FK il controllo di esistenza nel tenant (→ 422).
export const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export class CreateBookingDto implements CreateBookingInput {
  @Matches(UUID_SHAPE, { message: 'customerId must be a UUID' })
  customerId!: string;

  @Matches(UUID_SHAPE, { message: 'umbrellaId must be a UUID' })
  umbrellaId!: string;

  @Matches(UUID_SHAPE, { message: 'timeSlotId must be a UUID' })
  timeSlotId!: string;

  @IsCalendarDate()
  date!: string;

  @IsOptional()
  @Matches(UUID_SHAPE, { message: 'packageId must be a UUID' })
  packageId?: string;
}
