import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import type { LoginInput } from '@coralyn/contracts';

export class LoginDto implements LoginInput {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
