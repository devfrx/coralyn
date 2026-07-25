import { tenantIdOf, type TenantId } from '../tenant/tenant-id';

/**
 * Il tenant della richiesta simulata negli unit spec dei service tenant-scoped.
 * Un UUID vero e non `'t-1'`: alcuni service lo scrivono in colonne che il tipo dichiara uuid.
 */
export const TEST_TENANT: TenantId = tenantIdOf('11111111-1111-1111-1111-111111111111');

/**
 * Fake di `PrismaService.forTenant` che **asserisce** il tenant invece di scartarlo.
 *
 * L'idioma precedente era `forTenant: (_t, cb) => cb(tx)` in 7 spec: buttava via l'unico argomento
 * che porta la garanzia di isolamento, quindi un service che passava il tenant sbagliato restava
 * invisibile. Misurato (AUD-026): 25 call site mutati a un tenant letterale → **330/330 unit
 * verdi**.
 *
 * Da solo il tipo `TenantId` non basta: impedisce di passare una stringa qualunque, non di passare
 * un `TenantId` di un'ALTRA origine — per esempio quello di un'altra entità già brandizzata. È il
 * caso che questo fake copre, ed è il motivo per cui le due difese stanno insieme e non in
 * alternativa.
 *
 * Lancia invece di usare `expect`: un `expect` fallito dentro una callback può essere assorbito da
 * un `.rejects` generico del test, un `Error` con un messaggio che nomina i due tenant no.
 */
export function fakeTenantPrisma<TTx>(tx: TTx, expected: TenantId = TEST_TENANT) {
  return {
    forTenant: (tenantId: TenantId, fn: (tx: TTx) => unknown) => {
      if (tenantId !== expected) {
        throw new Error(
          `forTenant chiamata con il tenant "${tenantId}" invece di "${expected}": ` +
            'il service sta leggendo o scrivendo sotto un tenant che non è quello della richiesta.',
        );
      }
      return fn(tx);
    },
  };
}

/** Fake di `TenantContext`, gemello di `fakeTenantPrisma`. */
export function fakeTenantContext(tenantId: TenantId = TEST_TENANT) {
  return { require: () => tenantId };
}
