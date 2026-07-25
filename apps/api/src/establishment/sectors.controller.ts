import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { StructureSectorDTO } from '@coralyn/contracts';
import { Permission } from '../identity/permission';
import { RequiresPermission } from '../identity/permission.decorator';
import { SectorsService } from './sectors.service';
import { CreateSectorDto } from './dto/create-sector.dto';
import { UpdateSectorDto } from './dto/update-sector.dto';

@Controller('establishment/sectors')
@RequiresPermission(Permission.StructureManage)
export class SectorsController {
  constructor(private readonly sectors: SectorsService) {}

  @Post()
  create(@Body() body: CreateSectorDto): Promise<StructureSectorDTO> {
    return this.sectors.create(body);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateSectorDto): Promise<StructureSectorDTO> {
    return this.sectors.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<StructureSectorDTO> {
    return this.sectors.remove(id);
  }
}
