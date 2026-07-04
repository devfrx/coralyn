import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import type { CreateRowInput } from '@coralyn/contracts';

export class CreateRowDto implements CreateRowInput {
  @IsUUID()
  sectorId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label!: string;
}
