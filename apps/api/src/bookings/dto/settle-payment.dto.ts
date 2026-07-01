import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import type { PaymentMethod, SettlePaymentInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';

const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'other'];

export class SettlePaymentDto implements SettlePaymentInput {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  amountCollected!: number;

  @IsOptional()
  @IsIn(METHODS)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsCalendarDate()
  collectionDate?: string;
}
