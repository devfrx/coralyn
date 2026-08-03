import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { CreateUmbrellaTypeInput } from '@coralyn/contracts';
import { IsIconKey } from '../../common/is-icon-key';

export class CreateUmbrellaTypeDto implements CreateUmbrellaTypeInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsIconKey()
  icon!: string;
}
