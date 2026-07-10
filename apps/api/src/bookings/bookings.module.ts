import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { CatalogModule } from '../catalog/catalog.module';
import { RenewalCampaignsController } from './renewal-campaigns.controller';
import { RenewalCampaignsService } from './renewal-campaigns.service';
import { CustomerAuthModule } from '../customer-auth/customer-auth.module';

@Module({
  imports: [CatalogModule, CustomerAuthModule],
  controllers: [BookingsController, RenewalCampaignsController],
  providers: [BookingsService, RenewalCampaignsService],
  exports: [BookingsService, RenewalCampaignsService],
})
export class BookingsModule {}
