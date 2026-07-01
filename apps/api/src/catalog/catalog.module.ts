import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { PackagesController } from './packages.controller';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';
import { RatesController } from './rates.controller';
import { RatesService } from './rates.service';

@Module({
  controllers: [PackagesController, SeasonsController, RatesController],
  providers: [CatalogService, SeasonsService, RatesService],
  exports: [CatalogService],
})
export class CatalogModule {}
