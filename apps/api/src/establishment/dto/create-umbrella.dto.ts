import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import type { CreateUmbrellaInput } from '@coralyn/contracts';
import { IsUuidShape } from '../../common/is-uuid-shape';

export class CreateUmbrellaDto implements CreateUmbrellaInput {
  @IsUuidShape()
  rowId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  label!: string;

  // null = Normale; se valorizzato dev'essere un UUID (l'appartenenza al tenant → 422 nel service).
  @ValidateIf((o: CreateUmbrellaDto) => o.umbrellaTypeId !== null)
  @IsUuidShape()
  umbrellaTypeId!: string | null;
}
