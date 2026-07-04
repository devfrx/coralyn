import { Controller, Get } from '@nestjs/common';
import type { EstablishmentOverviewDTO } from '@coralyn/contracts';
import { EstablishmentService } from './establishment.service';

@Controller('establishment')
export class EstablishmentController {
  constructor(private readonly establishment: EstablishmentService) {}

  @Get('overview')
  overview(): Promise<EstablishmentOverviewDTO> {
    return this.establishment.getOverview();
  }
}
