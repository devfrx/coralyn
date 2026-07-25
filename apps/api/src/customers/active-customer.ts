import type { Customer, Prisma } from '@prisma/client';

/**
 * «Cliente attivo di questo tenant»: esiste (RLS pensa al tenant) e NON e' anonimizzato.
 *
 * Era una regola che ogni chiamante riscriveva a modo suo, e infatti su quattro percorsi di
 * scrittura la guardia esisteva in UNO solo — `transfer` (P1-004). Il caso peggiore era
 * `PATCH /customers/:id`: ripopolava i campi PII senza azzerare `anonymizedAt`, quindi
 * l'anonimizzazione (D-024) era reversibile per errore e il record tornava a contenere dati
 * personali restando invisibile a `list()` — PII fuori inventario.
 *
 * Funzione libera e non metodo di `CustomersService`: `CustomersModule` importa gia'
 * `BookingsModule`, quindi la dipendenza inversa sarebbe un ciclo di moduli. Prendendo il `tx`
 * come parametro non serve alcuna DI.
 *
 * Le due forme sono la stessa regola: filtro Prisma dove si carica, predicato dove la riga c'e'
 * gia' e il chiamante vuole distinguere «inesistente» da «anonimizzato».
 */
export function findActiveCustomer(tx: Prisma.TransactionClient, id: string): Promise<Customer | null> {
  return tx.customer.findFirst({ where: { id, anonymizedAt: null } });
}

export function isActiveCustomer(c: Pick<Customer, 'anonymizedAt'>): boolean {
  return c.anonymizedAt == null;
}
