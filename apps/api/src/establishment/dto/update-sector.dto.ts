import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { SectorKind, UpdateSectorInput } from '@coralyn/contracts';

const KINDS = ['grid', 'special'] as const;

export class UpdateSectorDto implements UpdateSectorInput {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsIn(KINDS)
  kind?: SectorKind;
}
