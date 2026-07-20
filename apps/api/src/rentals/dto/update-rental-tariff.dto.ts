import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import type { UpdateRentalTariffInput } from '@coralyn/contracts';

export class UpdateRentalTariffDto implements UpdateRentalTariffInput {
  @IsOptional() @IsString() @IsNotEmpty() label?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) durationMinutes?: number | null;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}
