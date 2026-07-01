import { IsCalendarDate } from '../../common/is-calendar-date';

export class RenewalCampaignQueryDto {
  @IsCalendarDate()
  destinationDate!: string;
}
