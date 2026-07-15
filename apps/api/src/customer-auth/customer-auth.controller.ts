import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import type { CustomerAuthResponse, CustomerMeDTO } from '@coralyn/contracts';
import { Public } from '../identity/public.decorator';
import { CustomerSessionService } from './customer-session.service';
import { CustomerJwtGuard } from './customer-jwt.guard';
import { CurrentCustomer } from './current-customer.decorator';
import type { CustomerPrincipal } from './customer-principal';
import { CustomerActivateDto } from './dto/customer-activate.dto';
import { CustomerRefreshDto } from './dto/customer-refresh.dto';

/** Endpoint pubblici del canale cliente self-service (D-035 S3). @Public: bypassano la
 *  JwtAuthGuard globale (staff); l'auth cliente vera è nel body/token del canale. */
@Controller('customer')
export class CustomerAuthController {
  constructor(private readonly sessions: CustomerSessionService) {}

  @Public()
  @Post('activate')
  @HttpCode(HttpStatus.OK)
  activate(@Body() body: CustomerActivateDto): Promise<CustomerAuthResponse> {
    return this.sessions.activate(body);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: CustomerRefreshDto): Promise<CustomerAuthResponse> {
    return this.sessions.refresh(body);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() body: CustomerRefreshDto): Promise<void> {
    return this.sessions.logout(body.refreshToken);
  }

  @Public()
  @UseGuards(CustomerJwtGuard)
  @Get('me')
  me(@CurrentCustomer() customer: CustomerPrincipal): Promise<CustomerMeDTO> {
    return this.sessions.getMe(customer.id, customer.establishmentId);
  }
}
