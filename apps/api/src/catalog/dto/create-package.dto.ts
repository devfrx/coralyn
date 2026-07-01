import { IsNotEmpty, IsObject, IsString } from 'class-validator';
import type { CreatePackageInput } from '@coralyn/contracts';

export class CreatePackageDto implements CreatePackageInput {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsObject()
  equipment!: Record<string, number>;
}
