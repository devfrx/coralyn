import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { UpdateEquipmentTypeInput } from '@coralyn/contracts';

export class UpdateEquipmentTypeDto implements UpdateEquipmentTypeInput {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
}
