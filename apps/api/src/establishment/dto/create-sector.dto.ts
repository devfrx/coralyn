import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { CreateSectorInput, SectorKind } from '@coralyn/contracts';

const KINDS = ['grid', 'special'] as const;

export class CreateSectorDto implements CreateSectorInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsIn(KINDS)
  kind!: SectorKind;
}
