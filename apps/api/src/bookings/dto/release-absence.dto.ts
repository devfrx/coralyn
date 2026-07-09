import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { ReleaseAbsenceInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';

/** Validazione registrazione assenza (D-035). Gli invarianti di dominio (consenso, span, ≥ oggi,
 *  copertura, no-doppione) sono nel service: qui solo shape/bound sintattici. */
export class ReleaseAbsenceDto implements ReleaseAbsenceInput {
  @IsCalendarDate()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
