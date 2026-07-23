# Wiring `retiredFrom` nello storico prenotazioni — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** lo storico prenotazioni della Scheda cliente mostra la posizione storica («Settore · Fila» congelato al ritiro) e una marca «Ritirato» per gli ombrelloni ritirati (D-055), invece di «— · label».

**Architecture:** due campi opzionali additivi su `CustomerBookingDTO` (`umbrellaRetiredAt`/`umbrellaRetiredFrom`), valorizzati in `listByCustomer` dagli scalari di `Umbrella` già caricati (zero query nuove); nel FE un helper puro condiviso `positionLabel()` sostituisce il chip triplicato nelle tre card della Scheda cliente + `Badge` «Ritirato».

**Tech Stack:** NestJS+Prisma (apps/api), contracts TS condivisi, Vue3+vitest (apps/web-staff).

**Spec:** [2026-07-23-retiredfrom-storico-prenotazioni-design.md](../specs/2026-07-23-retiredfrom-storico-prenotazioni-design.md)

## Global Constraints

- Branch: `feat/retiredfrom-storico-d055` (già creato). Nessun merge su main senza ok utente.
- E2e api: calendario congelato al **2026-07-15** (contratto in `apps/api/test/jest-frozen-calendar.setup.ts`); date di test = LETTERALI dentro la stagione seed `[2026-05-01, 2026-09-30]`. NON usare date relative a oggi reale.
- Dopo ogni task: INTERA suite del pacchetto toccato, mai il solo spec. Baseline: api unit 266 (48 suite) · api e2e 392 (35 suite, sequenziali per config) · web-staff 533 · `pnpm -r typecheck` exit 0.
- Comandi (dalla root, PowerShell): `corepack pnpm -C apps/api test` · `corepack pnpm -C apps/api test:e2e` · `corepack pnpm -C apps/web-staff test` · `corepack pnpm -r typecheck`.
- FE: nessun hex fuori da theme.css; `Badge` è il primitive ui-kit esistente (tone `neutral`); non esiste tema dark.
- `sectorName` NON cambia semantica (resta il settore vivo, assente per i ritirati).
- Se una suite mostra errori di *collection* con 0 test rossi → flake noto dell'host: rilancia.

---

### Task 1: Contratto + projection (api unit)

**Files:**
- Modify: `packages/contracts/src/index.ts` (~L284, blocco «arricchimenti server-side» di `CustomerBookingDTO`)
- Modify: `apps/api/src/bookings/customer-booking.projection.ts` (interface `CustomerBookingEnrichment` + `toCustomerBookingDTO`)
- Test: `apps/api/src/bookings/customer-booking.projection.spec.ts`

**Interfaces:**
- Produces: `CustomerBookingDTO.umbrellaRetiredAt?: string` e `.umbrellaRetiredFrom?: string`; `CustomerBookingEnrichment.umbrellaRetiredAt?: string` e `.umbrellaRetiredFrom?: string` (il Task 2 li valorizza, il Task 3 li legge dal DTO).

- [ ] **Step 1: Write the failing test** — in `customer-booking.projection.spec.ts`, accanto ai test esistenti su `sectorName` (usa la factory `bookingRow()` già presente nel file):

```ts
it('copia umbrellaRetiredAt/umbrellaRetiredFrom (ombrellone ritirato, D-055); sectorName resta assente', () => {
  const dto = toCustomerBookingDTO(bookingRow(), {
    umbrellaLabel: '12',
    umbrellaRetiredAt: '2026-07-01T10:00:00.000Z',
    umbrellaRetiredFrom: 'Centro · Fila 1',
  });
  expect(dto.umbrellaRetiredAt).toBe('2026-07-01T10:00:00.000Z');
  expect(dto.umbrellaRetiredFrom).toBe('Centro · Fila 1');
  expect(dto.sectorName).toBeUndefined();
});

it('umbrellaRetiredAt/umbrellaRetiredFrom assenti per un ombrellone vivo', () => {
  const dto = toCustomerBookingDTO(bookingRow(), { umbrellaLabel: 'A12', sectorName: 'Centro' });
  expect(dto.umbrellaRetiredAt).toBeUndefined();
  expect(dto.umbrellaRetiredFrom).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm -C apps/api test -- customer-booking.projection`
Expected: FAIL — TS2353/TS2339 (i campi non esistono su `CustomerBookingEnrichment`/DTO) o assertion fail.

- [ ] **Step 3: Contratto** — in `packages/contracts/src/index.ts`, dentro `CustomerBookingDTO`, subito dopo la riga di `sectorName`:

```ts
  umbrellaRetiredAt?: string;     // D-055 (additivo): ISO datetime; presente SOLO se l'ombrellone è ritirato
  umbrellaRetiredFrom?: string;   // D-055 (additivo): snapshot «Settore · Fila» al ritiro; solo se ritirato e noto
```

- [ ] **Step 4: Projection** — in `customer-booking.projection.ts`: `CustomerBookingEnrichment` += (dopo `sectorName?: string;`):

```ts
  umbrellaRetiredAt?: string;
  umbrellaRetiredFrom?: string;
```

e in `toCustomerBookingDTO`, dopo `sectorName: e.sectorName,`:

```ts
    umbrellaRetiredAt: e.umbrellaRetiredAt,
    umbrellaRetiredFrom: e.umbrellaRetiredFrom,
```

- [ ] **Step 5: Run FULL api unit suite**

Run: `corepack pnpm -C apps/api test`
Expected: 268 passed (266 + 2), 48 suite.

- [ ] **Step 6: Typecheck + commit**

Run: `corepack pnpm -r typecheck` → exit 0 (contracts è consumato da 4 app: il typecheck globale è il gate cross-file).

```bash
git add packages/contracts/src/index.ts apps/api/src/bookings/customer-booking.projection.ts apps/api/src/bookings/customer-booking.projection.spec.ts
git commit -m "feat(contracts,api): CustomerBookingDTO espone umbrellaRetiredAt/umbrellaRetiredFrom (D-055)"
```

---

### Task 2: Enrichment in `listByCustomer` + e2e

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts:147` (blocco enrichment di `listByCustomer`)
- Test: `apps/api/test/customer-bookings.e2e-spec.ts` (nuovo `it` in coda alla describe)

**Interfaces:**
- Consumes: `CustomerBookingEnrichment.umbrellaRetiredAt/umbrellaRetiredFrom` (Task 1).
- Produces: `GET /api/customers/:id/bookings` espone i campi per gli ombrelloni ritirati; `listSubscriptionsForCustomer` (canale cliente) li eredita gratis perché riusa `listByCustomer`.

- [ ] **Step 1: Write the failing e2e** — in coda a `customer-bookings.e2e-spec.ts` (dentro la describe; riusa `s1`, `t1`, `ids`, `bearer`, `prisma` del `beforeAll`). Nota date: «oggi» e2e = 2026-07-15; il daily al 2026-07-05 è concluso → il retire non è bloccato dalla guardia 409 (`endDate >= oggi`). Il retire risponde **201** (cfr. `establishment-umbrellas-retire.e2e-spec.ts`). Il controllo negativo usa `ids.u1` (mattina 2026-07-06 libera: Mario occupa mattina 2026-07-10 e pomeriggio 2026-08-01):

```ts
it('espone umbrellaRetiredAt/umbrellaRetiredFrom per un ombrellone ritirato; sectorName assente; i vivi invariati (D-055)', async () => {
  const c = await prisma.forTenant(s1, (tx) =>
    tx.customer.create({ data: { establishmentId: s1, firstName: 'Ritiro', lastName: 'Test' } }));
  const u = await prisma.forTenant(s1, (tx) =>
    tx.umbrella.create({ data: { establishmentId: s1, rowId: ids.rowId, umbrellaTypeId: null, label: 'RT-CB', logicalOrder: 97 } }));

  // daily CONCLUSO rispetto all'oggi congelato (2026-07-15) → il retire non è bloccato.
  const past = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(t1))
    .send({ customerId: c.id, umbrellaId: u.id, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-07-05' }).expect(201);
  // daily su ombrellone VIVO per il controllo negativo.
  const alive = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(t1))
    .send({ customerId: c.id, umbrellaId: ids.u1, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-07-06' }).expect(201);

  await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${u.id}/retire`).set(...bearer(t1)).expect(201);

  const res = await request(app.getHttpServer())
    .get(`/api/customers/${c.id}/bookings`).set(...bearer(t1)).expect(200);
  const retired = res.body.find((b: { id: string }) => b.id === past.body.id);
  expect(retired.umbrellaRetiredFrom).toBe('Centro · Fila 1'); // snapshot seed-map: settore Centro, fila «Fila 1»
  expect(typeof retired.umbrellaRetiredAt).toBe('string');
  expect(retired.sectorName).toBeUndefined();
  expect(retired.umbrellaLabel).toBe('RT-CB');
  const aliveDto = res.body.find((b: { id: string }) => b.id === alive.body.id);
  expect(aliveDto.sectorName).toBe('Centro');
  expect(aliveDto.umbrellaRetiredAt).toBeUndefined();
  expect(aliveDto.umbrellaRetiredFrom).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm -C apps/api test:e2e -- customer-bookings`
Expected: FAIL sull'assert `umbrellaRetiredFrom` (undefined: il service non lo valorizza ancora). Gli altri test della suite restano verdi.

- [ ] **Step 3: Enrichment nel service** — in `bookings.service.ts`, nel `return bookings.map(...)` di `listByCustomer`, subito dopo la riga `sectorName:` (L147):

```ts
          umbrellaRetiredAt: b.umbrella.retiredAt?.toISOString(),
          umbrellaRetiredFrom: b.umbrella.retiredAt ? (b.umbrella.retiredFrom ?? undefined) : undefined,
```

(il gate su `retiredAt` esplicita l'invariante «presente solo se ritirato»; l'`include` di `umbrella` carica già gli scalari — zero query nuove).

- [ ] **Step 4: Run FULL api e2e suite**

Run: `corepack pnpm -C apps/api test:e2e`
Expected: 393 passed (392 + 1), 35 suite.

- [ ] **Step 5: Run FULL api unit + commit**

Run: `corepack pnpm -C apps/api test` → 268/48. Poi:

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/test/customer-bookings.e2e-spec.ts
git commit -m "feat(api): listByCustomer arricchisce lo storico coi campi di ritiro dell'ombrellone (D-055)"
```

---

### Task 3: FE web-staff — helper `positionLabel` + chip e Badge nelle tre card

**Files:**
- Create: `apps/web-staff/src/features/customers/positionLabel.ts`
- Create: `apps/web-staff/src/features/customers/positionLabel.spec.ts`
- Create: `apps/web-staff/src/features/customers/CustomerHistoryCard.spec.ts` (la card non ha spec proprio)
- Modify: `apps/web-staff/src/features/customers/CustomerHistoryCard.vue:33`
- Modify: `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue:45`
- Modify: `apps/web-staff/src/features/customers/CustomerPaymentsCard.vue:44`
- Test (modify): `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.spec.ts`, `CustomerPaymentsCard.spec.ts` (un caso ritirato ciascuno)

**Interfaces:**
- Consumes: `CustomerBookingDTO.umbrellaRetiredAt/umbrellaRetiredFrom` (Task 1).
- Produces: `positionLabel(b: Pick<CustomerBookingDTO, 'sectorName' | 'umbrellaLabel' | 'umbrellaRetiredAt' | 'umbrellaRetiredFrom'>): string`.

- [ ] **Step 1: Write the failing helper spec** — `positionLabel.spec.ts` (pattern di `cessionRefund.spec.ts`: vitest puro):

```ts
import { describe, it, expect } from 'vitest';
import { positionLabel } from './positionLabel';

describe('positionLabel — chip posizione Scheda cliente', () => {
  it('vivo: «Settore · label»', () => {
    expect(positionLabel({ sectorName: 'Centro', umbrellaLabel: '12' })).toBe('Centro · 12');
  });
  it('vivo senza settore (fallback esistente): «— · label»', () => {
    expect(positionLabel({ umbrellaLabel: '12' })).toBe('— · 12');
  });
  it('ritirato: snapshot storico «Settore · Fila · label», ignora sectorName', () => {
    expect(positionLabel({
      sectorName: undefined, umbrellaLabel: '12',
      umbrellaRetiredAt: '2026-07-01T10:00:00.000Z', umbrellaRetiredFrom: 'Centro · Fila 1',
    })).toBe('Centro · Fila 1 · 12');
  });
  it('ritirato senza snapshot: «— · label» (la marca resta compito del Badge)', () => {
    expect(positionLabel({ umbrellaLabel: '12', umbrellaRetiredAt: '2026-07-01T10:00:00.000Z' })).toBe('— · 12');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm -C apps/web-staff test -- positionLabel`
Expected: FAIL — modulo `./positionLabel` inesistente.

- [ ] **Step 3: Helper** — `positionLabel.ts`:

```ts
import type { CustomerBookingDTO } from '@coralyn/contracts';

/** Chip posizione della Scheda cliente. Vivo: «Settore · label». Ritirato (D-055/ADR-0053):
 *  lo snapshot storico «Settore · Fila» congelato al ritiro — il settore vivo non esiste più. */
export function positionLabel(
  b: Pick<CustomerBookingDTO, 'sectorName' | 'umbrellaLabel' | 'umbrellaRetiredAt' | 'umbrellaRetiredFrom'>,
): string {
  const place = b.umbrellaRetiredAt ? b.umbrellaRetiredFrom : b.sectorName;
  return `${place ?? '—'} · ${b.umbrellaLabel}`;
}
```

Run: `corepack pnpm -C apps/web-staff test -- positionLabel` → 4 passed.

- [ ] **Step 4: Failing spec della History card** — `CustomerHistoryCard.spec.ts` (pattern `mountApp` di `CustomerPaymentsCard.spec.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { mountApp } from '@/test/utils';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import CustomerHistoryCard from './CustomerHistoryCard.vue';

const base: CustomerBookingDTO = {
  id: 'b1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-07-05', endDate: '2026-07-05',
  type: 'daily', status: 'confirmed', totalPrice: 30, paymentStatus: 'paid', amountCollected: 30,
  umbrellaLabel: '12', sectorName: 'Centro', seasonName: 'Estate 2026',
};

describe('CustomerHistoryCard — chip posizione (D-055)', () => {
  it('ombrellone vivo: chip «Centro · 12», nessun badge Ritirato', () => {
    const w = mountApp(CustomerHistoryCard, { props: { bookings: [base] } });
    expect(w.text()).toContain('Centro · 12');
    expect(w.text()).not.toContain('Ritirato');
  });
  it('ombrellone ritirato: chip con lo snapshot storico + badge «Ritirato»', () => {
    const retired: CustomerBookingDTO = {
      ...base, id: 'b2', sectorName: undefined,
      umbrellaRetiredAt: '2026-07-12T10:00:00.000Z', umbrellaRetiredFrom: 'Centro · Fila 1',
    };
    const w = mountApp(CustomerHistoryCard, { props: { bookings: [retired] } });
    expect(w.text()).toContain('Centro · Fila 1 · 12');
    expect(w.text()).toContain('Ritirato');
    expect(w.text()).not.toContain('— ·');
  });
});
```

Run: `corepack pnpm -C apps/web-staff test -- CustomerHistoryCard` → FAIL (chip rende «— · 12», badge assente).

- [ ] **Step 5: Wiring nelle tre card.**

`CustomerHistoryCard.vue` — script: `import { positionLabel } from './positionLabel';`; template L33, il contenuto del chip diventa `{{ positionLabel(b) }}` e subito dopo lo span del chip (dentro lo stesso `<span class="flex items-center gap-2">`):

```html
            <span class="inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--color-raised)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--color-text-2nd)]">{{ positionLabel(b) }}</span>
            <Badge v-if="b.umbrellaRetiredAt" tone="neutral">Ritirato</Badge>
```

`CustomerSubscriptionsCard.vue` — stesso import; L45 il chip diventa `{{ positionLabel(b) }}`; dopo il chip, prima del `<Badge v-if="b.packageName">`:

```html
              <Badge v-if="b.umbrellaRetiredAt" tone="neutral">Ritirato</Badge>
```

`CustomerPaymentsCard.vue` — stesso import; il template slot L44 diventa:

```html
        <template #cell-umbrella="{ row }">{{ positionLabel(row as unknown as CustomerBookingDTO) }} <Badge v-if="(row as unknown as CustomerBookingDTO).umbrellaRetiredAt" tone="neutral">Ritirato</Badge></template>
```

(`Badge` è già importato in tutte e tre le card.)

- [ ] **Step 6: Un caso ritirato negli spec esistenti delle altre due card.**

`CustomerSubscriptionsCard.spec.ts` — nuovo `it` in coda alla describe principale, fixture modellata su quelle del file (riusa la sub-fixture esistente del file con spread):

```ts
  it('abbonamento su ombrellone ritirato: chip con snapshot storico + badge «Ritirato» (D-055)', () => {
    // parti dalla fixture di abbonamento confermato già usata nel file e sovrascrivi:
    // { ...subFixture, sectorName: undefined, umbrellaRetiredAt: '2026-07-12T10:00:00.000Z', umbrellaRetiredFrom: 'Centro · Fila 1' }
    // mount identico agli altri test del file.
    // Assert:
    // expect(w.text()).toContain('Centro · Fila 1');
    // expect(w.text()).toContain('Ritirato');
  });
```

(adatta nome fixture/mount allo stile REALE del file — il commento sopra è la sostanza da asserire, non testo da lasciare nel codice).

`CustomerPaymentsCard.spec.ts` — nuovo `it`:

```ts
  it('riga su ombrellone ritirato: cella posizione con snapshot storico + «Ritirato» (D-055)', () => {
    const retired: CustomerBookingDTO = {
      ...base, id: 'b-retired', sectorName: undefined,
      umbrellaRetiredAt: '2026-07-12T10:00:00.000Z', umbrellaRetiredFrom: 'Centro · Fila 1',
    };
    const w = mountApp(CustomerPaymentsCard, { props: { bookings: [retired] } });
    expect(w.text()).toContain('Centro · Fila 1 · A12');
    expect(w.text()).toContain('Ritirato');
  });
```

(nota: `base` di quel file ha `umbrellaLabel: 'A12'`.)

- [ ] **Step 7: Run FULL web-staff suite + typecheck**

Run: `corepack pnpm -C apps/web-staff test` → attesi 533 + 8 nuovi = **541** (4 helper + 2 History + 1 Subscriptions + 1 Payments). Poi `corepack pnpm -r typecheck` → exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web-staff/src/features/customers/positionLabel.ts apps/web-staff/src/features/customers/positionLabel.spec.ts apps/web-staff/src/features/customers/CustomerHistoryCard.spec.ts apps/web-staff/src/features/customers/CustomerHistoryCard.vue apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue apps/web-staff/src/features/customers/CustomerSubscriptionsCard.spec.ts apps/web-staff/src/features/customers/CustomerPaymentsCard.vue apps/web-staff/src/features/customers/CustomerPaymentsCard.spec.ts
git commit -m "feat(web-staff): chip posizione storica + badge Ritirato nella Scheda cliente (D-055)"
```

---

## Note di chiusura (fuori dai task, per la sessione)

- MSW (`apps/web-staff/src/mocks/server.ts`): i campi sono opzionali → i handler esistenti restano validi; NON toccare il seed `INITIAL_CUSTOMER_BOOKINGS` (gli spec di CustomerDetailView contano sulle fixture attuali).
- Dopo i 3 task: review whole-branch, poi aggiornare deferred/handoff (voce backlog D-055) e chiedere ok merge.
