import { IsNotEmpty, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import type { CreateUmbrellaInput } from '@coralyn/contracts';

export class CreateUmbrellaDto implements CreateUmbrellaInput {
  @IsUUID()
  rowId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  label!: string;

  // null = Normale; se valorizzato dev'essere un UUID (l'appartenenza al tenant → 422 nel service).
  @ValidateIf((o: CreateUmbrellaDto) => o.umbrellaTypeId !== null)
  @IsUUID()
  umbrellaTypeId!: string | null;
}
