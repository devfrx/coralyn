import { Controller, Get, Query } from '@nestjs/common';
import type { DayMapDTO } from '@coralyn/contracts';
import { MapService } from './map.service';
import { MapQueryDto } from './dto/map-query.dto';
import { Permission } from '../identity/permission';
import { RequiresPermission } from '../identity/permission.decorator';

@Controller('map')
@RequiresPermission(Permission.MapRead)
export class MapController {
  constructor(private readonly map: MapService) {}

  @Get()
  getMap(@Query() query: MapQueryDto): Promise<DayMapDTO> {
    return this.map.getDayMap(query.date);
  }
}
