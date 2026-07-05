import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import type { SetPasswordInput } from '@coralyn/contracts';

export class SetPasswordDto implements SetPasswordInput {
  @IsString()
  @IsNotEmpty()
  token!: string;

  // Bar più stretto (10) rispetto alla creazione staff (create-staff-user.dto.ts, 8): la password
  // dell'admin/invitato via link vale un minimo più alto. Divergenza intenzionale, non un refuso.
  @IsString()
  @MinLength(10, { message: 'La password deve avere almeno 10 caratteri' })
  password!: string;
}
