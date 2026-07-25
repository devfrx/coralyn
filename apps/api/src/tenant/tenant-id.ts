/**
 * Id di stabilimento che ha attraversato un punto in cui QUALCUNO ha dichiarato da dove viene.
 *
 * Serve a rendere non compilabile la classe di errore misurata in AUD-026: `forTenant` accettava
 * una `string`, quindi `forTenant(input.establishmentId, …)` o `forTenant(booking.establishmentId, …)`
 * erano indistinguibili da `forTenant(this.tenant.require(), …)`. Il tenant sbagliato non era un bug
 * raro: era una riga che compilava e che nessuno dei 330 unit vedeva (25 call site mutati, 330/330
 * verdi).
 *
 * L'unico produttore legittimo in una richiesta autenticata è `TenantContext.require()`.
 */
export type TenantId = string & { readonly __tenantId: unique symbol };

/**
 * Dichiara che questo tenant NON viene da `TenantContext`, e che è deliberato.
 *
 * Ogni chiamata è un'affermazione da rivedere, non una conversione di comodo — per questo il
 * presidio [`tenant-id.spec.ts`](./tenant-id.spec.ts) conta i punti di produzione che la usano e
 * fallisce nominando il file se ne compare uno nuovo.
 */
export function tenantIdOf(id: string): TenantId {
  return id as TenantId;
}
