import { IsInt, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import type { GenerateUmbrellasInput } from '@coralyn/contracts';
import { IsUuidShape } from '../../common/is-uuid-shape';

export class GenerateUmbrellasDto implements GenerateUmbrellasInput {
  @IsUuidShape()
  rowId!: string;

  @IsString()
  @MaxLength(20)
  prefix!: string; // '' ammesso

  @IsInt()
  @Min(0)
  start!: number;

  @IsInt()
  @Min(1)
  @Max(500)
  count!: number;

  @ValidateIf((o: GenerateUmbrellasDto) => o.umbrellaTypeId !== null)
  @IsUuidShape()
  umbrellaTypeId!: string | null;
}
