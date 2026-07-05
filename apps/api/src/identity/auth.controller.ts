import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './auth-user';
import { CredentialSetupService } from '../credential/credential-setup.service';
import { CredentialSetupContext, LoginResponse, UserDTO } from '@coralyn/contracts';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly identity: IdentityService,
    private readonly credentials: CredentialSetupService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto): Promise<LoginResponse> {
    return this.identity.login(body);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<UserDTO> {
    return this.identity.me(user.id);
  }

  @Public()
  @Get('credential-setup/:token')
  credentialSetupContext(@Param('token') token: string): Promise<CredentialSetupContext> {
    return this.credentials.getContext(token);
  }

  @Public()
  @Post('credential-setup')
  @HttpCode(HttpStatus.NO_CONTENT)
  setPassword(@Body() body: SetPasswordDto): Promise<void> {
    return this.credentials.redeem(body.token, body.password);
  }
}
