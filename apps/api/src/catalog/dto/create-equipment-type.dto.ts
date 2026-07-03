import { IsNotEmpty, IsString } from 'class-validator';
import type { CreateEquipmentTypeInput } from '@coralyn/contracts';

export class CreateEquipmentTypeDto implements CreateEquipmentTypeInput {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
