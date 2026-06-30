import { Controller, Get } from '@nestjs/common';
import type { PackageDTO } from '@coralyn/contracts';
import { CatalogService } from './catalog.service';

@Controller('packages')
export class PackagesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(): Promise<PackageDTO[]> {
    return this.catalog.listPackages();
  }
}
