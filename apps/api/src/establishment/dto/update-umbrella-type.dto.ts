import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { UpdateUmbrellaTypeInput } from '@coralyn/contracts';
import { IsIconKey } from '../../common/is-icon-key';

export class UpdateUmbrellaTypeDto implements UpdateUmbrellaTypeInput {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsIconKey()
  icon?: string;
}
