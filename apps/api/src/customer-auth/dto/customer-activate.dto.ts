import { IsString, MinLength } from 'class-validator';
import type { CustomerActivateInput } from '@coralyn/contracts';

/** Attivazione canale cliente: enrollment token (dal link) + PIN operatore. */
export class CustomerActivateDto implements CustomerActivateInput {
  @IsString()
  @MinLength(1)
  enrollmentToken!: string;

  @IsString()
  @MinLength(1)
  pin!: string;
}
