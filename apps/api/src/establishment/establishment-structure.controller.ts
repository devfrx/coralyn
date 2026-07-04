import { Controller, Get } from '@nestjs/common';
import { Role } from '@coralyn/contracts';
import type { EstablishmentStructureDTO } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { EstablishmentStructureService } from './establishment-structure.service';

@Controller('establishment/structure')
@Roles(Role.Admin)
export class EstablishmentStructureController {
  constructor(private readonly structure: EstablishmentStructureService) {}

  @Get()
  get(): Promise<EstablishmentStructureDTO> {
    return this.structure.getStructure();
  }
}
