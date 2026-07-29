import { IsInt, Min } from 'class-validator';
import type { MoveUmbrellaInput } from '@coralyn/contracts';
import { IsUuidShape } from '../../common/is-uuid-shape';

export class MoveUmbrellaDto implements MoveUmbrellaInput {
  @IsUuidShape()
  rowId!: string;

  // Estremo superiore non dichiarabile qui: dipende da quanti ombrelloni ha la fila di
  // destinazione, che si conosce solo dentro la transazione → 422 dal service.
  @IsInt()
  @Min(0)
  position!: number;
}
