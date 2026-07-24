import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import type { UpdateEstablishmentLegalProfileInput } from '@coralyn/contracts';

// Consente null esplicito (azzeramento campo) accanto a stringa valida.
const optionalEmail = () => ValidateIf((_o, v) => v !== null && v !== undefined);

export class UpdateLegalProfileDto implements UpdateEstablishmentLegalProfileInput {
  @IsOptional() @IsString() @MaxLength(200) legalName?: string | null;
  @IsOptional() @IsString() @MaxLength(300) registeredAddress?: string | null;
  @IsOptional() @IsString() @MaxLength(60) vatOrTaxId?: string | null;
  @optionalEmail() @IsEmail() contactEmail?: string | null;
  @optionalEmail() @IsEmail() pec?: string | null;
  @IsOptional() @IsString() @MaxLength(200) legalRepresentative?: string | null;
  @optionalEmail() @IsEmail() dataRightsContact?: string | null;
  @IsOptional() @IsBoolean() dpoNominated?: boolean;
  @IsOptional() @IsString() @MaxLength(300) dpoContact?: string | null;
}
