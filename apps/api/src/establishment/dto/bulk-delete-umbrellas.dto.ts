import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import type { BulkDeleteUmbrellasInput } from '@coralyn/contracts';

export class BulkDeleteUmbrellasDto implements BulkDeleteUmbrellasInput {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  ids!: string[];
}
