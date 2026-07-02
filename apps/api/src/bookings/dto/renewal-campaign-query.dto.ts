import { Matches } from 'class-validator';
import { UUID_SHAPE } from '../../common/uuid';

export class RenewalCampaignQueryDto {
  @Matches(UUID_SHAPE, { message: 'destinationSeasonId non valido' })
  destinationSeasonId!: string;
}
