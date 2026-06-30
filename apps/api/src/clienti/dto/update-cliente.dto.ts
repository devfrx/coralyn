import { IsEmail, IsOptional, IsString } from 'class-validator';
import type { ModificaClienteInput } from '@coralyn/contracts';
import { NormalizeContatto } from './normalize';

export class UpdateClienteDto implements ModificaClienteInput {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  cognome?: string;

  @NormalizeContatto()
  @IsOptional()
  @IsString()
  telefono?: string;

  @NormalizeContatto()
  @IsOptional()
  @IsEmail()
  email?: string;

  @NormalizeContatto()
  @IsOptional()
  @IsString()
  note?: string;
}
