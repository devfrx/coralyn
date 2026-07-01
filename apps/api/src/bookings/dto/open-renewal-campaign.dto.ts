import type { OpenRenewalCampaignInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';

export class OpenRenewalCampaignDto implements OpenRenewalCampaignInput {
  @IsCalendarDate()
  originDate!: string;

  @IsCalendarDate()
  destinationDate!: string;

  @IsCalendarDate()
  deadline!: string;
}
