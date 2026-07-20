import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import type { CreateRentalTariffInput } from '@coralyn/contracts';

export class CreateRentalTariffDto implements CreateRentalTariffInput {
  @IsString() @IsNotEmpty() label!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price!: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) durationMinutes?: number | null;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}
