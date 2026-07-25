import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';
import type { CheckoutRentalInput } from '@coralyn/contracts';
import { IsUuidShape } from '../../common/is-uuid-shape';

export class CheckoutRentalDto implements CheckoutRentalInput {
  @IsUuidShape() rentalItemId!: string;
  @IsUuidShape() rentalTariffId!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUuidShape() customerId?: string | null;
  @IsOptional() @IsInt() @Min(1) units?: number;
}
