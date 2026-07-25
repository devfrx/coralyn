import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import type { SeasonDTO } from '@coralyn/contracts';
import { SeasonsService } from './seasons.service';
import { CreateSeasonDto } from './dto/create-season.dto';
import { Permission } from '../identity/permission';
import { RequiresPermission } from '../identity/permission.decorator';

@Controller('seasons')
@RequiresPermission(Permission.PricingManage)
export class SeasonsController {
  constructor(private readonly seasons: SeasonsService) {}

  @Get()
  list(): Promise<SeasonDTO[]> {
    return this.seasons.list();
  }

  @Post()
  create(@Body() body: CreateSeasonDto): Promise<SeasonDTO> {
    return this.seasons.create(body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<SeasonDTO> {
    return this.seasons.remove(id);
  }
}
