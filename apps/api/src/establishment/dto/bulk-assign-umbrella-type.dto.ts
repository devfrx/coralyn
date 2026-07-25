import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateIf } from 'class-validator';
import type { BulkAssignUmbrellaTypeInput } from '@coralyn/contracts';
import { IsUuidShape } from '../../common/is-uuid-shape';

export class BulkAssignUmbrellaTypeDto implements BulkAssignUmbrellaTypeInput {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUuidShape({ each: true })
  ids!: string[];

  @ValidateIf((o: BulkAssignUmbrellaTypeDto) => o.umbrellaTypeId !== null)
  @IsUuidShape()
  umbrellaTypeId!: string | null;
}
