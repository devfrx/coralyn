import { IsString, MinLength } from 'class-validator';
import type { CustomerRefreshInput } from '@coralyn/contracts';

/** Rotazione della sessione cliente: refresh token corrente (dal device). */
export class CustomerRefreshDto implements CustomerRefreshInput {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
