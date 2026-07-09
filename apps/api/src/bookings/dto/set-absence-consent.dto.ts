import { IsBoolean } from 'class-validator';
import type { SetAbsenceConsentInput } from '@coralyn/contracts';

/** Validazione grant/revoke consenso assenze (D-035). Gli invarianti di dominio sono nel service. */
export class SetAbsenceConsentDto implements SetAbsenceConsentInput {
  @IsBoolean()
  consent!: boolean;
}
