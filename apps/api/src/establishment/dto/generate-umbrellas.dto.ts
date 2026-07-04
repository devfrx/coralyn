import { IsInt, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import type { GenerateUmbrellasInput } from '@coralyn/contracts';

export class GenerateUmbrellasDto implements GenerateUmbrellasInput {
  @IsUUID()
  rowId!: string;

  @IsString()
  @MaxLength(20)
  prefix!: string; // '' ammesso

  @IsInt()
  @Min(0)
  start!: number;

  @IsInt()
  @Min(1)
  @Max(60)
  count!: number;

  @ValidateIf((o: GenerateUmbrellasDto) => o.umbrellaTypeId !== null)
  @IsUUID()
  umbrellaTypeId!: string | null;
}
