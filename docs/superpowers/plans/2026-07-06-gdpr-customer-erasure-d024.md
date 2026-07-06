# Cancellazione / anonimizzazione Cliente (GDPR, D-024) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare al lido l'azione "diritto all'oblio" sul cliente: DELETE reale se senza prenotazioni, anonimizzazione irreversibile se con storico, bloccata (409) se ci sono prenotazioni attive/future.

**Architecture:** Endpoint `DELETE /api/customers/:id` admin-only. Il service decide l'esito dentro `forTenant` (RLS). Anonimizzazione = scrub degli identificatori diretti + `anonymizedAt`/`anonymizedBy`. La lista clienti esclude gli anonimizzati; lo storico prenotazioni li mostra come "Cliente rimosso". FE adatta l'azione allo storico già caricato.

**Tech Stack:** NestJS + Prisma (Postgres, RLS FORCE), contracts TS condivisi, Vue 3 + TanStack Query + MSW (web-staff), Jest (api unit/e2e) + Vitest (web-staff).

## Global Constraints

- **Spec di riferimento:** [docs/superpowers/specs/2026-07-06-gdpr-customer-erasure-d024-design.md](../specs/2026-07-06-gdpr-customer-erasure-d024-design.md).
- **Baseline test da NON regredire:** ui-kit 70 · web-staff 219 · web-platform 16 · api unit 190 · api e2e 226 · typecheck pulito ovunque.
- **Placeholder anonimizzazione (verbatim):** `firstName='Cliente'`, `lastName='rimosso'`, `phone=null`, `email=null`, `notes=null`.
- **Messaggio 409 (verbatim):** `Il cliente ha prenotazioni attive o future: annullale o attendi la scadenza prima di rimuovere i dati.`
- **Permessi:** admin-only via `@Roles(Role.Admin)` (`Role` da `@coralyn/contracts`). `RolesGuard` è globale.
- **Data operativa:** `todayInRome()` + `toDbDate()` da [apps/api/src/common/dates.ts](../../../apps/api/src/common/dates.ts). "Attiva/futura" = `status='confirmed'` **e** `endDate >= toDbDate(todayInRome())`.
- **Confine di compilazione:** contracts + BE nello stesso commit (gli e2e ts-jest type-checkano l'intero progetto api). Dopo modifiche a `packages/contracts/src/index.ts`: `corepack pnpm --filter @coralyn/contracts build`.
- **Migrazioni:** hand-author + `migrate deploy` a **`coralyn_dev` E `coralyn_test`** (`localhost:5433`, `coralyn_app`/`coralyn_app`), poi `generate`. Mai `db push`/`migrate dev`.
- **Comandi test (root, corepack):** api unit `corepack pnpm --filter @coralyn/api test`; api e2e `corepack pnpm --filter @coralyn/api test:e2e`; web-staff `corepack pnpm --filter web-staff test`; typecheck `corepack pnpm --filter web-staff typecheck`.
- **Un commit per task.**

---

## Task 1: BE + contracts — endpoint DELETE (delete/anonymize/409)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Customer`, ~riga 32)
- Create: `apps/api/prisma/migrations/20260706120000_add_customer_anonymized_fields/migration.sql`
- Modify: `packages/contracts/src/index.ts` (`CustomerDTO` + nuovo `DeleteCustomerResult`)
- Modify: `apps/api/src/customers/customers.service.ts`
- Modify: `apps/api/src/customers/customers.controller.ts`
- Create: `apps/api/src/customers/customers.service.spec.ts`
- Create: `apps/api/test/customers.e2e-spec.ts`

**Interfaces:**
- Produces: `CustomersService.remove(id: string, actorUserId: string): Promise<DeleteCustomerResult>`; `DeleteCustomerResult = { outcome: 'deleted' | 'anonymized' }`; `CustomerDTO.anonymizedAt?: string`; rotta `DELETE /api/customers/:id` (admin-only).
- Consumes: `todayInRome()`, `toDbDate()` (dates.ts); `CurrentUser`/`AuthUser` (identity); `Roles`/`Role`; `PrismaService.forTenant`, `TenantContext.require`.

- [ ] **Step 1: Aggiungi i campi al modello `Customer` in `schema.prisma`**

Nel blocco `model Customer { … }` aggiungi due campi nullable dopo `notes`:

```prisma
  notes           String?
  anonymizedAt    DateTime?
  anonymizedBy    String?       @db.Uuid
```

- [ ] **Step 2: Hand-author la migrazione**

Crea `apps/api/prisma/migrations/20260706120000_add_customer_anonymized_fields/migration.sql`:

```sql
-- Diritto all'oblio (GDPR D-024): tracce di anonimizzazione sul Cliente.
ALTER TABLE "Customer" ADD COLUMN "anonymizedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "anonymizedBy" UUID;
```

- [ ] **Step 3: Applica la migrazione a dev + test e rigenera il client**

Run (dalla root):
```bash
DATABASE_URL='postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public' corepack pnpm --filter @coralyn/api exec prisma migrate deploy
DATABASE_URL='postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public' corepack pnpm --filter @coralyn/api exec prisma migrate deploy
corepack pnpm --filter @coralyn/api exec prisma generate
```
Expected: entrambe "All migrations have been successfully applied." (o "already applied"); generate "Generated Prisma Client".

- [ ] **Step 4: Estendi i contracts**

In `packages/contracts/src/index.ts`, aggiungi `anonymizedAt` a `CustomerDTO` (dopo `notes?`) e il nuovo tipo dopo l'interfaccia:

```ts
export interface CustomerDTO {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  notes?: string;
  anonymizedAt?: string;
}

/** Esito della cancellazione GDPR di un cliente. */
export type DeleteCustomerResult = { outcome: 'deleted' | 'anonymized' };
```

- [ ] **Step 5: Ricompila i contracts**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: EXIT 0 (aggiorna `dist/`, gitignored).

- [ ] **Step 6: Scrivi gli unit test del service (falliranno)**

Crea `apps/api/src/customers/customers.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';

const TENANT = 't-1';

function makeService(overrides: {
  customer?: Partial<{ findFirst: jest.Mock; delete: jest.Mock; update: jest.Mock; findMany: jest.Mock }>;
  booking?: Partial<{ count: jest.Mock }>;
} = {}) {
  const customer = { findFirst: jest.fn(), delete: jest.fn(), update: jest.fn(), findMany: jest.fn(), ...overrides.customer };
  const booking = { count: jest.fn(), ...overrides.booking };
  const tx = { customer, booking };
  const prisma = { forTenant: (_t: string, cb: (t: typeof tx) => unknown) => cb(tx) } as any;
  const tenant = { require: () => TENANT } as any;
  return { service: new CustomersService(prisma, tenant), customer, booking };
}

describe('CustomersService.remove', () => {
  it('404 se il cliente non è nel tenant', async () => {
    const { service, customer } = makeService();
    customer.findFirst.mockResolvedValue(null);
    await expect(service.remove('c-x', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('DELETE reale se il cliente non ha prenotazioni', async () => {
    const { service, customer, booking } = makeService();
    customer.findFirst.mockResolvedValue({ id: 'c-1' });
    booking.count.mockResolvedValueOnce(0); // conteggio totale
    const res = await service.remove('c-1', 'admin-1');
    expect(customer.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
    expect(customer.update).not.toHaveBeenCalled();
    expect(res).toEqual({ outcome: 'deleted' });
  });

  it('409 se ha una prenotazione attiva/futura', async () => {
    const { service, customer, booking } = makeService();
    customer.findFirst.mockResolvedValue({ id: 'c-1' });
    booking.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1); // totale, poi attive/future
    await expect(service.remove('c-1', 'admin-1')).rejects.toBeInstanceOf(ConflictException);
    expect(customer.delete).not.toHaveBeenCalled();
    expect(customer.update).not.toHaveBeenCalled();
  });

  it('anonimizza (scrub + anonymizedAt/By) se ha solo prenotazioni passate/cancellate', async () => {
    const { service, customer, booking } = makeService();
    customer.findFirst.mockResolvedValue({ id: 'c-1' });
    booking.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0); // totale, poi 0 attive
    const res = await service.remove('c-1', 'admin-1');
    expect(customer.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'c-1' },
      data: expect.objectContaining({
        firstName: 'Cliente', lastName: 'rimosso', phone: null, email: null, notes: null,
        anonymizedBy: 'admin-1',
      }),
    }));
    const arg = customer.update.mock.calls[0][0];
    expect(arg.data.anonymizedAt).toBeInstanceOf(Date);
    expect(res).toEqual({ outcome: 'anonymized' });
  });
});

describe('CustomersService.list', () => {
  it('esclude gli anonimizzati (where anonymizedAt null)', async () => {
    const { service, customer } = makeService();
    customer.findMany.mockResolvedValue([]);
    await service.list();
    expect(customer.findMany).toHaveBeenCalledWith({ where: { anonymizedAt: null } });
  });
});
```

- [ ] **Step 7: Esegui gli unit test → falliscono**

Run: `corepack pnpm --filter @coralyn/api test customers.service`
Expected: FAIL (`remove` non esiste; `list` non passa il `where`).

- [ ] **Step 8: Implementa `remove`, il filtro `list`, e `anonymizedAt` nel projection**

In `apps/api/src/customers/customers.service.ts`: aggiorna gli import, `toDTO`, `list`, e aggiungi `remove`.

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, type Customer } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { CustomerDTO, CreateCustomerInput, UpdateCustomerInput, DeleteCustomerResult } from '@coralyn/contracts';
import { todayInRome, toDbDate } from '../common/dates';
```

`toDTO` — aggiungi l'ultima riga:
```ts
      notes: c.notes ?? undefined,
      anonymizedAt: c.anonymizedAt?.toISOString() ?? undefined,
```

`list` — aggiungi il filtro:
```ts
    const rows = await this.prisma.forTenant(tenantId, (tx) =>
      tx.customer.findMany({ where: { anonymizedAt: null } }),
    );
```

Nuovo metodo (in fondo alla classe):
```ts
  /** Diritto all'oblio (GDPR D-024): 0 prenotazioni → delete; con storico passato → anonimizza;
   *  con prenotazione attiva/futura → 409. */
  async remove(id: string, actorUserId: string): Promise<DeleteCustomerResult> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.customer.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException('Cliente non trovato');

      const total = await tx.booking.count({ where: { customerId: id } });
      if (total === 0) {
        await tx.customer.delete({ where: { id } });
        return { outcome: 'deleted' as const };
      }

      const active = await tx.booking.count({
        where: { customerId: id, status: BookingStatus.confirmed, endDate: { gte: toDbDate(todayInRome()) } },
      });
      if (active > 0) {
        throw new ConflictException(
          'Il cliente ha prenotazioni attive o future: annullale o attendi la scadenza prima di rimuovere i dati.',
        );
      }

      await tx.customer.update({
        where: { id },
        data: {
          firstName: 'Cliente', lastName: 'rimosso', phone: null, email: null, notes: null,
          anonymizedAt: new Date(), anonymizedBy: actorUserId,
        },
      });
      return { outcome: 'anonymized' as const };
    });
  }
```

- [ ] **Step 9: Esegui gli unit test → passano**

Run: `corepack pnpm --filter @coralyn/api test customers.service`
Expected: PASS (5 test).

- [ ] **Step 10: Aggiungi la rotta DELETE admin-only al controller**

In `apps/api/src/customers/customers.controller.ts`: aggiorna gli import e aggiungi il metodo.

Import (aggiorna la riga `@nestjs/common` e aggiungi le identità):
```ts
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CustomerDTO, CustomerBookingDTO, DeleteCustomerResult, Role } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { CurrentUser } from '../identity/current-user.decorator';
import { AuthUser } from '../identity/auth-user';
```

Metodo (dopo `update`):
```ts
  @Delete(':id')
  @Roles(Role.Admin)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<DeleteCustomerResult> {
    return this.customers.remove(id, user.id);
  }
```

- [ ] **Step 11: Scrivi gli e2e (falliranno)**

Crea `apps/api/test/customers.e2e-spec.ts`. Segui il pattern degli e2e esistenti (bootstrap `AppModule`, login admin/staff per il token, helper di seed); ancora a [establishment-users.e2e-spec.ts](../../../apps/api/test/establishment-users.e2e-spec.ts) per login/guard e a [customer-bookings.e2e-spec.ts](../../../apps/api/test/customer-bookings.e2e-spec.ts) per seminare cliente + prenotazione. Casi da coprire:

```ts
// 1. staff (non-admin) → 403; anonimo → 401.
// 2. cliente senza prenotazioni → 200 { outcome: 'deleted' }; poi GET /customers non lo elenca.
// 3. cliente con SOLA prenotazione passata (endDate < oggi, confirmed) → 200 { outcome: 'anonymized' };
//    GET /customers non lo elenca; la sua prenotazione esiste ancora e il cliente risulta "Cliente rimosso".
// 4. cliente con prenotazione confirmed endDate >= oggi → 409 (messaggio verbatim).
// 5. cliente di un ALTRO tenant → 404 (isolamento).
```

Usa il messaggio 409 verbatim dai Global Constraints nelle asserzioni.

- [ ] **Step 12: Esegui gli e2e → passano; poi l'intera suite api + typecheck**

Run:
```bash
corepack pnpm --filter @coralyn/api test:e2e customers
corepack pnpm --filter @coralyn/api test
corepack pnpm --filter @coralyn/api test:e2e
```
Expected: i nuovi e2e PASS; suite unit **≥190** e e2e **≥226** (nessuna regressione, +i nuovi).

- [ ] **Step 13: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations packages/contracts/src/index.ts apps/api/src/customers apps/api/test/customers.e2e-spec.ts
git commit -m "feat(customers): DELETE cliente GDPR (D-024) — delete/anonymize condizionale + 409 su relazione attiva, admin-only"
```

---

## Task 2: FE web-staff — azione admin-only nella Scheda cliente

**Files:**
- Modify: `apps/web-staff/src/features/customers/useCustomers.ts`
- Modify: `apps/web-staff/src/features/customers/CustomerDetailView.vue`
- Modify: `apps/web-staff/src/mocks/server.ts`
- Modify: `apps/web-staff/src/features/customers/CustomerDetailView.spec.ts`

**Interfaces:**
- Consumes: `DELETE /api/customers/:id` → `DeleteCustomerResult` (Task 1); `useCustomerBookings` (storico già caricato); `pushToast` ([lib/toasts.ts](../../../apps/web-staff/src/lib/toasts.ts)); `ConfirmDialog` da `@coralyn/ui-kit`; `session.role === Role.Admin`.
- Produces: `useDeleteCustomer(id)` mutation (invalida la lista clienti + il dettaglio).

- [ ] **Step 1: Aggiungi l'handler MSW**

In `apps/web-staff/src/mocks/server.ts`, aggiungi un handler DELETE che risponde secondo il caso testato (default `deleted`):

```ts
http.delete('*/api/customers/:id', () => HttpResponse.json({ outcome: 'deleted' })),
```
(I test che vogliono `anonymized`/409 sovrascriveranno con `server.use(...)`.)

- [ ] **Step 2: Scrivi lo spec (fallirà)**

In `apps/web-staff/src/features/customers/CustomerDetailView.spec.ts` aggiungi i casi (mirroring del setup esistente del file — render con QueryClient + MSW + `vi.mock('vue-router')`):

```ts
// A. Admin + cliente senza prenotazioni → bottone "Elimina cliente" visibile;
//    click → ConfirmDialog → conferma → DELETE chiamato → router.push('/customers').
// B. Staff (session.role='staff') → nessun bottone di eliminazione (data-testid assente).
// C. Admin + storico con prenotazione attiva/futura → bottone disabilitato (attributo disabled) + hint.
// D. 409 dal server → pushToast con il messaggio d'errore (nessuna navigazione).
```

Asserisci sull'attributo `disabled` e sui `data-testid` introdotti allo Step 3.

- [ ] **Step 3: Implementa la mutation e l'azione nella view**

In `useCustomers.ts` aggiungi:
```ts
export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<DeleteCustomerResult>(`/customers/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); },
  });
}
```
(Import `DeleteCustomerResult` da `@coralyn/contracts`; riusa `apiFetch`/`useMutation`/`useQueryClient` come nelle altre mutation del file.)

In `CustomerDetailView.vue`:
- Calcola dallo storico già caricato (`useCustomerBookings`): `hasBookings`, `hasActiveOrFuture` (una `confirmed` con `endDate >= oggi`).
- `isAdmin = computed(() => session.role === Role.Admin)`.
- Label adattiva: `hasBookings ? 'Anonimizza dati personali (GDPR)' : 'Elimina cliente'`.
- Bottone `v-if="isAdmin"`, `:disabled="hasActiveOrFuture"`, `data-testid="delete-customer"`; hint (`data-testid="delete-customer-hint"`) quando `hasActiveOrFuture`.
- `ConfirmDialog` con copy adattiva (0 prenotazioni: "Il cliente verrà eliminato definitivamente." · con storico: "I dati personali verranno rimossi in modo irreversibile; lo storico prenotazioni resta in forma anonima.").
- `@confirm`: chiama `deleteCustomer.mutate(id)`; `onSuccess` → `pushToast(outcome === 'anonymized' ? 'Dati personali anonimizzati' : 'Cliente eliminato')` + `router.push('/customers')`; `onError` → `pushToast(<messaggio server>)`.
- Guardia: se `customer.anonymizedAt` è valorizzato, mostra un banner "Dati personali rimossi" e nascondi modifica/elimina.

- [ ] **Step 4: Esegui gli spec web-staff + typecheck**

Run:
```bash
corepack pnpm --filter web-staff test CustomerDetailView
corepack pnpm --filter web-staff test
corepack pnpm --filter web-staff typecheck
```
Expected: nuovi casi PASS; suite **≥219**; typecheck EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/customers apps/web-staff/src/mocks/server.ts
git commit -m "feat(web-staff): azione GDPR elimina/anonimizza cliente nella Scheda cliente (admin-only, adattiva)"
```

---

## Task 3: ADR-0043 + chiusura D-024 nel registro

**Files:**
- Create: `docs/architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md`
- Modify: `docs/architecture/deferred.md` (riga D-024)

- [ ] **Step 1: Scrivi ADR-0043**

Crea `docs/architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md` seguendo il formato degli ADR esistenti (Contesto / Decisione / Conseguenze). Contenuti (dalla spec §3):
- **Decisione:** erasure condizionale (0 prenotazioni → delete; con storico → anonimizzazione irreversibile scrubbando gli identificatori diretti, conservando la riga+id e lo storico); blocco su relazione attiva (409); admin-only; `anonymizedAt`/`anonymizedBy` per accountability.
- **Base giuridica retention:** Art. 2220 Cod. Civ. (scritture contabili 10 anni) + DPR 600/1973 + Art. 17(3)(b) GDPR; anonimizzazione genuina ex Recital 26 (nessuna mappatura al nome conservata; `Booking.extras` non usato → nessuna PII residua).
- **Conseguenze:** lo storico sopravvive come "Cliente rimosso"; consenso/informativa (Art. 13) resta deferito; audit completo di tenant = D-047.

- [ ] **Step 2: Aggiorna il registro D-024**

In `docs/architecture/deferred.md`, nella riga `D-024`, marca il **core come fatto** (analogo a come D-025 fu aggiornato): meccanismo di erasure realizzato (delete/anonimizzazione condizionale + blocco 409 + admin-only, [ADR-0043]); **resta deferito** solo il consenso/informativa alla creazione.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md docs/architecture/deferred.md
git commit -m "docs(adr): ADR-0043 erasure/retention cliente GDPR + chiusura core D-024"
```

---

## Note di esecuzione

- **Subagent-driven:** l'implementer fa TUTTO il lavoro del task (NON delega/annida subagent). Dopo ogni task: task-review a due stadi (spec ✅ + qualità) + fix se Critical/Important. Alla fine: review whole-branch (opus). Traccia in `.superpowers/sdd/progress.md`.
- **Rebuild contracts** dopo Task 1 se si riparte da checkout pulito.
- **Verifica LIVE** (opzionale, dopo i test): rebuild container (`docker compose --profile full up -d --build api web`), login admin, apri una Scheda cliente, prova elimina/anonimizza; il container stale = 404 sul nuovo endpoint.
- **Merge in `main`:** FF con ok ESPLICITO dell'utente, dopo la review finale.
