import { Matches } from 'class-validator';
import { UUID_SHAPE } from '../../common/uuid';

export class RatesQueryDto {
  @Matches(UUID_SHAPE, { message: 'seasonId must be a UUID' })
  seasonId!: string;
}
