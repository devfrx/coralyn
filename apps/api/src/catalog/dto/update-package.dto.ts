import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { UpdatePackageInput } from '@coralyn/contracts';
import { PackageEquipmentItemDto } from './package-equipment-item.dto';

export class UpdatePackageDto implements UpdatePackageInput {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PackageEquipmentItemDto)
  equipment?: PackageEquipmentItemDto[];
}
