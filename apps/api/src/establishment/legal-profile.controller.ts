import { Body, Controller, Get, Put } from '@nestjs/common';
import type { EstablishmentLegalProfileDTO } from '@coralyn/contracts';
import { Permission } from '../identity/permission';
import { RequiresPermission } from '../identity/permission.decorator';
import { LegalProfileService } from './legal-profile.service';
import { UpdateLegalProfileDto } from './dto/update-legal-profile.dto';

@Controller('establishment/legal-profile')
@RequiresPermission(Permission.LegalProfileManage)
export class LegalProfileController {
  constructor(private readonly legal: LegalProfileService) {}

  @Get()
  get(): Promise<EstablishmentLegalProfileDTO> {
    return this.legal.getForTenant();
  }

  @Put()
  update(@Body() body: UpdateLegalProfileDto): Promise<EstablishmentLegalProfileDTO> {
    return this.legal.upsert(body);
  }
}
