import { IsEmail, IsOptional, IsString } from 'class-validator';
import type { UpdateCustomerInput } from '@coralyn/contracts';
import { NormalizeContact } from './normalize';

export class UpdateCustomerDto implements UpdateCustomerInput {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

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
