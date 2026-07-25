import type { RestoreUmbrellaInput } from '@coralyn/contracts';
import { IsUuidShape } from '../../common/is-uuid-shape';

export class RestoreUmbrellaDto implements RestoreUmbrellaInput {
  @IsUuidShape()
  rowId!: string;
}
