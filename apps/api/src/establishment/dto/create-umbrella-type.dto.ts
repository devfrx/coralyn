import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { CreateUmbrellaTypeInput } from '@coralyn/contracts';

const ICON_KEYS = ['umbrella', 'leaf', 'palmtree'] as const;

export class CreateUmbrellaTypeDto implements CreateUmbrellaTypeInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsIn(ICON_KEYS)
  icon!: string;
}
