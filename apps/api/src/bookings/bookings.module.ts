import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { CatalogModule } from '../catalog/catalog.module';
import { RenewalCampaignsController } from './renewal-campaigns.controller';
import { RenewalCampaignsService } from './renewal-campaigns.service';

@Module({
  imports: [CatalogModule],
  controllers: [BookingsController, RenewalCampaignsController],
  providers: [BookingsService, RenewalCampaignsService],
  exports: [BookingsService, RenewalCampaignsService],
})
export class BookingsModule {}
