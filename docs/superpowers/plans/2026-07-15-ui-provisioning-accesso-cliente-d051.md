# UI operatore provisioning accesso cliente (D-051) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare all'operatore (admin) una UI in `web-staff` per generare/revocare l'accesso self-service del cliente e vederne lo stato, consegnando link + PIN + QR una volta sola.

**Architecture:** Backend già presente (`POST /bookings/:id/customer-access[/revoke]`); si aggiunge solo un `GET /bookings/:id/customer-access` che espone lo stato già calcolato dal service (tenant-scoped, no IDOR). In `web-staff`: 3 hook TanStack Query, una `CustomerAccessCard` (stato + Genera/Revoca) e un `CustomerAccessModal` (reveal una-volta con QR), cablati nella Scheda cliente. Additivo, nessuna migration.

**Tech Stack:** NestJS + Prisma (api) · Vue 3 + Pinia + TanStack Query + `@coralyn/ui-kit` (web-staff) · Vitest + MSW (test FE) · Jest + supertest (e2e api) · `qrcode` (nuova dip. FE).

## Global Constraints

- **Package manager:** SOLO `corepack pnpm`, MAI `npm` (corrompe node_modules) — [[coralyn-pnpm-not-npm]].
- **Nessuna migration:** slice puramente additiva (nessun cambio schema).
- **Sicurezza:** ogni accesso allo stato/provisioning risolve il `customerId` **dalla booking sotto RLS** (`prisma.forTenant`); mai per `customerId` grezzo (evita IDOR cross-tenant).
- **Admin-only:** provisioning/revoca sono `@Roles(Role.admin)`; lato FE le azioni sono gated su `isAdmin`.
- **Endpoint status contract:** `GET /api/bookings/:id/customer-access` → `CustomerAccessStatusDTO { state: 'none'|'issued'|'active'|'revoked'; lastActivatedAt: string | null }`.
- **Segreti una-volta:** `activationUrl`/`pin` non sono più recuperabili dopo il reveal; il QR codifica l'`activationUrl` (significativo solo con `CUSTOMER_APP_URL` configurato; in dev l'url è relativo).
- **Comandi test:** api e2e `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t '<pattern>'`; web-staff `corepack pnpm --filter @coralyn/web-staff test`. NON parallelizzare web `test` e api `test:e2e`.
- **Gate typecheck FE reale:** `corepack pnpm --filter @coralyn/web-staff run typecheck` (`vue-tsc -b`).

---

## File Structure

**Modificati (api):**
- `apps/api/src/customer-auth/customer-access.service.ts` — estrai `resolveCustomerId`; aggiungi `accessStatusForBooking`; rendi `accessStatus` privato.
- `apps/api/src/bookings/bookings.controller.ts` — aggiungi `GET :id/customer-access`.
- `apps/api/test/customer-access.e2e-spec.ts` — nuovo `describe('Customer access status (D-051)')`.

**Modificati (ui-kit):**
- `packages/ui-kit/src/icons/registry.ts` — aggiungi icone `copy`, `smartphone`.

**Creati (web-staff):**
- `apps/web-staff/src/features/customers/CustomerAccessCard.vue`
- `apps/web-staff/src/features/customers/CustomerAccessModal.vue`
- `apps/web-staff/src/features/customers/CustomerAccessCard.spec.ts`
- `apps/web-staff/src/features/customers/CustomerAccessModal.spec.ts`

**Modificati (web-staff):**
- `apps/web-staff/src/lib/queryKeys.ts` — chiave `customerAccess`.
- `apps/web-staff/src/features/customers/useCustomers.ts` — 3 hook.
- `apps/web-staff/src/features/customers/useCustomers.spec.ts` — probe per i 3 hook.
- `apps/web-staff/src/features/customers/CustomerDetailView.vue` — monta card + modale.
- `apps/web-staff/src/features/customers/CustomerDetailView.spec.ts` — presenza/assenza card.
- `apps/web-staff/package.json` — dip. `qrcode` + `@types/qrcode`.

**Docs (DoD):**
- `docs/architecture/deferred.md`, `docs/design/flows.md`, `docs/architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md`, `docs/design/mockups/web-staff-customer-access.html`.

---

## Task 1: Backend — `GET /bookings/:id/customer-access` (stato accesso, tenant-scoped)

**Files:**
- Modify: `apps/api/src/customer-auth/customer-access.service.ts`
- Modify: `apps/api/src/bookings/bookings.controller.ts`
- Test: `apps/api/test/customer-access.e2e-spec.ts`

**Interfaces:**
- Produces: `CustomerAccessService.accessStatusForBooking(bookingId: string): Promise<CustomerAccessStatusDTO>`; rotta `GET /api/bookings/:id/customer-access` (admin-only).
- Consumes: `CustomerAccessStatusDTO`, `CustomerAccessState` da `@coralyn/contracts` (già esistenti); helper e2e `provisionCustomerAccess`, `activateCustomer` (già esistenti).

- [ ] **Step 1: Scrivi i test e2e (RED)**

Aggiungi in fondo a `apps/api/test/customer-access.e2e-spec.ts`, **prima** della chiusura `});` del `describe` esterno (riga ~291), questo blocco. Riusa `s1`, `ids`, `adminToken`, `staffToken`, `bookingId2` già in scope; crea un cliente/booking fresco per lo stato `none` deterministico:

```ts
  describe('Customer access status (D-051)', () => {
    let freshBookingId: string;

    beforeAll(async () => {
      const c = await prisma.forTenant(s1, (tx) =>
        tx.customer.create({ data: { establishmentId: s1, firstName: 'Nuovo', lastName: 'Cliente' } }),
      );
      const b = await insertBookingWithCoverage(prisma, s1, {
        establishmentId: s1,
        customerId: c.id,
        umbrellaId: ids.u1,
        timeSlotId: ids.slotMorning,
        startDate: new Date('2026-07-11'),
        endDate: new Date('2026-07-11'),
      });
      freshBookingId = b.id;
    });

    it("stato 'none' prima di qualsiasi provisioning", async () => {
      const r = await request(app.getHttpServer())
        .get(`/api/bookings/${freshBookingId}/customer-access`)
        .set(...bearer(adminToken))
        .expect(200);
      expect(r.body).toEqual({ state: 'none', lastActivatedAt: null });
    });

    it("stato 'issued' dopo il provisioning", async () => {
      await provisionCustomerAccess(app, adminToken, freshBookingId);
      const r = await request(app.getHttpServer())
        .get(`/api/bookings/${freshBookingId}/customer-access`)
        .set(...bearer(adminToken))
        .expect(200);
      expect(r.body.state).toBe('issued');
      expect(r.body.lastActivatedAt).toBeNull();
    });

    it("stato 'active' dopo l'attivazione", async () => {
      const { enrollmentToken, pin } = await provisionCustomerAccess(app, adminToken, freshBookingId);
      await activateCustomer(app, enrollmentToken, pin);
      const r = await request(app.getHttpServer())
        .get(`/api/bookings/${freshBookingId}/customer-access`)
        .set(...bearer(adminToken))
        .expect(200);
      expect(r.body.state).toBe('active');
      expect(r.body.lastActivatedAt).not.toBeNull();
    });

    it("stato 'revoked' dopo la revoca", async () => {
      await provisionCustomerAccess(app, adminToken, freshBookingId);
      await request(app.getHttpServer())
        .post(`/api/bookings/${freshBookingId}/customer-access/revoke`)
        .set(...bearer(adminToken))
        .expect(204);
      const r = await request(app.getHttpServer())
        .get(`/api/bookings/${freshBookingId}/customer-access`)
        .set(...bearer(adminToken))
        .expect(200);
      expect(r.body.state).toBe('revoked');
    });

    it('admin del tenant A su booking del tenant B -> 404 (nessun leak cross-tenant)', async () => {
      await request(app.getHttpServer())
        .get(`/api/bookings/${bookingId2}/customer-access`)
        .set(...bearer(adminToken))
        .expect(404);
    });

    it('non-admin (staff) -> 403', async () => {
      await request(app.getHttpServer())
        .get(`/api/bookings/${freshBookingId}/customer-access`)
        .set(...bearer(staffToken))
        .expect(403);
    });
  });
```

- [ ] **Step 2: Esegui i test (verifica RED)**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer access status'`
Expected: FAIL — la rotta `GET` non esiste ancora → 404 su tutti (anche dove ci si aspetta 200/403).

- [ ] **Step 3: Refactor DRY nel service + nuovo metodo stato**

In `apps/api/src/customer-auth/customer-access.service.ts`: (a) aggiungi il metodo privato `resolveCustomerId`; (b) sostituisci il blocco di risoluzione duplicato in `provisionAccess` e `revokeAccess`; (c) aggiungi `accessStatusForBooking`; (d) rendi `accessStatus` **privato** (unico chiamante ora è `accessStatusForBooking`).

Aggiungi il metodo privato (es. sopra `provisionAccess`):

```ts
  /** Risolve il customerId titolare della booking, tenant-scoped (RLS): 404 se la booking
   *  non è nel tenant corrente o non esiste. Unico punto di risoluzione booking→customer. */
  private async resolveCustomerId(bookingId: string): Promise<string> {
    const tenantId = this.tenant.require();
    const booking = await this.prisma.forTenant(tenantId, async (tx) => {
      return tx.booking.findFirst({ where: { id: bookingId }, select: { customerId: true } });
    });
    if (!booking) throw new NotFoundException('Prenotazione non trovata');
    return booking.customerId;
  }
```

In `provisionAccess`, sostituisci le righe:

```ts
    const tenantId = this.tenant.require();
    // 1. Risolvi il customer titolare, tenant-scoped (RLS).
    const booking = await this.prisma.forTenant(tenantId, async (tx) => {
      return tx.booking.findFirst({ where: { id: bookingId }, select: { customerId: true } });
    });
    if (!booking) throw new NotFoundException('Prenotazione non trovata');
```

con:

```ts
    const tenantId = this.tenant.require();
    const customerId = await this.resolveCustomerId(bookingId);
```

e nel resto del metodo usa `customerId` al posto di `booking.customerId` (righe `updateMany where customerId`, `customerSession`, `create data.customerId`).

In `revokeAccess`, sostituisci le righe:

```ts
    const tenantId = this.tenant.require();
    const booking = await this.prisma.forTenant(tenantId, async (tx) => {
      return tx.booking.findFirst({ where: { id: bookingId }, select: { customerId: true } });
    });
    if (!booking) throw new NotFoundException('Prenotazione non trovata');
    const now = new Date();
```

con:

```ts
    const customerId = await this.resolveCustomerId(bookingId);
    const now = new Date();
```

e usa `customerId` al posto di `booking.customerId` nelle due `updateMany`.

Cambia la firma di `accessStatus` da `async accessStatus(` a `private async accessStatus(` e aggiungi sopra `accessStatus` il nuovo metodo pubblico:

```ts
  /** Stato accesso per una booking (Scheda cliente). Risolve il customer tenant-scoped
   *  (nessun IDOR cross-tenant), poi delega allo stato per-cliente. admin-only (controller). */
  async accessStatusForBooking(bookingId: string): Promise<CustomerAccessStatusDTO> {
    const customerId = await this.resolveCustomerId(bookingId);
    return this.accessStatus(customerId);
  }
```

- [ ] **Step 4: Aggiungi la rotta nel controller**

In `apps/api/src/bookings/bookings.controller.ts` aggiungi l'import del tipo (nella riga di import da `@coralyn/contracts`, dove sono già gli altri DTO):

```ts
import type { CustomerAccessStatusDTO } from '@coralyn/contracts';
```

(se l'import `@coralyn/contracts` è già presente come `import type { ... } from '@coralyn/contracts'`, aggiungi solo `CustomerAccessStatusDTO` alla lista.)

Aggiungi la rotta accanto a `provisionCustomerAccess` (prima di `@Post(':id/customer-access')`):

```ts
  @Get(':id/customer-access')
  @Roles(Role.Admin)
  customerAccessStatus(@Param('id') id: string): Promise<CustomerAccessStatusDTO> {
    return this.customerAccess.accessStatusForBooking(id);
  }
```

- [ ] **Step 5: Esegui i test (verifica GREEN)**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer access status'`
Expected: PASS (6 test). Poi verifica non-regressione dello spec intero:
Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer access'`
Expected: PASS (tutti i test D-035 S3 + D-051).

- [ ] **Step 6: Typecheck api**

Run: `corepack pnpm --filter @coralyn/api exec tsc -p tsconfig.json --noEmit`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/customer-auth/customer-access.service.ts apps/api/src/bookings/bookings.controller.ts apps/api/test/customer-access.e2e-spec.ts
git commit -m "feat(api): GET /bookings/:id/customer-access (stato accesso cliente, tenant-scoped) + refactor DRY resolveCustomerId [D-051]"
```

---

## Task 2: Hook FE per stato/provision/revoke

**Files:**
- Modify: `apps/web-staff/src/lib/queryKeys.ts`
- Modify: `apps/web-staff/src/features/customers/useCustomers.ts`
- Test: `apps/web-staff/src/features/customers/useCustomers.spec.ts`

**Interfaces:**
- Produces: `useCustomerAccessStatus(bookingId: string)` (query → `CustomerAccessStatusDTO`); `useProvisionCustomerAccess(bookingId: string)` (mutation, `mutateAsync()` → `CustomerProvisionResponse`); `useRevokeCustomerAccess(bookingId: string)` (mutation `mutate()` → void); `queryKeys.customerAccess(tenantId, bookingId)`.
- Consumes: `queryResource`/`mutationResource` da `@/lib/useQueryResource`; `apiFetch` da `@/lib/http`.

- [ ] **Step 1: Scrivi i test degli hook (RED)**

Aggiungi in fondo a `apps/web-staff/src/features/customers/useCustomers.spec.ts`. Estendi l'import degli hook alla riga 7 aggiungendo i tre nuovi nomi, e aggiungi in cima ai probe:

```ts
const AccessStatusProbe = defineComponent({
  setup() {
    const q = useCustomerAccessStatus('b1');
    return () => h('div', q.data.value ? q.data.value.state : 'loading');
  },
});

const ProvisionProbe = defineComponent({
  setup() {
    const m = useProvisionCustomerAccess('b1');
    return () => h('button', { onClick: () => m.mutate() }, 'provision');
  },
});

const RevokeProbe = defineComponent({
  setup() {
    const m = useRevokeCustomerAccess('b1');
    return () => h('button', { onClick: () => m.mutate() }, 'revoke');
  },
});
```

e i describe:

```ts
describe('useCustomerAccessStatus', () => {
  it('legge lo stato accesso per bookingId dal mock', async () => {
    server.use(
      http.get('/api/bookings/:id/customer-access', ({ params }) => {
        expect(params.id).toBe('b1');
        return HttpResponse.json({ state: 'active', lastActivatedAt: '2026-07-01T09:00:00.000Z' });
      }),
    );
    const w = mountApp(AccessStatusProbe);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(w.text()).toContain('active');
  });
});

describe('useProvisionCustomerAccess', () => {
  it('POSTa /bookings/:id/customer-access', async () => {
    let called = false;
    server.use(
      http.post('/api/bookings/:id/customer-access', ({ params }) => {
        called = true;
        expect(params.id).toBe('b1');
        return HttpResponse.json({ activationUrl: '/attiva?token=x', pin: '123456', expiresAt: '2026-08-01T00:00:00.000Z' });
      }),
    );
    const w = mountApp(ProvisionProbe);
    await w.find('button').trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(called).toBe(true);
  });
});

describe('useRevokeCustomerAccess', () => {
  it('POSTa /bookings/:id/customer-access/revoke', async () => {
    let called = false;
    server.use(
      http.post('/api/bookings/:id/customer-access/revoke', ({ params }) => {
        called = true;
        expect(params.id).toBe('b1');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const w = mountApp(RevokeProbe);
    await w.find('button').trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(called).toBe(true);
  });
});
```

- [ ] **Step 2: Esegui (verifica RED)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- useCustomers`
Expected: FAIL — `useCustomerAccessStatus`/`useProvisionCustomerAccess`/`useRevokeCustomerAccess` non esportati.

- [ ] **Step 3: Aggiungi la query key**

In `apps/web-staff/src/lib/queryKeys.ts`, dentro l'oggetto `queryKeys`, aggiungi dopo la riga `cededSubscriptions`:

```ts
  customerAccess: (tenantId: string, bookingId: string) => ['customer-access', tenantId, bookingId] as const,
```

- [ ] **Step 4: Implementa i 3 hook**

In `apps/web-staff/src/features/customers/useCustomers.ts`: estendi l'import dei tipi (riga 1) aggiungendo `CustomerAccessStatusDTO, CustomerProvisionResponse`, e aggiungi in fondo al file:

```ts
/** Stato accesso cliente per la Scheda (D-051). Chiave per bookingId rappresentativo del cliente. */
export function useCustomerAccessStatus(bookingId: string) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.customerAccess(session.establishmentId, bookingId),
    queryFn: () => apiFetch<CustomerAccessStatusDTO>(`/bookings/${bookingId}/customer-access`),
  });
}

/** (Ri)genera l'accesso cliente (D-051, admin-only). `quiet`: il chiamante mostra i segreti nel modale;
 *  un eventuale errore affiora via toast solo se non quiet — qui NON quiet così un fallimento è visibile. */
export function useProvisionCustomerAccess(bookingId: string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: () =>
      apiFetch<CustomerProvisionResponse>(`/bookings/${bookingId}/customer-access`, { method: 'POST' }),
    invalidates: () => [queryKeys.customerAccess(session.establishmentId, bookingId)],
  });
}

/** Revoca l'accesso cliente (D-051, admin-only). Invalida lo stato accesso. */
export function useRevokeCustomerAccess(bookingId: string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: () =>
      apiFetch<void>(`/bookings/${bookingId}/customer-access/revoke`, { method: 'POST' }),
    invalidates: () => [queryKeys.customerAccess(session.establishmentId, bookingId)],
  });
}
```

- [ ] **Step 5: Esegui (verifica GREEN)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- useCustomers`
Expected: PASS (esistenti + 3 nuovi).

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/lib/queryKeys.ts apps/web-staff/src/features/customers/useCustomers.ts apps/web-staff/src/features/customers/useCustomers.spec.ts
git commit -m "feat(web-staff): hook stato/provision/revoke accesso cliente [D-051]"
```

---

## Task 3: `CustomerAccessModal` (reveal una-volta con QR) + dip. `qrcode` + icone

**Files:**
- Modify: `packages/ui-kit/src/icons/registry.ts`
- Modify: `apps/web-staff/package.json` (via pnpm add)
- Create: `apps/web-staff/src/features/customers/CustomerAccessModal.vue`
- Test: `apps/web-staff/src/features/customers/CustomerAccessModal.spec.ts`

**Interfaces:**
- Produces: componente `CustomerAccessModal` con `v-model:open` (boolean) e prop `result: CustomerProvisionResponse | null`.
- Consumes: `Modal`, `Button`, `Icon` da `@coralyn/ui-kit`; `QRCode.toDataURL` da `qrcode`.

- [ ] **Step 1: Installa la dipendenza `qrcode`**

Run:
```bash
corepack pnpm --filter @coralyn/web-staff add qrcode
corepack pnpm --filter @coralyn/web-staff add -D @types/qrcode
```
Expected: `qrcode` in `dependencies` e `@types/qrcode` in `devDependencies` di `apps/web-staff/package.json`.

- [ ] **Step 2: Aggiungi le icone `copy` e `smartphone` alla registry**

In `packages/ui-kit/src/icons/registry.ts` aggiungi gli import (accanto agli altri `import Icon… from '~icons/lucide/…'`):

```ts
import IconCopy from '~icons/lucide/copy';
import IconSmartphone from '~icons/lucide/smartphone';
```

e nelle voci dell'oggetto `icons` aggiungi:

```ts
  copy: IconCopy, smartphone: IconSmartphone,
```

- [ ] **Step 3: Scrivi il test del modale (RED)**

Create `apps/web-staff/src/features/customers/CustomerAccessModal.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import type { CustomerProvisionResponse } from '@coralyn/contracts';
import CustomerAccessModal from './CustomerAccessModal.vue';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QRMOCK') },
}));

const result: CustomerProvisionResponse = {
  activationUrl: 'https://app.coralyn.example/attiva?token=abc123',
  pin: '482913',
  expiresAt: '2026-08-01T10:00:00.000Z',
};

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe('CustomerAccessModal', () => {
  it('mostra link, PIN e QR quando aperto con result', async () => {
    const w = mountApp(CustomerAccessModal, { props: { open: true, result } });
    await flushPromises();
    expect(w.find('[data-testid="access-link"]').text()).toContain('token=abc123');
    expect(w.find('[data-testid="access-pin"]').text()).toContain('482913');
    expect(w.find('[data-testid="access-qr"]').attributes('src')).toBe('data:image/png;base64,QRMOCK');
  });

  it('copia il link negli appunti al click', async () => {
    const w = mountApp(CustomerAccessModal, { props: { open: true, result } });
    await flushPromises();
    await w.find('[data-testid="copy-link"]').trigger('click');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://app.coralyn.example/attiva?token=abc123');
  });

  it('copia il PIN negli appunti al click', async () => {
    const w = mountApp(CustomerAccessModal, { props: { open: true, result } });
    await flushPromises();
    await w.find('[data-testid="copy-pin"]').trigger('click');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('482913');
  });
});
```

- [ ] **Step 4: Esegui (verifica RED)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- CustomerAccessModal`
Expected: FAIL — file `CustomerAccessModal.vue` inesistente.

- [ ] **Step 5: Implementa il modale**

Create `apps/web-staff/src/features/customers/CustomerAccessModal.vue`:

```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import QRCode from 'qrcode';
import { Modal, Button, Icon } from '@coralyn/ui-kit';
import type { CustomerProvisionResponse } from '@coralyn/contracts';

const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{ result: CustomerProvisionResponse | null }>();

const qrDataUrl = ref('');
const copied = ref<'link' | 'pin' | null>(null);

const EXPIRES_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
function fmtExpires(iso: string | undefined): string {
  return iso ? EXPIRES_FMT.format(new Date(iso)) : '—';
}

watch(
  () => props.result?.activationUrl,
  async (url) => {
    qrDataUrl.value = url ? await QRCode.toDataURL(url, { margin: 1, width: 220 }) : '';
  },
  { immediate: true },
);

async function copy(kind: 'link' | 'pin', value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
  copied.value = kind;
  setTimeout(() => { if (copied.value === kind) copied.value = null; }, 1500);
}
</script>

<template>
  <Modal v-model:open="open" title="Accesso cliente generato" eyebrow="Consegna una volta sola">
    <div v-if="result" class="flex flex-col gap-4">
      <p class="text-sm text-[var(--color-text)]">
        Consegna questi dati al cliente <strong>ora</strong>: non saranno più recuperabili. Se li perdi, genera un nuovo accesso.
      </p>
      <div class="flex justify-center">
        <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR di attivazione" data-testid="access-qr" width="220" height="220" class="rounded-[var(--radius-md)] border border-[var(--color-border)]" />
      </div>
      <div class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-raised)] p-4">
        <div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Link di attivazione</div>
        <div class="flex items-center gap-2">
          <div data-testid="access-link" class="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text)]">{{ result.activationUrl }}</div>
          <Button variant="secondary" size="sm" data-testid="copy-link" @click="copy('link', result.activationUrl)"><Icon name="copy" :size="15" />{{ copied === 'link' ? 'Copiato' : 'Copia' }}</Button>
        </div>
        <div class="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">PIN</div>
        <div class="flex items-center gap-2">
          <div data-testid="access-pin" class="flex-1 text-lg font-bold tabular-nums tracking-[.2em] text-[var(--color-text)]">{{ result.pin }}</div>
          <Button variant="secondary" size="sm" data-testid="copy-pin" @click="copy('pin', result.pin)"><Icon name="copy" :size="15" />{{ copied === 'pin' ? 'Copiato' : 'Copia' }}</Button>
        </div>
        <div class="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Scade il</div>
        <div data-testid="access-expires" class="text-sm font-semibold tabular-nums text-[var(--color-text)]">{{ fmtExpires(result.expiresAt) }}</div>
      </div>
      <p class="text-xs text-[var(--color-text-muted)]">Il QR e il link funzionano solo se l'app cliente è configurata (in sviluppo il link è relativo).</p>
    </div>
    <template #footer>
      <div class="flex justify-end">
        <Button data-testid="access-done" @click="open = false">Fatto</Button>
      </div>
    </template>
  </Modal>
</template>
```

- [ ] **Step 6: Esegui (verifica GREEN)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- CustomerAccessModal`
Expected: PASS (3 test).

- [ ] **Step 7: Commit**

```bash
git add packages/ui-kit/src/icons/registry.ts apps/web-staff/package.json apps/web-staff/src/features/customers/CustomerAccessModal.vue apps/web-staff/src/features/customers/CustomerAccessModal.spec.ts pnpm-lock.yaml
git commit -m "feat(web-staff): CustomerAccessModal reveal QR+link+PIN una-volta + dip qrcode + icone [D-051]"
```

---

## Task 4: `CustomerAccessCard` (stato + Genera/Revoca)

**Files:**
- Create: `apps/web-staff/src/features/customers/CustomerAccessCard.vue`
- Test: `apps/web-staff/src/features/customers/CustomerAccessCard.spec.ts`

**Interfaces:**
- Produces: componente `CustomerAccessCard` con prop `bookingId: string`, `isAdmin: boolean`; emette `provisioned: [CustomerProvisionResponse]`.
- Consumes: `useCustomerAccessStatus`, `useProvisionCustomerAccess`, `useRevokeCustomerAccess` (Task 2); `SectionCard`, `Badge`, `Button`, `Icon`, `ConfirmDialog` da `@coralyn/ui-kit`.

- [ ] **Step 1: Scrivi il test della card (RED)**

Create `apps/web-staff/src/features/customers/CustomerAccessCard.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { http, HttpResponse } from 'msw';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import CustomerAccessCard from './CustomerAccessCard.vue';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QRMOCK') } }));

function mockStatus(state: string, lastActivatedAt: string | null = null) {
  server.use(
    http.get('/api/bookings/:id/customer-access', () => HttpResponse.json({ state, lastActivatedAt })),
  );
}

async function settle() {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
}

describe('CustomerAccessCard', () => {
  it("stato 'none' → badge «Mai generato», bottone «Genera accesso», niente «Revoca»", async () => {
    mockStatus('none');
    const w = mountApp(CustomerAccessCard, { props: { bookingId: 'b1', isAdmin: true } });
    await settle();
    expect(w.find('[data-testid="access-state"]').text()).toContain('Mai generato');
    expect(w.text()).toContain('Genera accesso');
    expect(w.find('[data-testid="access-revoke"]').exists()).toBe(false);
  });

  it("stato 'active' → badge «Attivo», bottone «Rigenera» + «Revoca»", async () => {
    mockStatus('active', '2026-07-01T09:00:00.000Z');
    const w = mountApp(CustomerAccessCard, { props: { bookingId: 'b1', isAdmin: true } });
    await settle();
    expect(w.find('[data-testid="access-state"]').text()).toContain('Attivo');
    expect(w.text()).toContain('Rigenera');
    expect(w.find('[data-testid="access-revoke"]').exists()).toBe(true);
  });

  it('non-admin → nessun bottone azione (solo stato)', async () => {
    mockStatus('active', '2026-07-01T09:00:00.000Z');
    const w = mountApp(CustomerAccessCard, { props: { bookingId: 'b1', isAdmin: false } });
    await settle();
    expect(w.find('[data-testid="access-generate"]').exists()).toBe(false);
    expect(w.find('[data-testid="access-revoke"]').exists()).toBe(false);
    expect(w.find('[data-testid="access-state"]').text()).toContain('Attivo');
  });

  it('«Genera accesso» emette provisioned con la response', async () => {
    mockStatus('none');
    server.use(
      http.post('/api/bookings/:id/customer-access', () =>
        HttpResponse.json({ activationUrl: '/attiva?token=z', pin: '111222', expiresAt: '2026-08-01T00:00:00.000Z' }),
      ),
    );
    const w = mountApp(CustomerAccessCard, { props: { bookingId: 'b1', isAdmin: true } });
    await settle();
    await w.find('[data-testid="access-generate"]').trigger('click');
    await settle();
    expect(w.emitted('provisioned')?.[0]?.[0]).toMatchObject({ pin: '111222' });
  });
});
```

- [ ] **Step 2: Esegui (verifica RED)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- CustomerAccessCard`
Expected: FAIL — `CustomerAccessCard.vue` inesistente.

- [ ] **Step 3: Implementa la card**

Create `apps/web-staff/src/features/customers/CustomerAccessCard.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { SectionCard, Badge, Button, Icon, ConfirmDialog } from '@coralyn/ui-kit';
import type { CustomerAccessState, CustomerProvisionResponse } from '@coralyn/contracts';
import { useCustomerAccessStatus, useProvisionCustomerAccess, useRevokeCustomerAccess } from './useCustomers';

const props = defineProps<{ bookingId: string; isAdmin: boolean }>();
const emit = defineEmits<{ provisioned: [CustomerProvisionResponse] }>();

const { data: status } = useCustomerAccessStatus(props.bookingId);
const provision = useProvisionCustomerAccess(props.bookingId);
const revoke = useRevokeCustomerAccess(props.bookingId);

const state = computed<CustomerAccessState>(() => status.value?.state ?? 'none');
const hasAccess = computed(() => state.value === 'issued' || state.value === 'active');

const STATE_META: Record<CustomerAccessState, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' }> = {
  none: { label: 'Mai generato', tone: 'neutral' },
  issued: { label: 'Emesso, in attesa di attivazione', tone: 'warning' },
  active: { label: 'Attivo', tone: 'success' },
  revoked: { label: 'Revocato', tone: 'danger' },
};
const meta = computed(() => STATE_META[state.value]);

const ACT_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Rome' });
const lastActivated = computed(() =>
  status.value?.lastActivatedAt ? ACT_FMT.format(new Date(status.value.lastActivatedAt)) : null,
);

async function onGenerate(): Promise<void> {
  const res = await provision.mutateAsync();
  emit('provisioned', res);
}

const confirmRevoke = ref(false);
function onRevoke(): void {
  revoke.mutate();
  confirmRevoke.value = false;
}
</script>

<template>
  <SectionCard title="Accesso cliente" icon="smartphone">
    <div class="flex items-center justify-between gap-3">
      <div>
        <Badge :tone="meta.tone" data-testid="access-state">{{ meta.label }}</Badge>
        <div v-if="lastActivated" class="mt-1.5 text-xs text-[var(--color-text-muted)]">Ultima attivazione: {{ lastActivated }}</div>
      </div>
      <div v-if="isAdmin" class="flex shrink-0 gap-2">
        <Button variant="secondary" data-testid="access-generate" :loading="provision.isPending.value" @click="onGenerate">
          <Icon name="smartphone" :size="15" />{{ hasAccess ? 'Rigenera' : 'Genera accesso' }}
        </Button>
        <Button v-if="hasAccess" variant="danger" data-testid="access-revoke" @click="confirmRevoke = true"><Icon name="x" :size="15" />Revoca</Button>
      </div>
    </div>
    <p v-if="isAdmin && hasAccess" class="mt-2 text-xs text-[var(--color-text-muted)]">
      «Rigenera» invalida il link e il PIN precedenti e disconnette il cliente.
    </p>
    <ConfirmDialog
      v-model:open="confirmRevoke"
      title="Revocare l'accesso del cliente?"
      description="Il cliente non potrà più accedere. Potrai generare un nuovo accesso in seguito."
      confirm-label="Revoca"
      tone="danger"
      @confirm="onRevoke"
    />
  </SectionCard>
</template>
```

- [ ] **Step 4: Esegui (verifica GREEN)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- CustomerAccessCard`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/customers/CustomerAccessCard.vue apps/web-staff/src/features/customers/CustomerAccessCard.spec.ts
git commit -m "feat(web-staff): CustomerAccessCard stato + Genera/Revoca accesso cliente [D-051]"
```

---

## Task 5: Cablaggio nella Scheda cliente (`CustomerDetailView`)

**Files:**
- Modify: `apps/web-staff/src/features/customers/CustomerDetailView.vue`
- Test: `apps/web-staff/src/features/customers/CustomerDetailView.spec.ts`

**Interfaces:**
- Consumes: `CustomerAccessCard`, `CustomerAccessModal` (Task 3/4); `CustomerProvisionResponse`.
- Produces: la Scheda cliente monta la card «Accesso cliente» quando esiste ≥1 abbonamento, e apre il modale sul successo del provisioning.

- [ ] **Step 1: Scrivi il test di integrazione (RED)**

In `apps/web-staff/src/features/customers/CustomerDetailView.spec.ts`, in cima al file aggiungi il mock di `qrcode` (il modale lo importa) accanto agli altri `vi.mock`:

```ts
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QRMOCK') } }));
```

Aggiungi un `describe` con due casi. Usa lo stesso stile di mount degli altri test del file (`mountDetail` esistente + MSW). Se il seed MSW del cliente di default (`c-1`) non ha abbonamenti, definisci gli handler inline:

```ts
describe('CustomerDetailView — accesso cliente (D-051)', () => {
  it('con abbonamento → monta la card «Accesso cliente»', async () => {
    server.use(
      http.get('/api/customers/:id/bookings', () =>
        HttpResponse.json([
          { id: 'sub-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-05-01', endDate: '2030-09-30', type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800, umbrellaLabel: 'A12', seasonName: 'Estate', seniority: 2 },
        ]),
      ),
      http.get('/api/bookings/:id/customer-access', () => HttpResponse.json({ state: 'none', lastActivatedAt: null })),
    );
    const w = mountDetail('c-1');
    await settle();
    expect(w.text()).toContain('Accesso cliente');
    expect(w.find('[data-testid="access-state"]').exists()).toBe(true);
  });

  it('senza abbonamenti → nessuna card «Accesso cliente»', async () => {
    server.use(http.get('/api/customers/:id/bookings', () => HttpResponse.json([])));
    const w = mountDetail('c-1');
    await settle();
    expect(w.find('[data-testid="access-state"]').exists()).toBe(false);
  });
});
```

> Nota per l'implementer: allinea `mountDetail`/`settle` a quelli già presenti nel file (righe iniziali). Se il seed di default ha già un abbonamento per `c-1`, il primo handler `customers/:id/bookings` è ridondante ma innocuo; il secondo handler (`customer-access`) è necessario per non far fallire la query di stato.

- [ ] **Step 2: Esegui (verifica RED)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- CustomerDetailView`
Expected: FAIL — nessuna card «Accesso cliente» montata.

- [ ] **Step 3: Cabla card + modale nella view**

In `apps/web-staff/src/features/customers/CustomerDetailView.vue`:

Import (dopo gli altri import di componenti, riga ~18):

```ts
import CustomerAccessCard from './CustomerAccessCard.vue';
import CustomerAccessModal from './CustomerAccessModal.vue';
```

Estendi l'import dei tipi (riga 19) aggiungendo `CustomerProvisionResponse`:

```ts
import type { CustomerBookingDTO, SuspensionDTO, CustomerProvisionResponse } from '@coralyn/contracts';
```

Aggiungi nello script (dopo `onCancelAbsence`, riga ~69):

```ts
// D-051: l'accesso cliente è per-cliente ma gli endpoint prendono un bookingId; usiamo il primo
// abbonamento come id rappresentativo (qualunque booking del cliente risolve lo stesso customer,
// la rotazione è unica). Senza abbonamento l'app cliente sarebbe vuota → card assente.
const accessBookingId = computed<string | null>(() => {
  const sub = (bookings.value ?? []).find((b) => b.type === 'subscription');
  return sub?.id ?? null;
});
const accessModalOpen = ref(false);
const accessResult = ref<CustomerProvisionResponse | null>(null);
function onProvisioned(res: CustomerProvisionResponse): void {
  accessResult.value = res;
  accessModalOpen.value = true;
}
```

Nel template, dentro `<div class="flex flex-col gap-3.5">` (riga ~152), aggiungi la card come primo figlio (sopra `CustomerSubscriptionsCard`):

```html
        <CustomerAccessCard v-if="accessBookingId" :booking-id="accessBookingId" :is-admin="isAdmin" @provisioned="onProvisioned" />
```

E accanto agli altri modali (dopo `<AbsenceReleaseModal … />`, riga ~171):

```html
      <CustomerAccessModal v-model:open="accessModalOpen" :result="accessResult" />
```

- [ ] **Step 4: Esegui (verifica GREEN)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- CustomerDetailView`
Expected: PASS.

- [ ] **Step 5: Typecheck FE + suite completa web-staff**

Run: `corepack pnpm --filter @coralyn/web-staff run typecheck`
Expected: nessun errore (`vue-tsc -b`).
Run: `corepack pnpm --filter @coralyn/web-staff test`
Expected: PASS (tutta la suite, incluse ui-kit specs).

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/customers/CustomerDetailView.vue apps/web-staff/src/features/customers/CustomerDetailView.spec.ts
git commit -m "feat(web-staff): monta card + modale accesso cliente nella Scheda cliente [D-051]"
```

---

## Task 6: Verifica LIVE su Docker

**Files:** nessuno (verifica manuale guidata).

- [ ] **Step 1: Avvia lo stack**

Run: `docker compose --profile full up -d --build`
Expected: web-staff su :8080, api :3000, db :5433, Mailpit :8025 attivi.

- [ ] **Step 2: Verifica il flusso operatore**

Login web-staff (:8080) come admin → Clienti → cliente con abbonamento (dal seed dev). Verifica: card «Accesso cliente» con stato «Mai generato» → click «Genera accesso» → modale con QR + link + PIN + scadenza; «Copia» funziona. Chiudi, ricarica: stato «Emesso, in attesa di attivazione», bottoni «Rigenera» + «Revoca». Click «Revoca» → conferma → stato «Revocato».

- [ ] **Step 3: (opzionale) verifica attivazione end-to-end**

Con `CUSTOMER_APP_URL` configurato, apri il link generato in web-customer (:8082), attiva con il PIN, poi in web-staff ricarica la Scheda: stato «Attivo» con «Ultima attivazione».

- [ ] **Step 4: Ferma lo stack**

Run: `docker compose --profile full down`

---

## Task 7: Docs DoD (ADR-0009) + mockup

**Files:**
- Modify: `docs/architecture/deferred.md`
- Modify: `docs/design/flows.md`
- Modify: `docs/architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md`
- Create: `docs/design/mockups/web-staff-customer-access.html`

- [ ] **Step 1: `deferred.md` — D-051 → Risolta**

Sposta/segna la riga **D-051** come risolta (stile delle altre voci risolte, es. D-045): prefissa il titolo con **RISOLTA 2026-07-15**, riassumi in una frase l'implementazione (GET stato + card/modale in web-staff + dip qrcode), e aggiorna la baseline test in fondo alla sezione.

- [ ] **Step 2: `flows.md §9` — nota UI operatore**

Nella sezione §9 (auth canale cliente / macchina a stati enrollment), aggiungi una nota che la **UI operatore** (Scheda cliente → card «Accesso cliente»: Genera/Rigenera/Revoca + stato `none/issued/active/revoked`) è realizzata in web-staff (D-051), citando `GET /bookings/:id/customer-access`.

- [ ] **Step 3: ADR-0049 — addendum D-051**

Aggiungi in fondo all'ADR un addendum «**D-051 — UI operatore provisioning (realizzata 2026-07-15)**»: la garanzia di provisioning-by-controller è ora azionabile da UI; il GET stato è tenant-scoped (resolveCustomerId sotto RLS, no IDOR); `accessStatus` reso privato.

- [ ] **Step 4: Mockup**

Create `docs/design/mockups/web-staff-customer-access.html` (statico, stile degli altri mockup in `docs/design/mockups/`): card «Accesso cliente» nei 4 stati + modale reveal (QR placeholder + link + PIN + copia).

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/deferred.md docs/design/flows.md docs/architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md docs/design/mockups/web-staff-customer-access.html
git commit -m "docs: D-051 realizzata (deferred/flows/ADR-0049 addendum + mockup web-staff-customer-access) [D-051]"
```

---

## Self-Review (autore del piano)

- **Spec coverage:** §3 backend → Task 1; §5 hooks+card+modal → Task 2/3/4/5; §6 testing → test in ogni task + Task 6 LIVE; §7 dip qrcode → Task 3; §8 DoD docs → Task 7. Nessun requisito scoperto.
- **Placeholder scan:** ogni step con codice mostra il codice reale (nessun «TBD»/«handle errors»); i due punti «allinea a mountDetail esistente» e i doc di Task 7 sono istruzioni su artefatti esistenti/prosa, non codice-placeholder.
- **Type consistency:** `CustomerAccessStatusDTO`/`CustomerAccessState`/`CustomerProvisionResponse` usati coerentemente; hook `useCustomerAccessStatus/useProvisionCustomerAccess/useRevokeCustomerAccess` con firme identiche fra definizione (Task 2), card (Task 4) e test; `queryKeys.customerAccess(tenantId, bookingId)` coerente; icone `copy`/`smartphone` aggiunte prima dell'uso (Task 3, usate in Task 3/4).
```
