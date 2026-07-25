import { IsInt, Min } from 'class-validator';
import { IsUuidShape } from '../../common/is-uuid-shape';

export class PackageEquipmentItemDto {
  @IsUuidShape()
  equipmentTypeId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}
