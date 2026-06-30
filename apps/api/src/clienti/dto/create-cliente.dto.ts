import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { CreaClienteInput } from '@coralyn/contracts';
import { NormalizeContatto } from './normalize';

export class CreateClienteDto implements CreaClienteInput {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsString()
  @IsNotEmpty()
  cognome!: string;

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
