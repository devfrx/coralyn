import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { RentalItemDTO } from '@coralyn/contracts';
import { RentalCatalogService } from './rental-catalog.service';
import { CreateRentalItemDto } from './dto/create-rental-item.dto';
import { UpdateRentalItemDto } from './dto/update-rental-item.dto';

@Controller('rental-items')
export class RentalItemsController {
  constructor(private readonly catalog: RentalCatalogService) {}

  @Get() list(@Query('includeArchived') a?: string): Promise<RentalItemDTO[]> {
    return this.catalog.listRentalItems(a === 'true');
  }
  @Post() create(@Body() b: CreateRentalItemDto): Promise<RentalItemDTO> { return this.catalog.createRentalItem(b); }
  @Patch(':id') update(@Param('id') id: string, @Body() b: UpdateRentalItemDto): Promise<RentalItemDTO> {
    return this.catalog.updateRentalItem(id, b);
  }
  @Post(':id/archive') archive(@Param('id') id: string): Promise<RentalItemDTO> { return this.catalog.archiveRentalItem(id); }
  @Post(':id/restore') restore(@Param('id') id: string): Promise<RentalItemDTO> { return this.catalog.restoreRentalItem(id); }
  @Delete(':id') remove(@Param('id') id: string): Promise<RentalItemDTO> { return this.catalog.deleteRentalItem(id); }
}
