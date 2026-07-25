import { Injectable, Scope, Inject, BadRequestException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { tenantIdOf, type TenantId } from './tenant-id';

type TenantRequest = Request & { tenantId?: string };

@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  constructor(@Inject(REQUEST) private readonly req: TenantRequest) {}

  /** Lancia se il tenant non è stato risolto per questa richiesta. */
  require(): TenantId {
    if (!this.req.tenantId) {
      throw new BadRequestException('Tenant non risolto');
    }
    // L'unico punto in cui il tenant della richiesta diventa un TenantId: è qui che la garanzia
    // «viene dal token, non dall'input» entra nel tipo. Vedi tenant-id.ts.
    return tenantIdOf(this.req.tenantId);
  }
}
