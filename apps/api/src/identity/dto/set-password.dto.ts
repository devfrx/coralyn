import { IsString, MinLength } from 'class-validator';
import type { SetPasswordInput } from '@coralyn/contracts';

export class SetPasswordDto implements SetPasswordInput {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(10, { message: 'La password deve avere almeno 10 caratteri' })
  password!: string;
}
