import { Injectable, Scope, Inject, BadRequestException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

type TenantRequest = Request & { tenantId?: string };

@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  constructor(@Inject(REQUEST) private readonly req: TenantRequest) {}

  /** Lancia se il tenant non è stato risolto per questa richiesta. */
  require(): string {
    if (!this.req.tenantId) {
      throw new BadRequestException('Tenant non risolto');
    }
    return this.req.tenantId;
  }
}
