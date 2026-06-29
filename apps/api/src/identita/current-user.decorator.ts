import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth-user';

/** Inietta `req.user` (popolato dalla JwtAuthGuard) in un handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
    return req.user;
  },
);
