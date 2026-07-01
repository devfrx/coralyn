import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import type { RenewalCampaignDTO, RenewalCampaignDetailDTO } from '@coralyn/contracts';
import { RenewalCampaignsService } from './renewal-campaigns.service';
import { OpenRenewalCampaignDto } from './dto/open-renewal-campaign.dto';
import { RenewalCampaignQueryDto } from './dto/renewal-campaign-query.dto';

@Controller('renewal-campaigns')
export class RenewalCampaignsController {
  constructor(private readonly campaigns: RenewalCampaignsService) {}

  @Post()
  open(@Body() body: OpenRenewalCampaignDto): Promise<RenewalCampaignDTO> {
    return this.campaigns.open(body);
  }

  @Get()
  get(@Query() query: RenewalCampaignQueryDto): Promise<RenewalCampaignDetailDTO | null> {
    return this.campaigns.getByDestinationDate(query.destinationDate);
  }

  @Delete(':id')
  async close(@Param('id') id: string): Promise<{ ok: true }> {
    await this.campaigns.close(id);
    return { ok: true };
  }
}
