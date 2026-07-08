import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { ReactivateSubscriptionInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';

/** Validazione input riattivazione (D-013). Gli invarianti (aperta esistente, S < R ≤ endDate,
 *  coda libera, refund ≤ residuo) sono nel service. */
export class ReactivateSubscriptionDto implements ReactivateSubscriptionInput {
  @IsCalendarDate()
  returnDate!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  refundAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
