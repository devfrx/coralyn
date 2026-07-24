import { Body, Controller, Get, Put } from '@nestjs/common';
import type { EstablishmentLegalProfileDTO } from '@coralyn/contracts';
import { Role } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { LegalProfileService } from './legal-profile.service';
import { UpdateLegalProfileDto } from './dto/update-legal-profile.dto';

@Controller('establishment/legal-profile')
export class LegalProfileController {
  constructor(private readonly legal: LegalProfileService) {}

  @Get()
  @Roles(Role.Admin)
  get(): Promise<EstablishmentLegalProfileDTO> {
    return this.legal.getForTenant();
  }

  @Put()
  @Roles(Role.Admin)
  update(@Body() body: UpdateLegalProfileDto): Promise<EstablishmentLegalProfileDTO> {
    return this.legal.upsert(body);
  }
}
