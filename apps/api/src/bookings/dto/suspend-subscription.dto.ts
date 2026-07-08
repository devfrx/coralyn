import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { SuspendSubscriptionInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';

/** Validazione input sospensione (D-013). Gli invarianti di dominio (S ≥ oggi, ritorno entro stagione,
 *  copertura, refund ≤ residuo) sono nel service: qui solo shape/bound sintattici. */
export class SuspendSubscriptionDto implements SuspendSubscriptionInput {
  @IsCalendarDate()
  startDate!: string;

  @IsOptional()
  @IsCalendarDate()
  endDate?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  refundAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
