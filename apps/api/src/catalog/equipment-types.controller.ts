import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { EquipmentTypeDTO } from '@coralyn/contracts';
import { CatalogService } from './catalog.service';
import { CreateEquipmentTypeDto } from './dto/create-equipment-type.dto';
import { UpdateEquipmentTypeDto } from './dto/update-equipment-type.dto';

@Controller('equipment-types')
export class EquipmentTypesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@Query('includeArchived') includeArchived?: string): Promise<EquipmentTypeDTO[]> {
    return this.catalog.listEquipmentTypes(includeArchived === 'true');
  }

  @Post()
  create(@Body() body: CreateEquipmentTypeDto): Promise<EquipmentTypeDTO> {
    return this.catalog.createEquipmentType(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateEquipmentTypeDto): Promise<EquipmentTypeDTO> {
    return this.catalog.updateEquipmentType(id, body);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string): Promise<EquipmentTypeDTO> {
    return this.catalog.archiveEquipmentType(id);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string): Promise<EquipmentTypeDTO> {
    return this.catalog.restoreEquipmentType(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<EquipmentTypeDTO> {
    return this.catalog.deleteEquipmentType(id);
  }
}
