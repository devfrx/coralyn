import { IsBoolean } from 'class-validator';
import type { UpdateStaffUserInput } from '@coralyn/contracts';

export class UpdateStaffUserDto implements UpdateStaffUserInput {
  @IsBoolean()
  disabled!: boolean;
}
