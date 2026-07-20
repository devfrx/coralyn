import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { RentalCatalogService } from './rental-catalog.service';
import { RentalItemsController } from './rental-items.controller';
import { RentalTariffsController } from './rental-tariffs.controller';

@Module({
  imports: [CatalogModule],
  controllers: [RentalItemsController, RentalTariffsController],
  providers: [RentalCatalogService],
})
export class RentalsModule {}
