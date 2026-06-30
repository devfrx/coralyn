import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { PackagesController } from './packages.controller';

@Module({
  controllers: [PackagesController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
