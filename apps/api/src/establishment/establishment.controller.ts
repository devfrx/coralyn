import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { EstablishmentOverviewDTO, SetupStatusDTO } from '@coralyn/contracts';
import { EstablishmentService } from './establishment.service';
import { SetupStatusService } from './setup-status.service';
import { Permission } from '../identity/permission';
import { RequiresPermission } from '../identity/permission.decorator';
import { UpdateEstablishmentDto } from './dto/update-establishment.dto';

@Controller('establishment')
export class EstablishmentController {
  constructor(
    private readonly establishment: EstablishmentService,
    private readonly setupStatus_: SetupStatusService,
  ) {}

  // ⚠️ Leggibile anche dallo staff perché l'app-shell la usa per il nome della stagione attiva
  // (SidebarNav → useActiveSeason): il permesso è inchiodato al consumatore più debole, quindi
  // il payload NON può contenere dati personali. Il team è su GET establishment/users, sotto
  // `team.manage` (D-064, AUD-004). Presidio: `establishment.e2e-spec.ts`.
  @Get('overview')
  @RequiresPermission(Permission.EstablishmentRead)
  overview(): Promise<EstablishmentOverviewDTO> {
    return this.establishment.getOverview();
  }

  @Patch()
  @RequiresPermission(Permission.EstablishmentManage)
  rename(@Body() body: UpdateEstablishmentDto): Promise<{ id: string; name: string }> {
    return this.establishment.rename(body.name);
  }

  @Get('setup-status')
  @RequiresPermission(Permission.EstablishmentManage)
  setupStatus(): Promise<SetupStatusDTO> {
    return this.setupStatus_.getStatus();
  }
}
