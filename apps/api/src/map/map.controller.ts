import { Controller, Get, Query } from '@nestjs/common';
import type { DayMapDTO } from '@coralyn/contracts';
import { MapService } from './map.service';
import { MapQueryDto } from './dto/map-query.dto';

@Controller('map')
export class MapController {
  constructor(private readonly map: MapService) {}

  @Get()
  getMap(@Query() query: MapQueryDto): Promise<DayMapDTO> {
    return this.map.getDayMap(query.date);
  }
}
