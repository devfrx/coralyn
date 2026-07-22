import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID, ValidateIf } from 'class-validator';
import type { BulkAssignUmbrellaTypeInput } from '@coralyn/contracts';

export class BulkAssignUmbrellaTypeDto implements BulkAssignUmbrellaTypeInput {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  ids!: string[];

  @ValidateIf((o: BulkAssignUmbrellaTypeDto) => o.umbrellaTypeId !== null)
  @IsUUID()
  umbrellaTypeId!: string | null;
}
