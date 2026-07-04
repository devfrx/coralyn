import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@coralyn/contracts';
import type { StructureSectorDTO } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { SectorsService } from './sectors.service';
import { CreateSectorDto } from './dto/create-sector.dto';
import { UpdateSectorDto } from './dto/update-sector.dto';

@Controller('establishment/sectors')
@Roles(Role.Admin)
export class SectorsController {
  constructor(private readonly sectors: SectorsService) {}

  @Post()
  create(@Body() body: CreateSectorDto): Promise<StructureSectorDTO> {
    return this.sectors.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateSectorDto): Promise<StructureSectorDTO> {
    return this.sectors.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<StructureSectorDTO> {
    return this.sectors.remove(id);
  }
}
