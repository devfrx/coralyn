import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { PackagesController } from './packages.controller';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';
import { RatesController } from './rates.controller';
import { RatesService } from './rates.service';
import { TimeSlotsController } from './time-slots.controller';
import { TimeSlotsService } from './time-slots.service';

@Module({
  controllers: [PackagesController, SeasonsController, RatesController, TimeSlotsController],
  providers: [CatalogService, SeasonsService, RatesService, TimeSlotsService],
  exports: [CatalogService],
})
export class CatalogModule {}
