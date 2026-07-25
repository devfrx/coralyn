import type { TenantId } from '../tenant/tenant-id';

/** Forma di `req.customer` dopo il CustomerJwtGuard. */
export interface CustomerPrincipal {
  id: string;                  // customerId
  establishmentId: TenantId;   // = req.tenantId, e viene dal claim JWT verificato
}
