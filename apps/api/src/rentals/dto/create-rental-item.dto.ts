import { IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import type { CreateRentalItemInput } from '@coralyn/contracts';

export class CreateRentalItemDto implements CreateRentalItemInput {
  @IsString() @IsNotEmpty() name!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) stock?: number | null;
}
