import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { CreatePackageInput } from '@coralyn/contracts';
import { PackageEquipmentItemDto } from './package-equipment-item.dto';

export class CreatePackageDto implements CreatePackageInput {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageEquipmentItemDto)
  equipment!: PackageEquipmentItemDto[];
}
