import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import type { CreateEstablishmentInput } from '@coralyn/contracts';

export class CreateEstablishmentDto implements CreateEstablishmentInput {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  adminEmail!: string;
}
