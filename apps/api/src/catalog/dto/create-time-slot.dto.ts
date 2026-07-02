import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import type { CreateTimeSlotInput } from '@coralyn/contracts';
import { IsClockTime } from '../../common/is-clock-time';

export class CreateTimeSlotDto implements CreateTimeSlotInput {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsClockTime()
  startTime!: string;

  @IsClockTime()
  endTime!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
