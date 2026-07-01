import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import type { UpdatePackageInput } from '@coralyn/contracts';

export class UpdatePackageDto implements UpdatePackageInput {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsObject() equipment?: Record<string, number>;
}
