import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { EstablishmentOverviewDTO, SetupStatusDTO } from '@coralyn/contracts';
import { Role } from '@coralyn/contracts';
import { EstablishmentService } from './establishment.service';
import { SetupStatusService } from './setup-status.service';
import { Roles } from '../identity/roles.decorator';
import { UpdateEstablishmentDto } from './dto/update-establishment.dto';

@Controller('establishment')
export class EstablishmentController {
  constructor(
    private readonly establishment: EstablishmentService,
    private readonly setupStatus_: SetupStatusService,
  ) {}

  @Get('overview')
  overview(): Promise<EstablishmentOverviewDTO> {
    return this.establishment.getOverview();
  }

  @Patch()
  @Roles(Role.Admin)
  rename(@Body() body: UpdateEstablishmentDto): Promise<{ id: string; name: string }> {
    return this.establishment.rename(body.name);
  }

  @Get('setup-status')
  @Roles(Role.Admin)
  setupStatus(): Promise<SetupStatusDTO> {
    return this.setupStatus_.getStatus();
  }
}
