import { IsEmail, IsIn, IsNotEmpty, IsString, MinLength } from 'class-validator';
import type { CreateStaffUserInput } from '@coralyn/contracts';

export class CreateStaffUserDto implements CreateStaffUserInput {
  @IsEmail()
  email!: string;

  // MinLength(8): guardia minima di robustezza (non-debito), la password è impostata dall'admin.
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;

  @IsIn(['admin', 'staff']) // mai 'superuser' → 400
  role!: 'admin' | 'staff';
}
