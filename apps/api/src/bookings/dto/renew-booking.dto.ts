import type { RenewBookingInput } from '@coralyn/contracts';
import { Matches } from 'class-validator';
import { UUID_SHAPE } from '../../common/uuid';

// Il client passa SOLO la stagione di destinazione (per id): cliente/ombrellone/pacchetto/prezzo sono
// copiati/derivati dal server. ValidationPipe({ whitelist: true }) scarta ogni altro campo.
export class RenewBookingDto implements RenewBookingInput {
  @Matches(UUID_SHAPE, { message: 'destinationSeasonId non valido' })
  destinationSeasonId!: string;
}
