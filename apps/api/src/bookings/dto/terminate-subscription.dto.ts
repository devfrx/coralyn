import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { TerminateSubscriptionInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';

/** Validazione input disdetta (D-013). Gli invarianti di dominio (range data, refund ≤ incassato,
 *  tipo/stato) sono nel service: qui solo shape/bound sintattici. */
export class TerminateSubscriptionDto implements TerminateSubscriptionInput {
  @IsCalendarDate()
  effectiveDate!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  refundAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
