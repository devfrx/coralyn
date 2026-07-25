import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { CreateRowInput } from '@coralyn/contracts';
import { IsUuidShape } from '../../common/is-uuid-shape';

export class CreateRowDto implements CreateRowInput {
  @IsUuidShape()
  sectorId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label!: string;
}
