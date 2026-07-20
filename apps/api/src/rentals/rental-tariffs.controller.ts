import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { RentalTariffDTO } from '@coralyn/contracts';
import { RentalCatalogService } from './rental-catalog.service';
import { CreateRentalTariffDto } from './dto/create-rental-tariff.dto';
import { UpdateRentalTariffDto } from './dto/update-rental-tariff.dto';

@Controller()
export class RentalTariffsController {
  constructor(private readonly catalog: RentalCatalogService) {}

  @Get('rental-items/:itemId/tariffs')
  list(@Param('itemId') itemId: string, @Query('seasonId') seasonId?: string,
       @Query('includeArchived') a?: string): Promise<RentalTariffDTO[]> {
    return this.catalog.listRentalTariffs(itemId, seasonId, a === 'true');
  }
  @Post('rental-items/:itemId/tariffs')
  create(@Param('itemId') itemId: string, @Body() b: CreateRentalTariffDto,
         @Query('seasonId') seasonId?: string): Promise<RentalTariffDTO> {
    return this.catalog.createRentalTariff(itemId, b, seasonId);
  }
  @Patch('rental-tariffs/:id')
  update(@Param('id') id: string, @Body() b: UpdateRentalTariffDto): Promise<RentalTariffDTO> {
    return this.catalog.updateRentalTariff(id, b);
  }
  @Post('rental-tariffs/:id/archive') archive(@Param('id') id: string): Promise<RentalTariffDTO> {
    return this.catalog.archiveRentalTariff(id);
  }
  @Post('rental-tariffs/:id/restore') restore(@Param('id') id: string): Promise<RentalTariffDTO> {
    return this.catalog.restoreRentalTariff(id);
  }
  @Delete('rental-tariffs/:id') remove(@Param('id') id: string): Promise<RentalTariffDTO> {
    return this.catalog.deleteRentalTariff(id);
  }
}
