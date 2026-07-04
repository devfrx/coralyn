import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { EstablishmentOverviewDTO } from '@coralyn/contracts';
import { Role } from '@coralyn/contracts';
import { EstablishmentService } from './establishment.service';
import { Roles } from '../identity/roles.decorator';
import { UpdateEstablishmentDto } from './dto/update-establishment.dto';

@Controller('establishment')
export class EstablishmentController {
  constructor(private readonly establishment: EstablishmentService) {}

  @Get('overview')
  overview(): Promise<EstablishmentOverviewDTO> {
    return this.establishment.getOverview();
  }

  @Patch()
  @Roles(Role.Admin)
  rename(@Body() body: UpdateEstablishmentDto): Promise<{ id: string; name: string }> {
    return this.establishment.rename(body.name);
  }
}
