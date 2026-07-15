import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { CustomerAuthResponse } from '@coralyn/contracts';
import { Public } from '../identity/public.decorator';
import { CustomerSessionService } from './customer-session.service';
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
}
