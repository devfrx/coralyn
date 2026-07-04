import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { UpdateRowInput } from '@coralyn/contracts';

export class UpdateRowDto implements UpdateRowInput {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label?: string;
}
