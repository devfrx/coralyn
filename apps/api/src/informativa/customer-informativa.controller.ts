import { Controller, Get, UseGuards } from '@nestjs/common';
import type { PublicTitolareDTO } from '@coralyn/contracts';
import { Public } from '../identity/public.decorator';
import { CustomerJwtGuard } from '../customer-auth/customer-jwt.guard';
import { CurrentCustomer } from '../customer-auth/current-customer.decorator';
import type { CustomerPrincipal } from '../customer-auth/customer-principal';
import { LegalProfileService } from '../establishment/legal-profile.service';

@Controller('customer/me')
export class CustomerInformativaController {
  constructor(private readonly legal: LegalProfileService) {}

  @Public()
  @UseGuards(CustomerJwtGuard)
  @Get('informativa')
  get(@CurrentCustomer() customer: CustomerPrincipal): Promise<PublicTitolareDTO> {
    return this.legal.getTitolare(customer.establishmentId);
  }
}
