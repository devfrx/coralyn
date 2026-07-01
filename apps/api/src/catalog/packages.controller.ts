import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type { PackageDTO } from '@coralyn/contracts';
import { CatalogService } from './catalog.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

@Controller('packages')
export class PackagesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(): Promise<PackageDTO[]> {
    return this.catalog.listPackages();
  }

  @Post()
  create(@Body() body: CreatePackageDto): Promise<PackageDTO> {
    return this.catalog.createPackage(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdatePackageDto): Promise<PackageDTO> {
    return this.catalog.updatePackage(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<PackageDTO> {
    return this.catalog.deletePackage(id);
  }
}
