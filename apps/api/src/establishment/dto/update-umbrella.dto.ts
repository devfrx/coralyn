import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { UpdateUmbrellaInput } from '@coralyn/contracts';
import { IsUuidShape } from '../../common/is-uuid-shape';

export class UpdateUmbrellaDto implements UpdateUmbrellaInput {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  label?: string;

  // @IsOptional accetta null (→ Normale) e undefined (→ non toccare); un non-UUID → 400.
  @IsOptional()
  @IsUuidShape()
  umbrellaTypeId?: string | null;
}
