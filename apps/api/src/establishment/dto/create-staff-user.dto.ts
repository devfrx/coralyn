import { IsEmail, IsIn } from 'class-validator';
import type { CreateStaffUserInput } from '@coralyn/contracts';

export class CreateStaffUserDto implements CreateStaffUserInput {
  @IsEmail()
  email!: string;

  @IsIn(['admin', 'staff']) // mai 'superuser' → 400
  role!: 'admin' | 'staff';
}
