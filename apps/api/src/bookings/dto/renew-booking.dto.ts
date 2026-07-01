import type { RenewBookingInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';

// Il client passa SOLO la stagione di destinazione: cliente/ombrellone/pacchetto/prezzo sono
// copiati/derivati dal server. ValidationPipe({ whitelist: true }) scarta ogni altro campo.
export class RenewBookingDto implements RenewBookingInput {
  @IsCalendarDate()
  startDate!: string;
}
