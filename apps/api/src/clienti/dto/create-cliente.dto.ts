import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { CreaClienteInput } from '@driftly/contracts';

export class CreateClienteDto implements CreaClienteInput {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsString()
  @IsNotEmpty()
  cognome!: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
