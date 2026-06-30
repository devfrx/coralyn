import { Module } from '@nestjs/common';
import { MappaController } from './mappa.controller';
import { MappaService } from './mappa.service';

@Module({
  controllers: [MappaController],
  providers: [MappaService],
})
export class MappaModule {}
