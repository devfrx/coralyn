import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { LoginInput } from '@coralyn/contracts';

export class LoginDto implements LoginInput {
  @IsEmail()
  email!: string;

  // Il bound superiore non è cosmesi: senza, argon2 gira su un input di lunghezza arbitraria su
  // una rotta pubblica e non autenticata — vettore di esaurimento CPU/memoria (D-027).
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
