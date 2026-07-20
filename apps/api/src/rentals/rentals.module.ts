import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { RentalCatalogService } from './rental-catalog.service';
import { RentalItemsController } from './rental-items.controller';

@Module({
  imports: [CatalogModule],
  controllers: [RentalItemsController],
  providers: [RentalCatalogService],
})
export class RentalsModule {}
