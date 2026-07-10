/** Forma di `req.customer` dopo il CustomerJwtGuard. */
export interface CustomerPrincipal {
  id: string;             // customerId
  establishmentId: string; // = req.tenantId
}
