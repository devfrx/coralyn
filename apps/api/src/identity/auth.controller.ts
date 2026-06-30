import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './auth-user';
import { LoginResponse, UserDTO } from '@coralyn/contracts';

@Controller('auth')
export class AuthController {
  constructor(private readonly identity: IdentityService) {}

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
}
