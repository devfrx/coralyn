import { IsUUID } from 'class-validator';
import type { RestoreUmbrellaInput } from '@coralyn/contracts';

export class RestoreUmbrellaDto implements RestoreUmbrellaInput {
  @IsUUID()
  rowId!: string;
}
