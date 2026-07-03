# Scheda Cliente — Redesign visivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** portare la Scheda cliente (`/customers/:id`) alla qualità del mock aspirazionale, estraendo i primitivi condivisi nel `ui-kit` e arricchendo il DTO di lettura, senza debiti e read-only.

**Architecture:** 3 layer/commit. (1) `ui-kit`: nuovi `SectionCard` + `Callout`, estensione retro-compatibile di `StatTile`. (2) `contracts` + backend: `packageName`/`sectorName` su `CustomerBookingDTO` via join server-side (nessuna migrazione). (3) FE: ridisegno delle 3 card + header Anagrafica → `SectionCard`, `PAYMENT_METHOD_LABEL`, seed MSW e test render aggiornati.

**Tech Stack:** Vue 3 `<script setup>` + Tailwind (token CSS in `theme.css`), Vitest + @vue/test-utils (ui-kit/web-staff), NestJS + Prisma + supertest (api), TypeScript, pnpm workspace (`corepack pnpm`).

**Branch:** `feat/scheda-cliente-360` (estende lo slice funzionale non mergiato — dipende da `CustomerBookingDTO`/`listByCustomer`). NON partire da `main`.

**Baseline test da NON regredire (verificata LIVE all'HEAD del branch):** api unit **111** · api e2e **158** · web-staff **156** (globa i 55 di ui-kit) · ui-kit standalone **55**; typecheck web-staff pulito. Ogni incremento è additivo.

**Comandi (root repo, `corepack pnpm`):**
- ui-kit: `corepack pnpm --filter @coralyn/ui-kit test`
- api unit: `corepack pnpm --filter @coralyn/api test`
- api e2e: `corepack pnpm --filter @coralyn/api test:e2e` (richiede DB su `localhost:5433`; `.env.test` al ROOT)
- web-staff: `corepack pnpm --filter web-staff test`
- typecheck: `corepack pnpm --filter web-staff typecheck`

**Convenzioni verificate (rispettarle):**
- Valuta: `formatEuro(n)` da `@coralyn/ui-kit` → `"€ 30.00"` (NON hardcodare la virgola del mock; il progetto usa il punto).
- Chip ombrellone: `«{sectorName} · {umbrellaLabel}»`, span inline (spec §2.3 consente lo stile inline; NON `UmbrellaCell`).
- DataTable rows: cast idiomatico `:rows="(x as unknown as Record<string, unknown>[])"`, negli slot `(row as unknown as CustomerBookingDTO)`.
- Token, non hex: tutti i valori del mock esistono già come token (`--color-coral-050`/`--color-coral-700`/`--color-brand-ink`/`--color-brand-tint`/`--color-accent-tint`/`--radius-md`/`--radius-sm`). **Nessun nuovo token necessario.**

---

## File Structure

**Layer 1 — ui-kit (Task 1):**
- Create: `packages/ui-kit/src/components/SectionCard.vue` — card + header-a-icona standard (compone `Card`).
- Create: `packages/ui-kit/src/components/Callout.vue` — box tinto per avvisi inline (prelazione).
- Modify: `packages/ui-kit/src/components/StatTile.vue` — + prop retro-compatibili `tone`/`layout`.
- Modify: `packages/ui-kit/src/index.ts` — export `SectionCard`, `Callout`.
- Create test: `packages/ui-kit/src/components/SectionCard.spec.ts`
- Create test: `packages/ui-kit/src/components/Callout.spec.ts`
- Create test: `packages/ui-kit/src/components/StatTile.spec.ts`

**Layer 2 — contracts + backend (Task 2):**
- Modify: `packages/contracts/src/index.ts` — `CustomerBookingDTO` += `packageName?`/`sectorName?`.
- Modify: `apps/api/src/bookings/customer-booking.projection.ts` — enrichment + mapping.
- Modify: `apps/api/src/bookings/bookings.service.ts` — `listByCustomer` include nested + package, mapping.
- Modify test: `apps/api/src/bookings/customer-booking.projection.spec.ts`
- Modify test: `apps/api/test/customer-bookings.e2e-spec.ts`

**Layer 3 — FE (Task 3):**
- Modify: `apps/web-staff/src/lib/statusMaps.ts` — `PAYMENT_METHOD_LABEL`.
- Modify: `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue`
- Modify: `apps/web-staff/src/features/customers/CustomerHistoryCard.vue`
- Modify: `apps/web-staff/src/features/customers/CustomerPaymentsCard.vue`
- Modify: `apps/web-staff/src/features/customers/CustomerDetailView.vue` — card Anagrafica → `SectionCard`.
- Modify: `apps/web-staff/src/mocks/server.ts` — seed `packageName`/`sectorName`.
- Modify test: `apps/web-staff/src/features/customers/CustomerDetailView.spec.ts`

---

## Task 1: ui-kit — `SectionCard` + `Callout` + estensione `StatTile`

**Files:**
- Create: `packages/ui-kit/src/components/SectionCard.vue`
- Create: `packages/ui-kit/src/components/Callout.vue`
- Modify: `packages/ui-kit/src/components/StatTile.vue`
- Modify: `packages/ui-kit/src/index.ts`
- Test: `packages/ui-kit/src/components/SectionCard.spec.ts`, `Callout.spec.ts`, `StatTile.spec.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

Create `packages/ui-kit/src/components/SectionCard.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SectionCard from './SectionCard.vue';

describe('SectionCard', () => {
  it('rende il titolo e l’icona', () => {
    const w = mount(SectionCard, { props: { title: 'Pagamenti', icon: 'euro' } });
    expect(w.text()).toContain('Pagamenti');
    // l'icona è resa come <svg> dal registro
    expect(w.find('svg').exists()).toBe(true);
  });

  it('rende lo slot action nell’header e lo slot default nel corpo', () => {
    const w = mount(SectionCard, {
      props: { title: 'Anagrafica' },
      slots: { action: '<button>Modifica</button>', default: '<p>corpo</p>' },
    });
    expect(w.text()).toContain('Modifica');
    expect(w.text()).toContain('corpo');
  });

  it('senza prop icon non rende il quadratino-icona', () => {
    const w = mount(SectionCard, { props: { title: 'X' } });
    expect(w.find('svg').exists()).toBe(false);
  });
});
```

Create `packages/ui-kit/src/components/Callout.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Callout from './Callout.vue';

describe('Callout', () => {
  it('rende il contenuto e lo slot icona', () => {
    const w = mount(Callout, {
      slots: { default: 'Prelazione aperta', icon: '<svg data-test="ic"></svg>' },
    });
    expect(w.text()).toContain('Prelazione aperta');
    expect(w.find('[data-test="ic"]').exists()).toBe(true);
  });

  it('tone di default (warm) usa i token coral', () => {
    const w = mount(Callout, { slots: { default: 'x' } });
    const cls = w.classes().join(' ');
    expect(cls).toContain('bg-[var(--color-coral-050)]');
    expect(cls).toContain('text-[var(--color-coral-700)]');
  });

  it('tone accent usa i token accent', () => {
    const w = mount(Callout, { props: { tone: 'accent' }, slots: { default: 'x' } });
    expect(w.classes().join(' ')).toContain('bg-[var(--color-accent-tint)]');
  });
});
```

Create `packages/ui-kit/src/components/StatTile.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StatTile from './StatTile.vue';

describe('StatTile', () => {
  it('rende value e label', () => {
    const w = mount(StatTile, { props: { value: '€ 540.00', label: 'Saldo' } });
    expect(w.text()).toContain('€ 540.00');
    expect(w.text()).toContain('Saldo');
  });

  it('default (value-first, tone default): il valore usa il colore testo standard', () => {
    const w = mount(StatTile, { props: { value: '10', label: 'X' } });
    expect(w.html()).toContain('text-[var(--color-text)]');
  });

  it('tone accent colora il valore col brand', () => {
    const w = mount(StatTile, { props: { value: '10', label: 'X', tone: 'accent' } });
    expect(w.html()).toContain('text-[var(--color-brand-ink)]');
  });

  it('layout label-first mette la label prima del valore nel DOM', () => {
    const w = mount(StatTile, { props: { value: 'V', label: 'L', layout: 'label-first' } });
    const html = w.html();
    expect(html.indexOf('L')).toBeLessThan(html.indexOf('V'));
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `corepack pnpm --filter @coralyn/ui-kit test`
Expected: FAIL — `SectionCard.vue`/`Callout.vue` non esistono; `StatTile` non ha `tone`/`layout`.

- [ ] **Step 3: Crea `SectionCard.vue`**

```vue
<script setup lang="ts">
import Card from './Card.vue';
import Icon from './Icon.vue';
withDefaults(
  defineProps<{ title: string; icon?: string; iconBg?: string; iconInk?: string }>(),
  { iconBg: 'var(--color-brand-tint)', iconInk: 'var(--color-brand-ink)' },
);
</script>
<template>
  <Card>
    <div class="p-[22px]">
      <div class="mb-4 flex items-center gap-2.5">
        <span
          v-if="icon"
          class="grid size-[34px] shrink-0 place-items-center rounded-[10px]"
          :style="{ background: iconBg, color: iconInk }"
        ><Icon :name="icon" :size="18" /></span>
        <span class="flex-1 text-sm font-bold text-[var(--color-text)]">{{ title }}</span>
        <slot name="action" />
      </div>
      <slot />
    </div>
  </Card>
</template>
```

- [ ] **Step 4: Crea `Callout.vue`**

```vue
<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'warm' | 'accent' | 'neutral' }>(), { tone: 'warm' });
const tones = {
  warm: 'bg-[var(--color-coral-050)] text-[var(--color-coral-700)]',
  accent: 'bg-[var(--color-accent-tint)] text-[var(--color-accent)]',
  neutral: 'bg-[var(--color-raised)] text-[var(--color-text-2nd)]',
} as const;
</script>
<template>
  <div
    :class="['flex items-start gap-2 rounded-[var(--radius-md)] px-3 py-2.5 text-[12.5px] font-semibold', tones[$props.tone ?? 'warm']]"
  >
    <span class="mt-px shrink-0"><slot name="icon" /></span>
    <span><slot /></span>
  </div>
</template>
```

- [ ] **Step 5: Estendi `StatTile.vue` (retro-compatibile)**

Il ramo `value-first` deve restare identico al markup attuale (retro-compat byte-per-byte del percorso default).

```vue
<script setup lang="ts">
withDefaults(
  defineProps<{
    value: string;
    label: string;
    tone?: 'default' | 'accent';
    layout?: 'value-first' | 'label-first';
  }>(),
  { tone: 'default', layout: 'value-first' },
);
</script>
<template>
  <div class="rounded-[var(--radius-md)] bg-[var(--color-raised)] px-3.5 py-3">
    <template v-if="layout === 'label-first'">
      <div class="text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">{{ label }}</div>
      <div class="mt-1 text-2xl font-bold tabular-nums" :class="tone === 'accent' ? 'text-[var(--color-brand-ink)]' : 'text-[var(--color-text)]'">{{ value }}</div>
    </template>
    <template v-else>
      <div class="text-2xl font-bold tabular-nums" :class="tone === 'accent' ? 'text-[var(--color-brand-ink)]' : 'text-[var(--color-text)]'">{{ value }}</div>
      <div class="mt-0.5 text-[11.5px] text-[var(--color-text-muted)]">{{ label }}</div>
    </template>
  </div>
</template>
```

- [ ] **Step 6: Esporta i nuovi componenti in `index.ts`**

In `packages/ui-kit/src/index.ts`, aggiungi dopo la riga `export { default as Card } ...`:

```ts
export { default as SectionCard } from './components/SectionCard.vue';
export { default as Callout } from './components/Callout.vue';
```

- [ ] **Step 7: Esegui i test ui-kit e verifica che passino**

Run: `corepack pnpm --filter @coralyn/ui-kit test`
Expected: PASS — nuovi test verdi, i 55 esistenti invariati (totale 55 + 10 nuovi = 65).

- [ ] **Step 8: Esegui web-staff (globa gli spec ui-kit) per non regredire**

Run: `corepack pnpm --filter web-staff test`
Expected: PASS — nessuna regressione (i nuovi spec ui-kit si sommano; nessun consumo dei nuovi componenti ancora).

- [ ] **Step 9: Commit**

```bash
git add packages/ui-kit/src/components/SectionCard.vue packages/ui-kit/src/components/Callout.vue packages/ui-kit/src/components/StatTile.vue packages/ui-kit/src/components/SectionCard.spec.ts packages/ui-kit/src/components/Callout.spec.ts packages/ui-kit/src/components/StatTile.spec.ts packages/ui-kit/src/index.ts
git commit -m "feat(ui-kit): SectionCard + Callout + StatTile tone/layout (redesign Scheda cliente)"
```

---

## Task 2: contracts + backend — `packageName` / `sectorName`

**Files:**
- Modify: `packages/contracts/src/index.ts:216-240` (`CustomerBookingDTO`)
- Modify: `apps/api/src/bookings/customer-booking.projection.ts`
- Modify: `apps/api/src/bookings/bookings.service.ts:60-112` (`listByCustomer`)
- Test: `apps/api/src/bookings/customer-booking.projection.spec.ts`, `apps/api/test/customer-bookings.e2e-spec.ts`

- [ ] **Step 1: Estendi i test (unit projection) — deve fallire**

In `apps/api/src/bookings/customer-booking.projection.spec.ts`, dentro `describe('toCustomerBookingDTO', ...)`, aggiungi:

```ts
  it('valorizza packageName e sectorName quando presenti', () => {
    const dto = toCustomerBookingDTO(bookingRow(), {
      umbrellaLabel: 'A12',
      sectorName: 'Centro',
      packageName: 'Comfort',
    });
    expect(dto.sectorName).toBe('Centro');
    expect(dto.packageName).toBe('Comfort');
  });

  it('omette packageName se assente (booking senza pacchetto)', () => {
    const dto = toCustomerBookingDTO(bookingRow(), { umbrellaLabel: 'A12', sectorName: 'Centro' });
    expect(dto.packageName).toBeUndefined();
    expect(dto.sectorName).toBe('Centro');
  });
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `corepack pnpm --filter @coralyn/api test customer-booking.projection`
Expected: FAIL — `Object literal may only specify known properties` (`sectorName`/`packageName` non nell'enrichment) e/o assert su `undefined`.

- [ ] **Step 3: Estendi `CustomerBookingDTO` nei contracts**

In `packages/contracts/src/index.ts`, nel blocco `// — arricchimenti server-side —` di `CustomerBookingDTO` (dopo `umbrellaLabel`), aggiungi:

```ts
  packageName?: string;           // nome del Package (se packageId presente); il FE non carica il catalogo
  sectorName?: string;            // nome del Settore dell'ombrellone (per il chip «Centro · A12»)
```

- [ ] **Step 4: Estendi la projection**

In `apps/api/src/bookings/customer-booking.projection.ts`, estendi l'interfaccia `CustomerBookingEnrichment`:

```ts
export interface CustomerBookingEnrichment {
  umbrellaLabel: string;
  seasonName?: string;
  packageName?: string;
  sectorName?: string;
  seniority?: number;
  renewed?: boolean;
  prelazione?: { destinationSeasonName: string; deadline: string };
}
```

e nel `return` di `toCustomerBookingDTO`, dopo `umbrellaLabel: e.umbrellaLabel,`:

```ts
    packageName: e.packageName,
    sectorName: e.sectorName,
```

- [ ] **Step 5: Esegui e verifica che l'unit passi**

Run: `corepack pnpm --filter @coralyn/api test customer-booking.projection`
Expected: PASS.

- [ ] **Step 6: Estendi `listByCustomer` (include + mapping)**

In `apps/api/src/bookings/bookings.service.ts`, dentro `listByCustomer`:

Sostituisci l'`include` della `findMany` (attualmente `include: { umbrella: true, renewals: true }`) con:

```ts
        include: {
          umbrella: { include: { row: { include: { sector: true } } } },
          package: true,
          renewals: true,
        },
```

Nel `return bookings.map((b) => { ... })`, dentro l'oggetto passato a `toCustomerBookingDTO`, dopo `umbrellaLabel: b.umbrella.label,`:

```ts
          packageName: b.package?.name ?? undefined,
          sectorName: b.umbrella.row.sector.name,
```

- [ ] **Step 7: Estendi l'e2e (assert su sectorName + nuovo test packageName)**

In `apps/api/test/customer-bookings.e2e-spec.ts`:

(a) cattura il `packageId` del listino. Dove viene chiamato `seedPricingTenant`, aggiungi la variabile: dichiara in alto (con gli altri `let`) `let pricingPackageId: string;` e `let packCustomerId: string;`, poi dopo `const pricing = await seedPricingTenant(...)` aggiungi:

```ts
    pricingPackageId = pricing.packageId;
```

(b) nel test esistente `'ritorna il mix arricchito ...'`, aggiungi due assert additivi (il settore seminato è `'Centro'`): dopo `expect(origin.seasonName).toBe('Estate 2026');` aggiungi `expect(origin.sectorName).toBe('Centro');` e dopo `expect(daily.umbrellaLabel).toBe('1');` aggiungi `expect(daily.sectorName).toBe('Centro');`.

(c) aggiungi un nuovo test dopo quello del mix (usa `umbrellaId2` = A13 in fascia POMERIGGIO, disgiunta dalla subscription MATTINA del test prelazione → nessun overlap; il rate pomeriggio (40) prezza il daily senza pacchetto, il rate pacchetto (60) quello con pacchetto):

```ts
  it('arricchisce packageName (se presente) e sectorName; packageName assente senza pacchetto', async () => {
    await prisma.forTenant(s1, async (tx) => {
      const c = await tx.customer.create({ data: { establishmentId: s1, firstName: 'Pack', lastName: 'Test' } });
      packCustomerId = c.id;
    });
    const withPkg = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(t1))
      .send({ customerId: packCustomerId, umbrellaId: umbrellaId2, timeSlotId: ids.slotAfternoon, type: 'daily', startDate: '2026-07-05', packageId: pricingPackageId }).expect(201);
    const noPkg = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(t1))
      .send({ customerId: packCustomerId, umbrellaId: umbrellaId2, timeSlotId: ids.slotAfternoon, type: 'daily', startDate: '2026-07-06' }).expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/customers/${packCustomerId}/bookings`).set(...bearer(t1)).expect(200);
    const rowWith = res.body.find((b: { id: string }) => b.id === withPkg.body.id);
    const rowNo = res.body.find((b: { id: string }) => b.id === noPkg.body.id);
    expect(rowWith.packageName).toBe('Standard');
    expect(rowWith.sectorName).toBe('Centro');
    expect(rowNo.packageName).toBeUndefined();
    expect(rowNo.sectorName).toBe('Centro');
  });
```

- [ ] **Step 8: Esegui unit + e2e api**

Run: `corepack pnpm --filter @coralyn/api test`
Expected: PASS — api unit 111 + 2 nuovi = 113.

Run: `corepack pnpm --filter @coralyn/api test:e2e`
Expected: PASS — api e2e 158 + 1 nuovo = 159.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src/index.ts apps/api/src/bookings/customer-booking.projection.ts apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/customer-booking.projection.spec.ts apps/api/test/customer-bookings.e2e-spec.ts
git commit -m "feat(bookings): packageName/sectorName su CustomerBookingDTO (join server-side, no migrazione)"
```

---

## Task 3: FE — ridisegno delle 3 card + Anagrafica → `SectionCard`

**Files:**
- Modify: `apps/web-staff/src/lib/statusMaps.ts`
- Modify: `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue`
- Modify: `apps/web-staff/src/features/customers/CustomerHistoryCard.vue`
- Modify: `apps/web-staff/src/features/customers/CustomerPaymentsCard.vue`
- Modify: `apps/web-staff/src/features/customers/CustomerDetailView.vue`
- Modify: `apps/web-staff/src/mocks/server.ts`
- Test: `apps/web-staff/src/features/customers/CustomerDetailView.spec.ts`

- [ ] **Step 1: Aggiorna il seed MSW e i test render (devono fallire)**

(a) In `apps/web-staff/src/mocks/server.ts`, arricchisci il seed `INITIAL_CUSTOMER_BOOKINGS['c-1']`: aggiungi `sectorName: 'Centro'` a **tutte e 4** le righe, e `packageName: 'Comfort'` alle **due** righe `subscription` (`cb-1`, `cb-2`). Aggiungi anche `paymentMethod: 'card'` a `cb-1` (per esercitare `PAYMENT_METHOD_LABEL` nella tabella). Risultato:

```ts
  'c-1': [
    { id: 'cb-1', umbrellaId: 'u-1', timeSlotId: 'ts-1', startDate: '2027-06-15', endDate: '2027-09-15',
      type: 'subscription', status: 'confirmed', totalPrice: 320, paymentStatus: 'paid', amountCollected: 320,
      paymentMethod: 'card',
      umbrellaLabel: 'A12', sectorName: 'Centro', packageName: 'Comfort', seasonName: 'Estate 2027', seniority: 2, renewed: false,
      prelazione: { destinationSeasonName: 'Estate 2028', deadline: '2028-04-30' } },
    { id: 'cb-2', umbrellaId: 'u-1', timeSlotId: 'ts-1', startDate: '2026-06-15', endDate: '2026-09-15',
      type: 'subscription', status: 'confirmed', totalPrice: 300, paymentStatus: 'paid', amountCollected: 300,
      umbrellaLabel: 'A12', sectorName: 'Centro', packageName: 'Comfort', seasonName: 'Estate 2026', seniority: 1, renewed: true },
    { id: 'cb-3', umbrellaId: 'u-1', timeSlotId: 'ts-1', startDate: '2026-07-10', endDate: '2026-07-10',
      type: 'daily', status: 'confirmed', totalPrice: 30, paymentStatus: 'unpaid', amountCollected: 0,
      umbrellaLabel: 'A12', sectorName: 'Centro', seasonName: 'Estate 2026' },
    { id: 'cb-4', umbrellaId: 'u-1', timeSlotId: 'ts-1', startDate: '2026-08-01', endDate: '2026-08-01',
      type: 'daily', status: 'cancelled', totalPrice: 30, paymentStatus: 'unpaid', amountCollected: 0,
      umbrellaLabel: 'A12', sectorName: 'Centro', seasonName: 'Estate 2026' },
  ],
```

(b) In `apps/web-staff/src/features/customers/CustomerDetailView.spec.ts`, sostituisci i corpi dei test `'mostra lo storico raggruppato ...'`, `'mostra anzianità e badge Rinnovato ...'`, `'mostra saldo e incassato ...'` e `'mostra la nota di prelazione ...'` per asserire il redesign (chip settore, badge pacchetto, numero-grande, conteggio gruppo, metodo tradotto, stato Confermata). Rimpiazza quei 4 blocchi con:

```ts
  it('storico: raggruppa per stagione con conteggio, mostra chip settore e stato', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('Estate 2026');
    expect(w.text()).toContain('Estate 2027');
    expect(w.text()).toContain('Centro · A12'); // chip ombrellone «settore · label»
    expect(w.text()).toContain('Giornaliera');
    expect(w.text()).toContain('Abbonamento');
    expect(w.text()).toMatch(/3\s*prenotazioni/); // Estate 2026 ha 3 righe (2 daily + 1 sub)
    expect(w.text()).toContain('Confermata');
    expect(w.text()).toContain('Annullata');
  });

  it('abbonamento: numero-grande anzianità, badge pacchetto e badge Rinnovato', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('Rinnovato');
    expect(w.text()).toContain('Comfort'); // badge packageName
    expect(w.text()).toContain('STAGIONI'); // label del numero-grande (seniority 2)
    expect(w.text()).toMatch(/Abbonato da 2 stagioni/);
  });

  it('pagamenti: due StatTile (saldo/incassato) e tabella con metodo tradotto', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('Saldo aperto');
    expect(w.text()).toContain('Incassato');
    expect(w.text()).toContain('€ 30.00'); // saldo = daily non pagato
    expect(w.text()).toContain('€ 620.00'); // incassato = 320 + 300
    expect(w.text()).toContain('Carta'); // PAYMENT_METHOD_LABEL['card']
  });

  it('mostra la nota di prelazione aperta nella card abbonamento', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('Prelazione');
    expect(w.text()).toContain('Estate 2028');
    expect(w.text()).toContain('2028-04-30');
  });
```

- [ ] **Step 2: Esegui i test FE e verifica il fallimento**

Run: `corepack pnpm --filter web-staff test CustomerDetailView`
Expected: FAIL — `PAYMENT_METHOD_LABEL` inesistente, testo `'Centro · A12'`/`'Comfort'`/`'STAGIONI'`/`'3 prenotazioni'`/`'Confermata'`/`'€ 30.00'`/`'Carta'` non presente nelle card attuali.

- [ ] **Step 3: Aggiungi `PAYMENT_METHOD_LABEL`**

In `apps/web-staff/src/lib/statusMaps.ts`, aggiorna l'import type e aggiungi la mappa:

```ts
import type { BookingType, PaymentMethod, PaymentStatus } from '@coralyn/contracts';
```

In fondo al file:

```ts
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Contanti',
  card: 'Carta',
  transfer: 'Bonifico',
  other: 'Altro',
};
```

- [ ] **Step 4: Ridisegna `CustomerSubscriptionsCard.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { SectionCard, Callout, Badge, Icon } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';

const props = defineProps<{ bookings: CustomerBookingDTO[] }>();
const subs = computed(() => props.bookings.filter((b) => b.type === 'subscription'));
</script>
<template>
  <SectionCard title="Abbonamento e anzianità" icon="star">
    <p v-if="subs.length === 0" class="text-sm text-[var(--color-text-muted)]">Nessun abbonamento.</p>
    <ul v-else class="flex flex-col gap-3">
      <li v-for="b in subs" :key="b.id" class="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3.5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--color-raised)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--color-text-2nd)]">{{ b.sectorName ?? '—' }} · {{ b.umbrellaLabel }}</span>
              <Badge v-if="b.packageName" tone="brand">{{ b.packageName }}</Badge>
              <Badge v-if="b.renewed" tone="success">Rinnovato</Badge>
            </div>
            <div class="mt-1.5 text-[13px] font-semibold text-[var(--color-text)]">{{ b.seasonName ?? '—' }} · posto riservato</div>
            <div class="mt-0.5 text-xs text-[var(--color-text-muted)]">Abbonato da {{ b.seniority ?? 1 }} {{ (b.seniority ?? 1) === 1 ? 'stagione' : 'stagioni consecutive' }}</div>
          </div>
          <div class="shrink-0 text-right">
            <div class="text-[26px] font-bold leading-none tabular-nums text-[var(--color-text)]">{{ b.seniority ?? 1 }}</div>
            <div class="mt-1 text-[10px] font-semibold uppercase tracking-[.06em] text-[var(--color-text-muted)]">{{ (b.seniority ?? 1) === 1 ? 'STAGIONE' : 'STAGIONI' }}</div>
          </div>
        </div>
        <Callout v-if="b.prelazione" tone="warm" class="mt-3">
          <template #icon><Icon name="clock" :size="15" /></template>
          Prelazione aperta per {{ b.prelazione.destinationSeasonName }} · scade {{ b.prelazione.deadline }}
        </Callout>
      </li>
    </ul>
  </SectionCard>
</template>
```

- [ ] **Step 5: Ridisegna `CustomerHistoryCard.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { SectionCard, Badge } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { TYPE_LABEL } from '@/lib/statusMaps';

const props = defineProps<{ bookings: CustomerBookingDTO[] }>();

// Raggruppa per stagione (già ordinati desc dal server); gruppi ordinati dal più recente.
const groups = computed(() => {
  const map = new Map<string, CustomerBookingDTO[]>();
  for (const b of props.bookings) {
    const key = b.seasonName ?? 'Senza stagione';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b);
  }
  return [...map.entries()];
});
</script>
<template>
  <SectionCard title="Storico prenotazioni" icon="calendar" icon-bg="var(--color-accent-tint)" icon-ink="var(--color-accent)">
    <p v-if="bookings.length === 0" class="text-sm text-[var(--color-text-muted)]">Nessuna prenotazione.</p>
    <div v-for="[season, rows] in groups" :key="season" class="mb-4 last:mb-0">
      <div class="mb-1.5 flex items-center justify-between">
        <span class="text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">{{ season }}</span>
        <span class="text-[11px] text-[var(--color-text-muted)]">{{ rows.length }} prenotazioni</span>
      </div>
      <ul class="flex flex-col gap-1.5">
        <li v-for="b in rows" :key="b.id"
            :class="['flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-[13px]', b.status === 'cancelled' ? 'opacity-50' : '']">
          <span class="flex min-w-0 items-center gap-2">
            <Badge tone="brand">{{ TYPE_LABEL[b.type] }}</Badge>
            <span class="inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--color-raised)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--color-text-2nd)]">{{ b.sectorName ?? '—' }} · {{ b.umbrellaLabel }}</span>
          </span>
          <span class="flex shrink-0 items-center gap-2">
            <span class="tabular-nums font-semibold text-[var(--color-text)]">{{ `€ ${b.totalPrice.toFixed(2)}` }}</span>
            <Badge v-if="b.status === 'cancelled'" tone="danger">Annullata</Badge>
            <Badge v-else tone="success">Confermata</Badge>
          </span>
        </li>
      </ul>
    </div>
  </SectionCard>
</template>
```

- [ ] **Step 6: Ridisegna `CustomerPaymentsCard.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { SectionCard, StatTile, DataTable, Badge, formatEuro } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { PAY_LABEL, PAY_TONE, PAYMENT_METHOD_LABEL } from '@/lib/statusMaps';

const props = defineProps<{ bookings: CustomerBookingDTO[] }>();
const active = computed(() => props.bookings.filter((b) => b.status !== 'cancelled'));
const balance = computed(() => active.value.reduce((s, b) => s + (b.totalPrice - b.amountCollected), 0));
const collected = computed(() => active.value.reduce((s, b) => s + b.amountCollected, 0));

const cols = [
  { key: 'period', label: 'Periodo' },
  { key: 'umbrella', label: 'Ombrellone' },
  { key: 'amount', label: 'Importo', align: 'right' as const, numeric: true },
  { key: 'method', label: 'Metodo' },
  { key: 'status', label: 'Stato' },
];
</script>
<template>
  <SectionCard title="Pagamenti e saldo" icon="euro">
    <p v-if="bookings.length === 0" class="text-sm text-[var(--color-text-muted)]">Nessuna prenotazione.</p>
    <template v-else>
      <div class="mb-4 grid grid-cols-2 gap-2.5">
        <StatTile layout="label-first" tone="accent" label="Saldo aperto" :value="formatEuro(balance)" />
        <StatTile layout="label-first" label="Incassato stagione" :value="formatEuro(collected)" />
      </div>
      <DataTable :columns="cols" :rows="(active as unknown as Record<string, unknown>[])" :row-key="(r) => (r as unknown as CustomerBookingDTO).id">
        <template #cell-period="{ row }">{{ (row as unknown as CustomerBookingDTO).seasonName ?? (row as unknown as CustomerBookingDTO).startDate }}</template>
        <template #cell-umbrella="{ row }">{{ (row as unknown as CustomerBookingDTO).sectorName ?? '—' }} · {{ (row as unknown as CustomerBookingDTO).umbrellaLabel }}</template>
        <template #cell-amount="{ row }">{{ formatEuro((row as unknown as CustomerBookingDTO).totalPrice) }}</template>
        <template #cell-method="{ row }">{{ (row as unknown as CustomerBookingDTO).paymentMethod ? PAYMENT_METHOD_LABEL[(row as unknown as CustomerBookingDTO).paymentMethod!] : '—' }}</template>
        <template #cell-status="{ row }"><Badge :tone="PAY_TONE[(row as unknown as CustomerBookingDTO).paymentStatus]">{{ PAY_LABEL[(row as unknown as CustomerBookingDTO).paymentStatus] }}</Badge></template>
      </DataTable>
    </template>
  </SectionCard>
</template>
```

- [ ] **Step 7: Porta la card «Anagrafica e contatti» a `SectionCard`**

In `apps/web-staff/src/features/customers/CustomerDetailView.vue`:

(a) aggiorna l'import: `import { Card, Avatar, Button, Field, Input, Textarea, Icon, SectionCard } from '@coralyn/ui-kit';`

(b) sostituisci il blocco `<Card class="mb-4"> <form ...> ... </form> </Card>` (la card Anagrafica) con `SectionCard` (header standard + `#action` = «Salva»). L'header di testo interno («Anagrafica e contatti») viene rimosso perché ora è il titolo della `SectionCard`:

```vue
      <SectionCard title="Anagrafica e contatti" icon="users" class="mb-4">
        <template #action>
          <Button type="submit" form="anagrafica-form" variant="ghost"><Icon name="check" :size="14" />Salva</Button>
        </template>
        <form id="anagrafica-form" @submit.prevent="save">
          <div class="grid grid-cols-2 gap-x-7 gap-y-[18px]">
            <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Nome</div><div class="text-sm font-medium text-[var(--color-text)]">{{ customer.firstName }}</div></div>
            <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Cognome</div><div class="text-sm font-medium text-[var(--color-text)]">{{ customer.lastName }}</div></div>
            <Field label="Telefono"><Input name="phone" v-model="phone" numeric /></Field>
            <Field label="Email"><Input name="email" v-model="email" type="email" /></Field>
            <div class="col-span-2"><Field label="Note"><Textarea name="notes" v-model="notes" /></Field></div>
          </div>
        </form>
      </SectionCard>
```

> Nota: il pulsante «Salva» usa `form="anagrafica-form"` perché ora è fuori dal `<form>` (nell'header). Il test esistente `'modifica il telefono...'` fa `w.find('form').trigger('submit.prevent')`, che resta valido.

L'header cliente (Avatar + nome + Modifica) resta una `Card` semplice invariata.

- [ ] **Step 8: Esegui i test FE e verifica che passino**

Run: `corepack pnpm --filter web-staff test CustomerDetailView`
Expected: PASS.

Run: `corepack pnpm --filter web-staff test`
Expected: PASS — web-staff 156 (+ eventuali nuovi assert; nessuna regressione).

- [ ] **Step 9: Typecheck**

Run: `corepack pnpm --filter web-staff typecheck`
Expected: EXIT 0.

- [ ] **Step 10: Commit**

```bash
git add apps/web-staff/src/lib/statusMaps.ts apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue apps/web-staff/src/features/customers/CustomerHistoryCard.vue apps/web-staff/src/features/customers/CustomerPaymentsCard.vue apps/web-staff/src/features/customers/CustomerDetailView.vue apps/web-staff/src/mocks/server.ts apps/web-staff/src/features/customers/CustomerDetailView.spec.ts
git commit -m "feat(web-staff): Scheda cliente ridisegnata fedele al mock (SectionCard/Callout/StatTile + chip settore/pacchetto)"
```

---

## Verifica finale (dopo i 3 commit)

- [ ] Suite complete verdi, nessuna regressione sotto baseline:
  - `corepack pnpm --filter @coralyn/ui-kit test` → **65** (55 + 10)
  - `corepack pnpm --filter @coralyn/api test` → **113** (111 + 2)
  - `corepack pnpm --filter @coralyn/api test:e2e` → **159** (158 + 1)
  - `corepack pnpm --filter web-staff test` → **≥156**
  - `corepack pnpm --filter web-staff typecheck` → EXIT 0
- [ ] Verifica LIVE in dev (dopo rebuild container `docker compose --profile full up -d --build api web`): apri `/customers/<id>` e confronta le 3 card col mock (numero-grande anzianità, callout prelazione ambra, storico raggruppato con conteggi, 2 StatTile + tabella pagamenti con metodo tradotto).
- [ ] Review whole-branch finale (opus) prima di proporre il merge.

---

## Self-Review (eseguita in fase di stesura)

- **Spec coverage:** §2.1 `SectionCard`/`Callout` → Task 1; §2.2 `StatTile` tone/layout → Task 1; §3 backend `packageName`/`sectorName` → Task 2; §4.1/4.2/4.3 le 3 card → Task 3; §4 Anagrafica→SectionCard → Task 3 Step 7; `PAYMENT_METHOD_LABEL` → Task 3 Step 3; §5 piano di test (ui-kit/e2e/unit/FE) → coperto in ogni task. Token non hex → tutti i valori mappati a token esistenti (nessun nuovo token). Read-only → nessuna nuova azione di scrittura.
- **Placeholder scan:** nessun TBD/TODO; ogni step di codice contiene il codice completo.
- **Type consistency:** `CustomerBookingEnrichment` (`packageName?`/`sectorName?`) coerente tra projection e service; `PaymentMethod` union `cash|card|transfer|other`; `BookingStatus` `confirmed|cancelled`; DataTable cast idiomatico `as unknown as CustomerBookingDTO` come in `BookingsView.vue`; `formatEuro` firma `(number)=>string`.
- **Rischi noti gestiti:** e2e packageName usa fascia POMERIGGIO su A13 (disgiunta dalla subscription MATTINA del test prelazione → no anti-overlap D-030); il rate pomeriggio (40) prezza il daily senza pacchetto (no 422 NO_RATE). Retro-compat `StatTile`: ramo `value-first` = markup originale invariato.
