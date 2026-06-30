import { Controller, Get, Query } from '@nestjs/common';
import type { MappaGiornoDTO } from '@coralyn/contracts';
import { MappaService } from './mappa.service';
import { MappaQueryDto } from './dto/mappa-query.dto';

@Controller('mappa')
export class MappaController {
  constructor(private readonly mappa: MappaService) {}

  @Get()
  getMappa(@Query() query: MappaQueryDto): Promise<MappaGiornoDTO> {
    return this.mappa.getMappaGiorno(query.data);
  }
}
