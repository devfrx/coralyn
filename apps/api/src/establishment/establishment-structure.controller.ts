import { Controller, Get } from '@nestjs/common';
import type { EstablishmentStructureDTO } from '@coralyn/contracts';
import { Permission } from '../identity/permission';
import { RequiresPermission } from '../identity/permission.decorator';
import { EstablishmentStructureService } from './establishment-structure.service';

@Controller('establishment/structure')
@RequiresPermission(Permission.StructureManage)
export class EstablishmentStructureController {
  constructor(private readonly structure: EstablishmentStructureService) {}

  @Get()
  get(): Promise<EstablishmentStructureDTO> {
    return this.structure.getStructure();
  }
}
