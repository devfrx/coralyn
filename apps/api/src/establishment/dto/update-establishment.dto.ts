import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import type { UpdateEstablishmentInput } from '@coralyn/contracts';

export class UpdateEstablishmentDto implements UpdateEstablishmentInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}
