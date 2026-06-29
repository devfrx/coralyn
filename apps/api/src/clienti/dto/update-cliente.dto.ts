import { IsEmail, IsOptional, IsString } from 'class-validator';
import type { ModificaClienteInput } from '@driftly/contracts';

export class UpdateClienteDto implements ModificaClienteInput {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  cognome?: string;

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
