import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { UpdateUmbrellaInput } from '@coralyn/contracts';

export class UpdateUmbrellaDto implements UpdateUmbrellaInput {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  label?: string;

  // @IsOptional accetta null (→ Normale) e undefined (→ non toccare); un non-UUID → 400.
  @IsOptional()
  @IsUUID()
  umbrellaTypeId?: string | null;
}
