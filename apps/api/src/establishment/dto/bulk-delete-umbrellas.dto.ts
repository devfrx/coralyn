import { ArrayMaxSize, ArrayMinSize, IsArray } from 'class-validator';
import type { BulkDeleteUmbrellasInput } from '@coralyn/contracts';
import { IsUuidShape } from '../../common/is-uuid-shape';

export class BulkDeleteUmbrellasDto implements BulkDeleteUmbrellasInput {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUuidShape({ each: true })
  ids!: string[];
}
