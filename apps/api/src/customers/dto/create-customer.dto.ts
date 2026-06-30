import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { CreateCustomerInput } from '@coralyn/contracts';
import { NormalizeContact } from './normalize';

export class CreateCustomerDto implements CreateCustomerInput {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @NormalizeContact()
  @IsOptional()
  @IsString()
  phone?: string;

  @NormalizeContact()
  @IsOptional()
  @IsEmail()
  email?: string;

  @NormalizeContact()
  @IsOptional()
  @IsString()
  notes?: string;
}
