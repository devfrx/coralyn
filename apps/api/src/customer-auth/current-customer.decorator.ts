import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { CustomerPrincipal } from './customer-principal';

/** Inietta `req.customer` (popolato dal CustomerJwtGuard) in un handler. */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CustomerPrincipal => {
    const req = ctx.switchToHttp().getRequest<Request & { customer: CustomerPrincipal }>();
    return req.customer;
  },
);
