import { IsInt, IsOptional, IsUUID, Min, ValidateIf } from 'class-validator';
import type { CheckoutRentalInput } from '@coralyn/contracts';

export class CheckoutRentalDto implements CheckoutRentalInput {
  @IsUUID() rentalItemId!: string;
  @IsUUID() rentalTariffId!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() customerId?: string | null;
  @IsOptional() @IsInt() @Min(1) units?: number;
}
