import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { RentalCatalogService } from './rental-catalog.service';
import { RentalItemsController } from './rental-items.controller';
import { RentalTariffsController } from './rental-tariffs.controller';
import { RentalsController } from './rentals.controller';
import { RentalsService } from './rentals.service';

@Module({
  imports: [CatalogModule],
  controllers: [RentalItemsController, RentalTariffsController, RentalsController],
  providers: [RentalCatalogService, RentalsService],
})
export class RentalsModule {}
