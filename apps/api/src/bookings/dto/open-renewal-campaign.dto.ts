import type { OpenRenewalCampaignInput } from '@coralyn/contracts';
import { Matches } from 'class-validator';
import { IsCalendarDate } from '../../common/is-calendar-date';
import { UUID_SHAPE } from '../../common/uuid';

export class OpenRenewalCampaignDto implements OpenRenewalCampaignInput {
  @Matches(UUID_SHAPE, { message: 'originSeasonId non valido' })
  originSeasonId!: string;

  @Matches(UUID_SHAPE, { message: 'destinationSeasonId non valido' })
  destinationSeasonId!: string;

  @IsCalendarDate()
  deadline!: string;
}
