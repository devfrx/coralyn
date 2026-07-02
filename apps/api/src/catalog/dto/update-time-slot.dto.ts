import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import type { UpdateTimeSlotInput } from '@coralyn/contracts';
import { IsClockTime } from '../../common/is-clock-time';

export class UpdateTimeSlotDto implements UpdateTimeSlotInput {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsClockTime()
  startTime?: string;

  @IsOptional()
  @IsClockTime()
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
