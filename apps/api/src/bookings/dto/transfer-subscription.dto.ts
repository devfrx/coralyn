import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { TransferSubscriptionInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';
import { IsUuidShape } from '../../common/is-uuid-shape';

/** Validazione input cessione (D-013). Gli invarianti di dominio (tipo/stato, subentrante valido,
 *  effectiveDate ∈ span, bound cassa, sospensione aperta) sono nel service: qui solo shape/bound sintattici. */
export class TransferSubscriptionDto implements TransferSubscriptionInput {
  @IsUuidShape()
  newCustomerId!: string;

  @IsCalendarDate()
  effectiveDate!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  refundToPrevious!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  collectedFromNew!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
