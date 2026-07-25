import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { PackageDTO } from '@coralyn/contracts';
import { CatalogService } from './catalog.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';
import { Permission } from '../identity/permission';
import { RequiresPermission } from '../identity/permission.decorator';

@Controller('packages')
@RequiresPermission(Permission.PricingManage)
export class PackagesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@Query('includeArchived') includeArchived?: string): Promise<PackageDTO[]> {
    return this.catalog.listPackages(includeArchived === 'true');
  }

  @Post()
  create(@Body() body: CreatePackageDto): Promise<PackageDTO> {
    return this.catalog.createPackage(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdatePackageDto): Promise<PackageDTO> {
    return this.catalog.updatePackage(id, body);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string): Promise<PackageDTO> {
    return this.catalog.archivePackage(id);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string): Promise<PackageDTO> {
    return this.catalog.restorePackage(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<PackageDTO> {
    return this.catalog.deletePackage(id);
  }
}
