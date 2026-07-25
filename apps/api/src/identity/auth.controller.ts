import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IdentityService } from './identity.service';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { Public } from './public.decorator';
import { Permission } from './permission';
import { RequiresPermission } from './permission.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './auth-user';
import { CredentialSetupService } from '../credential/credential-setup.service';
import { CredentialSetupContext, LoginResponse, UserDTO } from '@coralyn/contracts';

/**
 * Rate-limit delle sole rotte PUBBLICHE di questo controller. Le tre `@Public` sono raggiungibili
 * senza credenziali e ognuna esegue argon2 o consuma un token; `GET /me` no, ed è chiamata a ogni
 * caricamento dell'app — metterla nello stesso bucket la renderebbe il primo 429 di ogni giornata.
 *
 * `default` sovrascrive per-rotta il throttler globale (10/min) invece di aggiungerne uno nominato:
 * con più definizioni il guard le valuta TUTTE, quindi una seconda avrebbe stretto anche il canale
 * cliente, che qui non c'entra. Il bucket è già per-handler (la chiave include classe e metodo).
 *
 * Le 3 deroghe D-026/027/029 poggiavano su «il login staff non è esposto pubblicamente»: la slice
 * deploy del 17/07 lo ha messo su Internet con TLS e nessuno le ha rivalutate (AUD-003).
 *
 * Limite env-driven come per il canale cliente. 20/min e non meno: la chiave è l'IP, e un lido
 * dietro NAT ha tutti gli operatori sullo stesso indirizzo — troppo stretto e si autoescludono
 * all'apertura. Chiave per identità invece che per IP: proposta aperta, non fatta qui.
 */
const publicAuthThrottle = {
  default: { limit: (): number => Number(process.env.STAFF_AUTH_THROTTLE_LIMIT ?? '20'), ttl: 60_000 },
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly identity: IdentityService,
    private readonly credentials: CredentialSetupService,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle(publicAuthThrottle)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto): Promise<LoginResponse> {
    return this.identity.login(body);
  }

  @Get('me')
  @RequiresPermission(Permission.SessionRead)
  me(@CurrentUser() user: AuthUser): Promise<UserDTO> {
    return this.identity.me(user.id);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle(publicAuthThrottle)
  @Get('credential-setup/:token')
  credentialSetupContext(@Param('token') token: string): Promise<CredentialSetupContext> {
    return this.credentials.getContext(token);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle(publicAuthThrottle)
  @Post('credential-setup')
  @HttpCode(HttpStatus.NO_CONTENT)
  setPassword(@Body() body: SetPasswordDto): Promise<void> {
    return this.credentials.redeem(body.token, body.password);
  }
}
