import { IsInt, IsUUID, Min } from 'class-validator';

export class PackageEquipmentItemDto {
  @IsUUID()
  equipmentTypeId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}
