import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@coralyn/contracts';
import type { CreateEstablishmentResponse, PlatformEstablishmentDTO, ResetAdminPasswordResponse } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { CurrentUser } from '../identity/current-user.decorator';
import type { AuthUser } from '../identity/auth-user';
import { PlatformMetricsService } from './platform-metrics.service';
import { PlatformProvisioningService } from './platform-provisioning.service';
import { CreateEstablishmentDto } from './dto/create-establishment.dto';

@Controller('platform')
@Roles(Role.Superuser) // l'intero modulo è cross-tenant, solo distributore
export class PlatformController {
  constructor(
    private readonly metrics: PlatformMetricsService,
    private readonly provisioning: PlatformProvisioningService,
  ) {}

  @Get('establishments')
  list(): Promise<PlatformEstablishmentDTO[]> {
    return this.metrics.list();
  }

  @Get('establishments/:id')
  getOne(@Param('id') id: string): Promise<PlatformEstablishmentDTO> {
    return this.metrics.getOne(id);
  }

  @Post('establishments')
  create(@Body() body: CreateEstablishmentDto, @CurrentUser() user: AuthUser): Promise<CreateEstablishmentResponse> {
    return this.provisioning.create(body, user.id);
  }

  @Post('establishments/:id/suspend')
  suspend(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<PlatformEstablishmentDTO> {
    return this.provisioning.suspend(id, user.id);
  }

  @Post('establishments/:id/reactivate')
  reactivate(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<PlatformEstablishmentDTO> {
    return this.provisioning.reactivate(id, user.id);
  }

  @Post('establishments/:id/reset-admin-password')
  resetAdminPassword(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<ResetAdminPasswordResponse> {
    return this.provisioning.resetAdminPassword(id, user.id);
  }
}
