import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { UpdateUmbrellaTypeInput } from '@coralyn/contracts';

const ICON_KEYS = ['umbrella', 'leaf', 'palmtree'] as const;

export class UpdateUmbrellaTypeDto implements UpdateUmbrellaTypeInput {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsIn(ICON_KEYS)
  icon?: string;
}
