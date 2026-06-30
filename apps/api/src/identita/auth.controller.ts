import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IdentitaService } from './identita.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './auth-user';
import { LoginResponse, UtenteDTO } from '@coralyn/contracts';

@Controller('auth')
export class AuthController {
  constructor(private readonly identita: IdentitaService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto): Promise<LoginResponse> {
    return this.identita.login(body);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<UtenteDTO> {
    return this.identita.me(user.id);
  }
}
