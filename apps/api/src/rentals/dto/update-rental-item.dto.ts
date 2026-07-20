import { IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import type { UpdateRentalItemInput } from '@coralyn/contracts';

export class UpdateRentalItemDto implements UpdateRentalItemInput {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) stock?: number | null;
}
