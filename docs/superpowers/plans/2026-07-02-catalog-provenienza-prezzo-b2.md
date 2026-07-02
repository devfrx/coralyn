# Provenienza prezzo (Slice B2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rendere il prezzo *spiegabile* — il quote espone la Rate vincente (`matchedRate`), il modale prenotazione mostra "quale tariffa" ha prodotto il prezzo, e l'editor Listino ordina le tariffe per specificità con una legenda di precedenza (ADR-0032), senza toccare la logica di prezzo.

**Architecture:** tre layer coesi, **un commit per layer**, dal branch `catalog-provenienza-prezzo` (già creato da `main`). (1) Backend: `RateRow` acquista `id`; `BookingQuoteDTO` acquista `matchedRate: RateDTO`; `priceWithin`/`quote` la valorizzano via un mapper `rateRowToDTO` (null→undefined). (2) FE modale: riga "Tariffa applicata" composta dal FE. (3) FE editor: tabella ordinata per specificità + legenda.

**Tech Stack:** NestJS + Prisma (engine puro `resolvePrice`); Vue 3 `<script setup>` + composable `useBookingQuote` (TanStack) + MSW; Jest (api unit + e2e), Vitest (web-staff).

## Global Constraints

- **Convenzione:** codice/DB in inglese; UI/documentazione in italiano. Le label di presentazione si compongono **nel FE**, mai nel server.
- **Baseline test da NON regredire** (post-B1 su `main`, da riverificare live): **api unit 88 · api e2e 125 · web-staff 132 · ui-kit 55.** I conteggi devono solo crescere; nessun test rimosso.
- **Prezzo server-autoritativo invariato** (ADR-0032 §7): `matchedRate` è **informativo**; la create continua a ricalcolare e a non fidarsi del client. Nessun cambiamento alla logica di prezzo/precedenza.
- **Nessuna migrazione, nessun nuovo ADR** (incremento su ADR-0032).
- **`matchedRate` è `RateDTO`** (riuso del tipo esistente, DRY): id + dimensioni nullable (wildcard) + `price`/`unit` + `seasonId`. **`RateRow` è la forma piatta dell'engine** (`price:number`, date/id come stringhe, dimensioni `… | null`) — NON un `Rate` Prisma: non usare `toRateDTO(r: Rate, …)` sulla `RateRow`.
- **Dopo aver toccato `@coralyn/contracts`:** `corepack pnpm --filter @coralyn/contracts build` **e** `rm -rf apps/web-staff/node_modules/.vite` prima dei test web-staff.
- **Comandi test** (dalla root):
  - api unit: `corepack pnpm --filter @coralyn/api test`
  - api e2e (DB su `localhost:5433`): `corepack pnpm --filter @coralyn/api test:e2e`
  - web-staff: `corepack pnpm --filter @coralyn/web-staff test` · typecheck: `corepack pnpm --filter @coralyn/web-staff typecheck`
  - ui-kit: `corepack pnpm --filter @coralyn/ui-kit test`

---

## Task 1: Layer 1 — Backend: `matchedRate` nel quote

**Files:**
- Modify: `packages/contracts/src/index.ts` (`BookingQuoteDTO` +`matchedRate`)
- Modify: `apps/api/src/catalog/pricing.engine.ts` (`RateRow` +`id`)
- Modify: `apps/api/src/catalog/pricing.engine.spec.ts` (factory `rate()` +`id` default)
- Modify: `apps/api/src/catalog/catalog.service.ts` (`toRateRow` +`id`; nuovo `rateRowToDTO`; `QuoteOutcome` +`matchedRate`; `priceWithin` la valorizza)
- Modify: `apps/api/src/bookings/bookings.service.ts` (`quote` ritorna `matchedRate`; refactor `priceOrThrow`→`throwPriceError`)
- Modify: `apps/api/test/bookings.e2e-spec.ts` (quote asserisce `matchedRate`)

**Interfaces:**
- Consumes: `resolvePrice(ctx, rates): { ok:true; totalPrice; rate: RateRow } | { ok:false; reason:'NO_RATE' }`; `toRateRow(r: Rate): RateRow`; `QuoteOutcome`; `RateDTO`.
- Produces:
  - `RateRow` con campo `id: string` (l'engine lo ignora).
  - `rateRowToDTO(row: RateRow, seasonId: string): RateDTO` (mapper puro, null→undefined).
  - `QuoteOutcome` successo: `{ ok:true; totalPrice:number; matchedRate: RateDTO }`.
  - `CatalogService.priceWithin(tx, ctx): Promise<QuoteOutcome>` che valorizza `matchedRate`.
  - `BookingsService.quote(input): Promise<BookingQuoteDTO>` con `{ totalPrice, matchedRate }`.
  - `BookingQuoteDTO { totalPrice: number; matchedRate: RateDTO }`.

### 1.1 — Contratti

- [ ] **Step 1: Aggiorna `BookingQuoteDTO`** — `packages/contracts/src/index.ts`

Sostituisci l'interfaccia (righe ~139-141):
```ts
/** Preventivo calcolato dall'engine + provenienza (la Rate vincente, ADR-0032). */
export interface BookingQuoteDTO {
  totalPrice: number;    // EUR, 2 decimali
  matchedRate: RateDTO;  // la Rate che ha prodotto il prezzo (sempre presente: il quote risponde 200 solo se ok)
}
```
(`RateDTO` è già dichiarato più sopra nel file — nessun import.)

- [ ] **Step 2: Rebuild contracts**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build OK.

### 1.2 — Engine: `RateRow.id` (TDD)

- [ ] **Step 3: Aggiorna il factory dello spec (RED)** — `apps/api/src/catalog/pricing.engine.spec.ts`

Nel factory `rate()` (riga ~14) aggiungi un `id` di default così tutti i literal lo ereditano:
```ts
const rate = (over: Partial<RateRow>): RateRow => ({
  id: 'r-test', type: null, sectorId: null, rowId: null, packageId: null, timeSlotId: null,
  periodStart: null, periodEnd: null, price: 0, unit: 'day', ...over,
});
```
Aggiungi inoltre un test che verifica che la Rate vincente ritornata porta l'`id`:
```ts
it('ritorna la Rate vincente con il suo id (provenienza B2)', () => {
  const rPkg = rate({ id: 'r-pkg', packageId: 'pkg-1', price: 50 });
  const res = resolvePrice(ctx({ packageId: 'pkg-1' }), [CATCH_ALL, rPkg]);
  expect(res.ok).toBe(true);
  if (res.ok) expect(res.rate.id).toBe('r-pkg');
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `corepack pnpm --filter @coralyn/api test -- pricing.engine`
Expected: FAIL — `RateRow` non ha ancora `id` (errore di tipo/compilazione sullo spec, e/o `res.rate.id` undefined).

- [ ] **Step 5: Aggiungi `id` a `RateRow`** — `apps/api/src/catalog/pricing.engine.ts`

Nella `interface RateRow` (riga ~15) aggiungi come prima proprietà:
```ts
export interface RateRow {
  id: string;            // id della Rate DB (ignorato dall'engine; serve alla provenienza B2)
  type: BookingType | null;
  // ...resto invariato
```
Non toccare `isApplicable`/`specificity`/`resolvePrice`: l'`id` non entra nella logica.

- [ ] **Step 6: Run test to verify it passes**

Run: `corepack pnpm --filter @coralyn/api test -- pricing.engine`
Expected: PASS.

### 1.3 — Service: mapper + `matchedRate`

- [ ] **Step 7: `toRateRow` copia l'id + nuovo mapper `rateRowToDTO`** — `apps/api/src/catalog/catalog.service.ts`

In `toRateRow` (riga ~27) aggiungi `id: r.id,` come prima proprietà. Subito sotto la funzione, aggiungi il mapper puro (import `RateDTO` da `@coralyn/contracts` in testa se assente):
```ts
/** RateRow (forma piatta engine) → RateDTO (null→undefined). NON usa toRateDTO (che consuma un Rate Prisma). */
function rateRowToDTO(row: RateRow, seasonId: string): RateDTO {
  return {
    id: row.id,
    seasonId,
    type: row.type ?? undefined,
    sectorId: row.sectorId ?? undefined,
    rowId: row.rowId ?? undefined,
    packageId: row.packageId ?? undefined,
    timeSlotId: row.timeSlotId ?? undefined,
    periodStart: row.periodStart ?? undefined,
    periodEnd: row.periodEnd ?? undefined,
    price: row.price,
    unit: row.unit,
  };
}
```

- [ ] **Step 8: `QuoteOutcome` successo acquista `matchedRate`; `priceWithin` la valorizza** — `apps/api/src/catalog/catalog.service.ts`

Aggiorna il tipo (riga ~19):
```ts
export type QuoteOutcome =
  | { ok: true; totalPrice: number; matchedRate: RateDTO }
  | { ok: false; reason: 'UMBRELLA_NOT_FOUND' | 'NO_SEASON' | 'NO_RATE' };
```
In `priceWithin`, nel ritorno di successo (riga ~124-125), passa la provenienza. `seasons[0].id` è il `seasonId` risolto nella stessa funzione:
```ts
    if (!result.ok) return { ok: false, reason: 'NO_RATE' };
    return { ok: true, totalPrice: result.totalPrice, matchedRate: rateRowToDTO(result.rate, seasons[0].id) };
```

### 1.4 — Bookings: `quote` ritorna la provenienza

- [ ] **Step 9: refactor `priceOrThrow` → `throwPriceError` (narrowing) e usa in create+quote** — `apps/api/src/bookings/bookings.service.ts`

Sostituisci `priceOrThrow` (righe ~48-56) con un helper che lancia e restringe il tipo:
```ts
  /** Lancia il 422 di dominio col messaggio IT per un esito di pricing fallito. */
  private throwPriceError(outcome: Extract<QuoteOutcome, { ok: false }>): never {
    if (outcome.reason === 'UMBRELLA_NOT_FOUND')
      throw new UnprocessableEntityException('Ombrellone non valido');
    if (outcome.reason === 'NO_SEASON')
      throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
    throw new UnprocessableEntityException('Nessuna tariffa applicabile: configurare il listino'); // NO_RATE
  }
```
Aggiorna la `quote` (righe ~59-75) per ritornare anche `matchedRate`:
```ts
  async quote(input: QuoteBookingInput): Promise<BookingQuoteDTO> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const { startDate, endDate } = await this.deriveInterval(tx, input);
      const outcome = await this.catalog.priceWithin(tx, {
        umbrellaId: input.umbrellaId,
        timeSlotId: input.timeSlotId,
        startDate,
        endDate,
        type: input.type,
        packageId: input.packageId ?? null,
      });
      if (!outcome.ok) this.throwPriceError(outcome);
      return { totalPrice: outcome.totalPrice, matchedRate: outcome.matchedRate };
    });
  }
```
Aggiorna l'altro chiamante (create, riga ~190 circa): dove prima faceva `const totalPrice = this.priceOrThrow(outcome);`, ora:
```ts
      if (!outcome.ok) this.throwPriceError(outcome);
      const totalPrice = outcome.totalPrice;
```
(cioè cattura `outcome` da `priceWithin`, poi `throwPriceError` + accesso a `outcome.totalPrice`; l'union si restringe correttamente). Importa `BookingQuoteDTO` da `@coralyn/contracts` in testa se assente. Il controller (`bookings.controller.ts:17`) ritorna già `Promise<BookingQuoteDTO>`: nessun cambiamento.

- [ ] **Step 10: Run api unit — verde**

Run: `corepack pnpm --filter @coralyn/api test`
Expected: api unit **≥ 89** (aggiunge il test engine su `id`), nessun rosso.

### 1.5 — e2e quote

- [ ] **Step 11: Write the failing e2e** — `apps/api/test/bookings.e2e-spec.ts`

Trova il test del quote esistente (cerca `bookings/quote`). Aggiungi accanto un caso che asserisce la provenienza (riusa il setup/tokens già presenti nel file; adatta i nomi delle variabili di seed a quelle in uso — `ids.slotMorning`, `seasonId`/catch-all già seedata):
```ts
it('il quote espone matchedRate (provenienza): la catch-all a 25/giorno', async () => {
  const res = await request(app.getHttpServer())
    .get(`/api/bookings/quote?umbrellaId=${ids.u1}&timeSlotId=${ids.slotMorning}&type=daily&startDate=<DATA_IN_STAGIONE>`)
    .set(...bearer(token1)).expect(200);
  expect(res.body.totalPrice).toBe(25);
  expect(res.body.matchedRate).toMatchObject({ price: 25, unit: 'day' });
  expect(res.body.matchedRate.id).toEqual(expect.any(String));
  expect(res.body.matchedRate.timeSlotId).toBeUndefined(); // catch-all: dimensione null → assente
});
```
Sostituisci `<DATA_IN_STAGIONE>` con una data coperta dalla stagione/catch-all già usata dal quote-test esistente nel file (copia la data che quel test usa). Se il file non ha già una catch-all seedata per il quote, replica il pattern del quote-test esistente (che passa da 200) e adatta l'asserzione a `matchedRate`.

- [ ] **Step 12: Run the e2e**

Run: `corepack pnpm --filter @coralyn/api test:e2e -- bookings`
Expected: prima FAIL (matchedRate assente) se eseguito prima degli step di implementazione; con gli step 1-9 fatti → PASS. Poi la suite intera:

Run: `corepack pnpm --filter @coralyn/api test:e2e`
Expected: api e2e **≥ 126**, nessun rosso.

- [ ] **Step 13: Commit**

```bash
git add packages/contracts/src/index.ts apps/api/src/catalog/pricing.engine.ts \
  apps/api/src/catalog/pricing.engine.spec.ts apps/api/src/catalog/catalog.service.ts \
  apps/api/src/bookings/bookings.service.ts apps/api/test/bookings.e2e-spec.ts
git commit -m "feat(catalog): il quote espone matchedRate (provenienza prezzo, ADR-0032)

- RateRow acquista id (ignorato dall'engine); toRateRow lo copia
- rateRowToDTO: RateRow piatta → RateDTO (null→undefined)
- QuoteOutcome/priceWithin valorizzano matchedRate; BookingQuoteDTO la espone
- bookings.quote ritorna { totalPrice, matchedRate }; priceOrThrow→throwPriceError (narrowing)
- prezzo server-autoritativo invariato; e2e quote asserisce matchedRate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Layer 2 — FE modale: "Tariffa applicata"

**Files:**
- Modify: `apps/web-staff/src/features/map/MapView.vue` (label provenienza sotto il prezzo)
- Modify: `apps/web-staff/src/mocks/server.ts` (`/bookings/quote` ritorna `matchedRate`)
- Modify: `apps/web-staff/src/features/map/MapView.spec.ts` (asserisce la label)

**Interfaces:**
- Consumes: `BookingQuoteDTO.matchedRate: RateDTO` (Task 1); `map.timeSlots`/`map.sectors`/`packages` (nomi già in vista); `formatEuro`/`unitLabel`.
- Produces: computed `matchedRateLabel: string` in MapView e la riga di template.

- [ ] **Step 1: MSW quote ritorna `matchedRate`** — `apps/web-staff/src/mocks/server.ts`

Aggiorna l'handler `/api/bookings/quote` (righe ~194-198). `matchedRate` è un `RateDTO`; per il caso base è la catch-all (dimensioni assenti), col `packageId` quando presente:
```ts
http.get('/api/bookings/quote', ({ request }) => {
  const p = new URL(request.url).searchParams;
  const seasonId = 'se-1';
  if (p.get('type') === 'subscription')
    return HttpResponse.json({ totalPrice: 800, matchedRate: { id: 'ra-sub', seasonId, price: 800, unit: 'period', type: 'subscription' } });
  const pkg = p.get('packageId');
  if (pkg)
    return HttpResponse.json({ totalPrice: 35, matchedRate: { id: 'ra-pkg', seasonId, price: 35, unit: 'day', packageId: pkg } });
  return HttpResponse.json({ totalPrice: 28, matchedRate: { id: 'ra-1', seasonId, price: 28, unit: 'day' } }); // catch-all
}),
```
(import `RateDTO` non necessario: `HttpResponse.json` non è tipizzato contro il DTO.)

- [ ] **Step 2: Write the failing test** — `apps/web-staff/src/features/map/MapView.spec.ts`

Aggiungi un `it` che apre il modale "Nuova prenotazione" e verifica la riga provenienza. Riusa l'idiom del test esistente che apre il drawer + modale (findComponent UmbrellaCell → click; bottone "Nuova prenotazione" → click; leggi da `document.body`). Casi:
```ts
it('mostra la tariffa applicata (provenienza) nel modale', async () => {
  const w = mountApp(MapView, { attachTo: document.body });
  await settle(); // helper locale flushPromises+timeout come negli altri test
  // apri drawer sul primo ombrellone libero + modale "Nuova prenotazione" (riusa i passi del test esistente)
  // ... (stessi trigger del test "apre il drawer ... Nuova prenotazione")
  expect(document.body.textContent).toContain('Tariffa applicata');
  expect(document.body.textContent).toContain('Tariffa base del listino'); // catch-all (nessuna dimensione)
});
```
Se il modale include un `packageId` nel quote params quando si sceglie un pacchetto, un secondo caso può selezionare un pacchetto e asserire che compare il nome del pacchetto invece di "Tariffa base".

- [ ] **Step 3: Run test to verify it fails**

Run: `corepack pnpm --filter @coralyn/contracts build && rm -rf apps/web-staff/node_modules/.vite && corepack pnpm --filter @coralyn/web-staff test -- MapView`
Expected: FAIL — la label non esiste ancora.

- [ ] **Step 4: Implementa `matchedRateLabel` + riga template** — `apps/web-staff/src/features/map/MapView.vue`

Nello script, dopo `const { data: quote, ... } = useBookingQuote(quoteParams);`, aggiungi lookups e il computed. Usa i nomi già disponibili (`timeSlots`, `sectors`, `packages`):
```ts
const packagesById = computed(() => new Map((packages.value ?? []).map((p) => [p.id, p.name])));
const slotsById = computed(() => new Map(timeSlots.value.map((s) => [s.id, s.name])));
const sectorsById = computed(() => new Map(sectors.value.map((s) => [s.id, s.name])));

const matchedRateLabel = computed<string>(() => {
  const r = quote.value?.matchedRate;
  if (!r) return '';
  const parts: string[] = [];
  if (r.timeSlotId) parts.push(slotsById.value.get(r.timeSlotId) ?? 'Fascia');
  if (r.packageId) parts.push(packagesById.value.get(r.packageId) ?? 'Pacchetto');
  if (r.sectorId) parts.push(sectorsById.value.get(r.sectorId) ?? 'Settore');
  if (r.type) parts.push(TYPE_LABEL[r.type] ?? r.type);
  const dims = parts.length ? parts.join(' · ') : 'Tariffa base del listino';
  return `${dims} — ${formatEuro(r.price)}${r.unit === 'day' ? '/g' : ' forfait'}`;
});
```
Definisci `TYPE_LABEL` (mappa BookingType→IT) accanto agli altri map se non esiste (`{ daily:'Giornaliera', periodic:'Periodica', subscription:'Abbonamento' }`). Nel template, sotto il blocco "Prezzo" (`:334-337`), aggiungi (solo quando il quote è ok):
```vue
<p v-if="!quoteLoading && !quoteError && quote" class="mt-1 text-[12px] text-[var(--color-text-muted)]">
  Tariffa applicata: {{ matchedRateLabel }}
</p>
```

- [ ] **Step 5: Run test + suite + typecheck**

Run:
```bash
corepack pnpm --filter @coralyn/web-staff test -- MapView
corepack pnpm --filter @coralyn/web-staff test
corepack pnpm --filter @coralyn/web-staff typecheck
```
Expected: MapView verde; web-staff **≥ 133**; typecheck pulito.

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/map/MapView.vue apps/web-staff/src/mocks/server.ts \
  apps/web-staff/src/features/map/MapView.spec.ts
git commit -m "feat(map): il modale mostra la tariffa applicata (provenienza prezzo)

- matchedRateLabel: label composta dal FE dai nomi già in vista (fascia/pacchetto/settore/tipo)
- catch-all → 'Tariffa base del listino'; sempre visibile sotto il prezzo
- MSW /bookings/quote ritorna matchedRate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Layer 3 — FE editor: precedenza (ordine + legenda)

**Files:**
- Create: `apps/web-staff/src/features/pricing/rateSpecificity.ts`
- Create: `apps/web-staff/src/features/pricing/rateSpecificity.spec.ts`
- Modify: `apps/web-staff/src/features/pricing/PricingView.vue` (ordina la tabella + legenda)
- Modify: `apps/web-staff/src/features/pricing/PricingView.spec.ts` (ordine + legenda)

**Interfaces:**
- Consumes: `RateDTO` (dimensioni già esposte); la lista `rates` in `PricingView`.
- Produces: `rateSpecificity(r: RateDTO): number` (rank: più alto = più specifico, riflette l'ordine ADR-0032).

### 3.1 — Funzione pura (TDD)

- [ ] **Step 1: Write the failing test** — `apps/web-staff/src/features/pricing/rateSpecificity.spec.ts`

```ts
import { describe, it, expect } from 'vitest';
import type { RateDTO } from '@coralyn/contracts';
import { rateSpecificity } from './rateSpecificity';

const base = (over: Partial<RateDTO>): RateDTO => ({ id: 'r', seasonId: 's', price: 10, unit: 'day', ...over });

describe('rateSpecificity', () => {
  it('la catch-all (nessuna dimensione) è la meno specifica', () => {
    expect(rateSpecificity(base({}))).toBe(0);
  });
  it('il periodo (priorità 1) batte la fila (priorità 2)', () => {
    const period = rateSpecificity(base({ periodStart: '2026-08-01', periodEnd: '2026-08-10' }));
    const row = rateSpecificity(base({ rowId: 'row-1' }));
    expect(period).toBeGreaterThan(row);
  });
  it('la fila batte il settore batte il pacchetto batte la fascia batte il tipo', () => {
    const row = rateSpecificity(base({ rowId: 'r1' }));
    const sector = rateSpecificity(base({ sectorId: 's1' }));
    const pkg = rateSpecificity(base({ packageId: 'p1' }));
    const slot = rateSpecificity(base({ timeSlotId: 't1' }));
    const type = rateSpecificity(base({ type: 'daily' }));
    expect(row).toBeGreaterThan(sector);
    expect(sector).toBeGreaterThan(pkg);
    expect(pkg).toBeGreaterThan(slot);
    expect(slot).toBeGreaterThan(type);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @coralyn/web-staff test -- rateSpecificity`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementa** — `apps/web-staff/src/features/pricing/rateSpecificity.ts`

Peso posizionale che riflette l'ordine lessicografico ADR-0032 (periodo › fila › settore › pacchetto › fascia › tipo). Bit più significativo = dimensione dominante:
```ts
import type { RateDTO } from '@coralyn/contracts';

/** Rank di specificità (ADR-0032): più alto = più specifico. Ordine: periodo › fila › settore › pacchetto › fascia › tipo. */
export function rateSpecificity(r: RateDTO): number {
  const bits = [
    r.periodStart != null, // 1
    r.rowId != null,       // 2
    r.sectorId != null,    // 3
    r.packageId != null,   // 4
    r.timeSlotId != null,  // 5
    r.type != null,        // 6
  ];
  return bits.reduce((acc, present, i) => acc + (present ? 1 << (bits.length - 1 - i) : 0), 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter @coralyn/web-staff test -- rateSpecificity`
Expected: PASS.

### 3.2 — Editor: ordinamento + legenda

- [ ] **Step 5: Write the failing test** — `apps/web-staff/src/features/pricing/PricingView.spec.ts`

Aggiungi (riusa `mountApp`/`settle`/MSW già in uso nel file). Fai in modo che l'MSW `rates` restituisca almeno una catch-all + una con dimensione (o aggiungi via `server.use`); poi verifica che nella tabella la più specifica preceda la catch-all e che la legenda sia presente:
```ts
it('ordina le tariffe per specificità e mostra la legenda di precedenza', async () => {
  server.use(
    http.get('/api/rates', () => HttpResponse.json([
      { id: 'ra-catch', seasonId: 'se-1', price: 20, unit: 'day' },
      { id: 'ra-slot', seasonId: 'se-1', price: 40, unit: 'day', timeSlotId: 'f-pom' },
    ])),
  );
  const w = mountApp(PricingView, { attachTo: document.body });
  await settle();
  const rows = w.findAll('tbody tr');
  const idxSlot = rows.findIndex((r) => r.text().includes('40'));
  const idxCatch = rows.findIndex((r) => r.text().includes('20'));
  expect(idxSlot).toBeLessThan(idxCatch); // la più specifica (fascia) è sopra la catch-all
  expect(w.text()).toContain('vince la più specifica'); // legenda
});
```
(Adatta i selettori `tbody tr`/testo alla struttura reale della `DataTable`; se serve, aggiungi un `data-test` alle righe.)

- [ ] **Step 6: Run test to verify it fails**

Run: `corepack pnpm --filter @coralyn/web-staff test -- PricingView`
Expected: FAIL — nessun ordinamento/legenda.

- [ ] **Step 7: Implementa ordinamento + legenda** — `apps/web-staff/src/features/pricing/PricingView.vue`

Nello script, importa la funzione e crea una lista ordinata (non mutare `rates`):
```ts
import { rateSpecificity } from './rateSpecificity';
// ...
const sortedRates = computed(() =>
  [...(rates.value ?? [])].sort((a, b) => rateSpecificity(b) - rateSpecificity(a)),
);
```
Nel template, il `v-for` della tabella tariffe usa `sortedRates` invece di `rates`. Sopra la tabella (o vicino al bottone "Nuova tariffa") aggiungi la legenda:
```vue
<p class="mb-2 text-[12px] text-[var(--color-text-muted)]">
  Quando più tariffe si applicano, vince la più specifica: periodo › fila › settore › pacchetto › fascia › tipo.
</p>
```

- [ ] **Step 8: Run test + suite + typecheck**

Run:
```bash
corepack pnpm --filter @coralyn/web-staff test -- PricingView
corepack pnpm --filter @coralyn/web-staff test
corepack pnpm --filter @coralyn/web-staff typecheck
```
Expected: PricingView verde; web-staff **≥ Task 2 + 4** (rateSpecificity 3 + ordinamento/legenda 1); typecheck pulito.

- [ ] **Step 9: Commit**

```bash
git add apps/web-staff/src/features/pricing/rateSpecificity.ts \
  apps/web-staff/src/features/pricing/rateSpecificity.spec.ts \
  apps/web-staff/src/features/pricing/PricingView.vue \
  apps/web-staff/src/features/pricing/PricingView.spec.ts
git commit -m "feat(pricing): editor Listino ordina per specificità + legenda di precedenza (ADR-0032)

- rateSpecificity: funzione pura (rank ADR-0032) sui campi di RateDTO
- tabella tariffe ordinata dalla più specifica alla catch-all
- legenda: 'vince la più specifica: periodo › fila › settore › pacchetto › fascia › tipo'
- shadowing dinamico deferred (D-032)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Chiusura dello slice (dopo Task 3)

- [ ] **Verifica finale full-suite (riconta dal vivo):**
```bash
corepack pnpm --filter @coralyn/api test
corepack pnpm --filter @coralyn/api test:e2e
corepack pnpm --filter @coralyn/contracts build && rm -rf apps/web-staff/node_modules/.vite
corepack pnpm --filter @coralyn/web-staff test
corepack pnpm --filter @coralyn/web-staff typecheck
corepack pnpm --filter @coralyn/ui-kit test
```
Attesi: api unit **≥ 89** · api e2e **≥ 126** · web-staff **≥ 137** · ui-kit **55** (invariato). Zero rossi.

- [ ] **Verifica live in dev (REBUILD OBBLIGATORIO — gotcha handoff §5):**
```bash
docker compose --profile full up -d --build api web
```
Poi: login (`localhost:8080`), modale prenotazione → la riga "Tariffa applicata" mostra la provenienza; editor Listino → tariffe ordinate per specificità + legenda. Password admin container `coralyn-admin-8473`.

- [ ] **Presenta lo stato all'utente e attendi conferma** prima di procedere a **Slice C "Equipment personalizzato"** (brainstorming+spec, decisione free-form vs entità `EquipmentType`). NON auto-avviare C.

## Self-Review (eseguita)

- **Copertura spec:** L1 `RateRow.id` + `matchedRate` in `BookingQuoteDTO`/`priceWithin`/`quote` + mapper + e2e (§3) ✓; L2 riga provenienza nel modale, label FE, catch-all, MSW (§4) ✓; L3 ordinamento per specificità + legenda, shadowing deferred (§5) ✓. Confini (solo quote, no storiche, no migrazione) rispettati ✓.
- **Placeholder:** i test FE (Task 2 Step 2, Task 3 Step 5) e l'e2e (Task 1 Step 11) indicano di adattare selettori/data e la DATA-in-stagione ai file reali — ogni step ha codice concreto e comandi con output atteso; l'unico valore da copiare (`<DATA_IN_STAGIONE>`) è indicato esplicitamente come "la data del quote-test esistente".
- **Coerenza tipi:** `RateRow.id: string` (Task 1) usato da `rateRowToDTO`→`RateDTO`; `QuoteOutcome.matchedRate: RateDTO` coerente con `BookingQuoteDTO.matchedRate`; `rateSpecificity(r: RateDTO): number` coerente tra spec e uso; `matchedRateLabel` legge `quote.matchedRate` (Task 1). `throwPriceError(outcome): never` sostituisce `priceOrThrow` in entrambi i chiamanti.
