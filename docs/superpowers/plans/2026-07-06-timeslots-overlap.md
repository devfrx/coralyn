# Fasce sovrapposte (D-048) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distinguere onestamente una fascia **occupata da una sua prenotazione** da una fascia **coperta** da una fascia sovrapposta prenotata, eliminando l'etichetta fantasma ("Giornaliero" senza cliente/importo) e abilitando "Giornata intera" come prodotto reale.

**Architecture:** Nuovo `SlotState` `'covered'`. Il map projection passa da "prima prenotazione sovrapposta vince" a **due fasi** (prenotazione diretta `timeSlotId === slot.id` → stato dal tipo; altrimenti overlap con altra fascia → `'covered'`; altrimenti `'free'`) ed espone `coveredBySlot` (fascia coperta → ids fasce copritrici), così l'overlap resta calcolato **solo lato backend**. Il FE rende `'covered'` come spicchio/box neutro "Non disponibile" e, nel drawer, nomina le fasce copritrici col dettaglio della prenotazione (cliente, importo). I report escludono le fasce coperte dall'occupazione (niente doppio conteggio).

**Tech Stack:** TypeScript monorepo pnpm; `@coralyn/contracts` (build in `dist/`); NestJS + ts-jest (projection/reports); Vue 3 `<script setup>` + vitest + @vue/test-utils + MSW (FE); ui-kit theme.css (design tokens).

## Global Constraints

- **pnpm, MAI npm.** Comandi dalla root con `corepack pnpm`. Se pnpm chiede purge senza TTY → `CI=true corepack pnpm install`.
- **`@coralyn/contracts` compila in `dist/` (gitignored):** dopo ogni modifica a `packages/contracts/src/index.ts` → `corepack pnpm --filter @coralyn/contracts build` **prima** di typecheck/test (api E FE). api e2e (ts-jest) type-checka il progetto.
- **api e2e autoritativi con `--runInBand`** (flaky in parallelo su questa macchina). Sintassi: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -- <pattern>`.
- **Gotcha conteggio test:** `apps/web-staff/vitest.config.ts` globa `../../packages/ui-kit/src/**/*.spec.ts` → `UmbrellaCell.spec.ts` conta in ENTRAMBE le suite. Verificare **ui-kit E web-staff**.
- **Baseline da non regredire (branch `feat/timeslots-map`, LIVE):** ui-kit **77** · web-staff **264** · api unit **201** · api e2e **235** · web-platform **16** · typecheck pulito. Questa slice è additiva.
- **`SlotState` = `'free' | 'season' | 'daily' | 'booked' | 'covered'`.** `STATE_LABEL`: free→`Libero`, season→`Abbonato`, daily→`Giornaliero`, booked→`Prenotato`, **covered→`Non disponibile`**.
- **Copy drawer fascia coperta (verbatim):** titolo `Non disponibile`; per ogni fascia copritrice una riga `coperta da {nomeFascia} — {cliente} · € {importo}` (cliente/importo omessi se la prenotazione copritrice non è risolvibile).
- **`coveredBySlot` è OPZIONALE nel tipo** (`coveredBySlot?: Record<string, string[]>`) per non forzare tutte le fixture FE, ma **il projection lo popola sempre** per le fasce coperte. Il FE legge difensivo `?? {}`/`?.`.
- **Il calcolo dell'overlap vive SOLO nel backend** (projection). Il FE non implementa `slotsOverlap`: usa `coveredBySlot`.

## §Verifica pre-implementazione (dalla spec)
- **Pricing full-day:** il listino tariffa già per `timeSlotId` (`priceWithin`) → una fascia "Giornata intera" ha il suo forfait senza modifiche. Nessun cambio in questa slice; nessun test aggiuntivo richiesto (già coperto dai test pricing esistenti, chiave `timeSlotId`).
- **Vincolo DB `booking_no_overlap`** (ADR-0037) già blocca la doppia prenotazione di fasce sovrapposte → il FE che non offre le fasce coperte è coerente con la rete di sicurezza. Nessun cambio.

## File Structure

- `packages/contracts/src/index.ts` — **modifica**: `SlotState` +`'covered'`; `UmbrellaDTO` +`coveredBySlot?`. Rebuild `dist/`.
- `apps/api/src/map/map.projection.ts` — **modifica**: `resolveSlot` a due fasi + popolamento `stateBySlot`/`coveredBySlot`.
- `apps/api/src/map/map.projection.spec.ts` — **modifica**: +test 3-fasce sovrapposte (entrambe le direzioni + `coveredBySlot` + free).
- `apps/api/src/reports/report.projection.ts` — **modifica**: +`occupancyStates(dayMap)` che esclude `covered`.
- `apps/api/src/reports/report.projection.spec.ts` — **modifica**: +test `occupancyStates`.
- `apps/api/src/reports/reports.service.ts` — **modifica**: usa `occupancyStates` al posto del loop inline.
- `packages/ui-kit/src/styles/theme.css` — **modifica**: token `--color-state-covered` (+ `-ink`).
- `packages/ui-kit/src/components/UmbrellaCell.vue` — **modifica**: voce `covered` in `fill`/`ink`.
- `packages/ui-kit/src/components/UmbrellaCell.spec.ts` — **modifica**: +2 test (spicchio covered; N=1 covered).
- `apps/web-staff/src/features/map/MapView.vue` — **modifica**: `STATE_COLOR`/`STATE_LABEL` +`covered`; `coveringInfo()`; box+drawer per fascia coperta; legenda.
- `apps/web-staff/src/features/map/MapView.spec.ts` — **modifica**: +2 test (copertura in entrambe le direzioni con dettaglio copritore).
- `apps/web-staff/src/lib/chartColors.ts` — **modifica**: `STATE_VAR.covered` (esaustività `Record<SlotState>`).
- `apps/web-staff/src/features/report/ReportView.vue` — **modifica**: `STATE_LABEL.covered` (esaustività).

**Nota di sequenza (attesa, non un errore):** aggiungere `'covered'` a `SlotState` (Task 1) rompe il typecheck di **ui-kit** e **web-staff** (mappe `Record<SlotState>` incomplete) finché Task 3 (ui-kit) e Task 4 (web-staff) non lo aggiungono. Ogni task esegue i gate del **proprio layer**; la verde d'insieme torna a fine Task 4 e la conferma la review whole-branch. Task 1 e 2 eseguono solo i gate **api**.

---

### Task 1: Backend core — stato `covered` nel projection + `coveredBySlot` (contracts + map.projection)

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/map/map.projection.ts`
- Test: `apps/api/src/map/map.projection.spec.ts`

**Interfaces:**
- Consumes: `MapSource`, `slotsOverlap`, `STATE_BY_TYPE`, `slotById` (già nel file projection).
- Produces (per i task successivi):
  - `SlotState = 'free' | 'season' | 'daily' | 'booked' | 'covered'`.
  - `UmbrellaDTO.coveredBySlot?: Record<string, string[]>` — key = slotId **coperto**, value = ids delle fasce (con prenotazione diretta) che lo coprono. Popolato dal projection solo per le fasce `covered`.

- [ ] **Step 1: Scrivi i test che falliscono (TDD)**

In `apps/api/src/map/map.projection.spec.ts`, aggiungi **dentro** `describe('projectDayMap', ...)` (es. dopo l'ultimo `it`), un blocco con una sorgente a 3 fasce **sovrapposte** e tre test:

```ts
  describe('fasce sovrapposte (D-048)', () => {
    const overlapSource: MapSource = {
      ...source,
      timeSlots: [
        ...source.timeSlots, // s1 Mattina 08–13, s2 Pomeriggio 13–19 (dalla fixture in cima al file)
        { id: 'sf', establishmentId: 'e', name: 'Giornata int.', startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T19:00:00Z'), sortOrder: 3 },
      ],
    };

    it('full-day prenotato → le fasce sovrapposte risultano coperte + coveredBySlot le nomina', () => {
      const dto = projectDayMap('2026-07-15', {
        ...overlapSource,
        bookings: [{ umbrellaId: 'u1', timeSlotId: 'sf', type: 'subscription' as const }],
      });
      const u1 = dto.sectors[0].rows[0].umbrellas[0];
      expect(u1.stateBySlot).toEqual({ s1: 'covered', s2: 'covered', sf: 'season' });
      expect(u1.coveredBySlot).toEqual({ s1: ['sf'], s2: ['sf'] });
    });

    it('entrambe le metà prenotate → la full-day è coperta (coveredBy = le due metà)', () => {
      const dto = projectDayMap('2026-07-15', {
        ...overlapSource,
        bookings: [
          { umbrellaId: 'u1', timeSlotId: 's1', type: 'daily' as const },
          { umbrellaId: 'u1', timeSlotId: 's2', type: 'periodic' as const },
        ],
      });
      const u1 = dto.sectors[0].rows[0].umbrellas[0];
      expect(u1.stateBySlot).toEqual({ s1: 'daily', s2: 'booked', sf: 'covered' });
      expect(u1.coveredBySlot).toEqual({ sf: ['s1', 's2'] });
    });

    it('nessuna prenotazione → tutte libere, coveredBySlot vuoto', () => {
      const dto = projectDayMap('2026-07-15', overlapSource); // bookings: [] dalla fixture
      const u1 = dto.sectors[0].rows[0].umbrellas[0];
      expect(u1.stateBySlot).toEqual({ s1: 'free', s2: 'free', sf: 'free' });
      expect(u1.coveredBySlot).toEqual({});
    });
  });
```

- [ ] **Step 2: Aggiorna i contracts**

In `packages/contracts/src/index.ts`, riga `export type SlotState = ...`:

```ts
export type SlotState = 'free' | 'season' | 'daily' | 'booked' | 'covered';
```

E nell'interfaccia `UmbrellaDTO`, aggiungi il campo dopo `stateBySlot`:

```ts
export interface UmbrellaDTO {
  id: string;
  label: string;                  // real physical number (ADR-0016)
  umbrellaTypeId: string | null;  // null = Normal
  rowId: string;
  stateBySlot: Record<string, SlotState>; // key = TimeSlotDTO.id
  coveredBySlot?: Record<string, string[]>; // key = slotId COPERTO → ids fasce copritrici (D-048); assente se nessuna copertura
}
```

- [ ] **Step 3: Ricompila i contracts**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build OK (nessun errore TS).

- [ ] **Step 4: Esegui il test — deve FALLIRE (projection ancora a "prima sovrapposta vince")**

Run: `corepack pnpm --filter @coralyn/api test -- map.projection`
Expected: FAIL sui 3 nuovi test (es. `stateBySlot` ha `s1: 'season'` invece di `'covered'`; `coveredBySlot` undefined).

- [ ] **Step 5: Riscrivi la logica del projection**

In `apps/api/src/map/map.projection.ts`, sostituisci il blocco `stateFor` + la costruzione `sectors` (dalla riga del commento "stato di (umbrella, slot)" fino alla fine dell'assegnazione `const sectors = ...`) con:

```ts
  // Stato di (umbrella, slot) a DUE FASI: una prenotazione DIRETTA (timeSlotId === slot.id) prevale; altrimenti la
  // fascia è COPERTA se una prenotazione su un'ALTRA fascia si sovrappone; altrimenti libera. (bookings già ordinate
  // per createdAt dal service.) Ritorna anche gli ids delle fasce copritrici per una fascia coperta.
  const resolveSlot = (umbrellaId: string, slot: TimeSlot): { state: SlotState; coveredBy: string[] } => {
    const direct = source.bookings.find(
      (b) => b.umbrellaId === umbrellaId && b.timeSlotId === slot.id,
    );
    if (direct) return { state: STATE_BY_TYPE[direct.type], coveredBy: [] };
    const coveringSlotIds = source.bookings
      .filter((b) => {
        if (b.umbrellaId !== umbrellaId || b.timeSlotId === slot.id) return false;
        const bookedSlot = slotById.get(b.timeSlotId);
        return bookedSlot != null && slotsOverlap(bookedSlot, slot);
      })
      .map((b) => b.timeSlotId);
    if (coveringSlotIds.length > 0) return { state: 'covered', coveredBy: [...new Set(coveringSlotIds)] };
    return { state: 'free', coveredBy: [] };
  };

  const sectors: SectorDTO[] = source.sectors.map((s) => ({
    id: s.id,
    name: s.name,
    sortOrder: s.sortOrder,
    rows: s.rows.map((r) => ({
      id: r.id,
      label: r.label,
      sortOrder: r.sortOrder,
      umbrellas: r.umbrellas.map((u): UmbrellaDTO => {
        const stateBySlot: Record<string, SlotState> = {};
        const coveredBySlot: Record<string, string[]> = {};
        for (const slot of source.timeSlots) {
          const { state, coveredBy } = resolveSlot(u.id, slot);
          stateBySlot[slot.id] = state;
          if (state === 'covered') coveredBySlot[slot.id] = coveredBy;
        }
        return { id: u.id, label: u.label, umbrellaTypeId: u.umbrellaTypeId, rowId: u.rowId, stateBySlot, coveredBySlot };
      }),
    })),
  }));
```

- [ ] **Step 6: Esegui il test — deve PASSARE**

Run: `corepack pnpm --filter @coralyn/api test -- map.projection`
Expected: PASS (inclusi i 3 nuovi test + tutti gli esistenti — la fixture disgiunta a 2 slot non produce copertura, quindi i test esistenti restano invariati).

- [ ] **Step 7: Suite unit api + e2e map (additività `coveredBySlot`)**

Run: `corepack pnpm --filter @coralyn/api test`
Expected: PASS, **204** test (201 + 3).
Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -- map`
Expected: PASS (il map e2e asserisce solo `stateBySlot`, non l'oggetto ombrellone intero → `coveredBySlot` opzionale non lo rompe).

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/src/index.ts apps/api/src/map/map.projection.ts apps/api/src/map/map.projection.spec.ts
git commit -m "feat(api): stato 'covered' nel map projection (fascia coperta da fascia sovrapposta) + coveredBySlot (D-048)"
```

---

### Task 2: Reports — le fasce coperte non contano nell'occupazione

**Files:**
- Modify: `apps/api/src/reports/report.projection.ts`
- Test: `apps/api/src/reports/report.projection.spec.ts`
- Modify: `apps/api/src/reports/reports.service.ts`

**Interfaces:**
- Consumes: `SlotState`, `UmbrellaDTO.stateBySlot`, `DayMapDTO` (contracts, da Task 1).
- Produces: `occupancyStates(dayMap: DayMapDTO): SlotState[]` — appiattisce (ombrellone × fascia) escludendo `covered`. Usato da `reports.service`.

- [ ] **Step 1: Scrivi il test che fallisce (TDD)**

In `apps/api/src/reports/report.projection.spec.ts`, aggiungi in cima l'import del tipo:

```ts
import type { DayMapDTO } from '@coralyn/contracts';
```

e (aggiornando l'import esistente da `./report.projection` per includere `occupancyStates`) un nuovo `describe`:

```ts
describe('occupancyStates', () => {
  it('appiattisce ombrellone×fascia ed ESCLUDE le fasce coperte (no doppio conteggio)', () => {
    const dayMap: DayMapDTO = {
      date: '2026-07-15',
      umbrellaTypes: [],
      timeSlots: [
        { id: 's1', name: 'M', sortOrder: 1 },
        { id: 's2', name: 'P', sortOrder: 2 },
        { id: 'sf', name: 'G', sortOrder: 3 },
      ],
      sectors: [{
        id: 'sec', name: 'C', sortOrder: 1,
        rows: [{ id: 'r', label: 'F', sortOrder: 1, umbrellas: [
          // full-day venduto: sf diretta (season), s1/s2 coperte → conta SOLO sf
          { id: 'u1', label: '1', umbrellaTypeId: null, rowId: 'r', stateBySlot: { s1: 'covered', s2: 'covered', sf: 'season' } },
          // tutte libere
          { id: 'u2', label: '2', umbrellaTypeId: null, rowId: 'r', stateBySlot: { s1: 'free', s2: 'free', sf: 'free' } },
        ] }],
      }],
    };
    expect(occupancyStates(dayMap)).toEqual(['season', 'free', 'free', 'free']);
  });
});
```

Assicurati che la riga di import esistente diventi:
```ts
import { revenueBuckets, revenueKpi, occupancyPct, stateMix, occupancyStates } from './report.projection';
```

- [ ] **Step 2: Esegui il test — deve FALLIRE (`occupancyStates` non esiste)**

Run: `corepack pnpm --filter @coralyn/api test -- report.projection`
Expected: FAIL (`occupancyStates is not a function` / errore TS).

- [ ] **Step 3: Implementa il helper**

In `apps/api/src/reports/report.projection.ts`, aggiorna l'import dei tipi in cima:

```ts
import type { DayMapDTO, SlotState } from '@coralyn/contracts';
```

e aggiungi la funzione (es. sopra `stateMix`):

```ts
/** Stati per l'occupazione: appiattisce (ombrellone × fascia) ESCLUDENDO le fasce coperte — l'ombra di una
 *  prenotazione contata sulla sua fascia diretta → nessun doppio conteggio con fasce sovrapposte (D-048). */
export function occupancyStates(dayMap: DayMapDTO): SlotState[] {
  const states: SlotState[] = [];
  for (const sector of dayMap.sectors)
    for (const row of sector.rows)
      for (const u of row.umbrellas)
        for (const slot of dayMap.timeSlots) {
          const st = u.stateBySlot[slot.id] ?? 'free';
          if (st !== 'covered') states.push(st);
        }
  return states;
}
```

- [ ] **Step 4: Esegui il test — deve PASSARE**

Run: `corepack pnpm --filter @coralyn/api test -- report.projection`
Expected: PASS.

- [ ] **Step 5: Collega il helper in `reports.service`**

In `apps/api/src/reports/reports.service.ts`, sostituisci il loop inline che costruisce `states` (attualmente:
```ts
    const dayMap = await this.map.getDayMap(todayIso);
    const states: SlotState[] = [];
    for (const sector of dayMap.sectors)
      for (const row of sector.rows)
        for (const u of row.umbrellas)
          for (const slot of dayMap.timeSlots) states.push(u.stateBySlot[slot.id] ?? 'free');
    const occupied = states.filter((s) => s !== 'free').length;
```
) con:

```ts
    const dayMap = await this.map.getDayMap(todayIso);
    const states = occupancyStates(dayMap);
    const occupied = states.filter((s) => s !== 'free').length;
```

L'import esistente `import { revenueKpi, revenueBuckets, occupancyPct, stateMix } from './report.projection';` diventa:
```ts
import { revenueKpi, revenueBuckets, occupancyPct, stateMix, occupancyStates } from './report.projection';
```
Se dopo la sostituzione `SlotState` non è più usato in `reports.service.ts`, rimuovi `SlotState` dall'import dei tipi per evitare l'unused (verifica con il typecheck e2e allo Step 6).

- [ ] **Step 6: Suite unit api + e2e reports**

Run: `corepack pnpm --filter @coralyn/api test`
Expected: PASS, **205** test (204 + 1).
Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -- reports`
Expected: PASS (nessuna regressione; col seed disgiunto non ci sono coperte, comportamento identico).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/reports/report.projection.ts apps/api/src/reports/report.projection.spec.ts apps/api/src/reports/reports.service.ts
git commit -m "feat(api): l'occupazione dei report esclude le fasce coperte (occupancyStates, D-048)"
```

---

### Task 3: ui-kit — colore per lo stato `covered`

**Files:**
- Modify: `packages/ui-kit/src/styles/theme.css`
- Modify: `packages/ui-kit/src/components/UmbrellaCell.vue`
- Test: `packages/ui-kit/src/components/UmbrellaCell.spec.ts`

**Interfaces:**
- Consumes: `SlotState` (con `'covered'`, da Task 1).
- Produces: token `--color-state-covered`/`-ink`; `UmbrellaCell` che rende uno spicchio `covered` col colore neutro (la logica a spicchi N-agnostica è invariata: solo le voci `fill`/`ink`).

- [ ] **Step 1: Aggiungi i token tema**

In `packages/ui-kit/src/styles/theme.css`, subito dopo la riga `--color-state-booked: ...; --color-state-booked-ink: ...;`, inserisci:

```css
  --color-state-covered: #BEB6A8; --color-state-covered-ink: #4A463E;
```

- [ ] **Step 2: Scrivi i test che falliscono (TDD)**

In `packages/ui-kit/src/components/UmbrellaCell.spec.ts`, aggiungi dentro `describe('UmbrellaCell', ...)`:

```ts
  it('include la fascia coperta come spicchio col colore neutro', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['daily', 'covered'] } });
    expect(w.vm.uniform).toBe(false);
    expect(w.vm.bg).toContain('var(--color-state-covered)');
  });
  it('N=1 coperta: tinta piena neutra', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['covered'] } });
    expect(w.vm.uniform).toBe(true);
    expect(w.vm.bg).toBe('var(--color-state-covered)');
  });
```

- [ ] **Step 3: Esegui il test — deve FALLIRE (typecheck: `'covered'` non è in `fill`/`ink`)**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- UmbrellaCell`
Expected: FAIL (errore TS: `Property 'covered' is missing in type ... Record<SlotState, string>`, e/o `bg` non contiene il token covered).

- [ ] **Step 4: Aggiungi la voce `covered` a `fill`/`ink`**

In `packages/ui-kit/src/components/UmbrellaCell.vue`, aggiorna i due dizionari:

```ts
const fill: Record<SlotState, string> = {
  free: 'var(--color-state-free)', season: 'var(--color-state-season)',
  daily: 'var(--color-state-daily)', booked: 'var(--color-state-booked)',
  covered: 'var(--color-state-covered)',
};
const ink: Record<SlotState, string> = {
  free: 'var(--color-state-free-ink)', season: 'var(--color-state-season-ink)',
  daily: 'var(--color-state-daily-ink)', booked: 'var(--color-state-booked-ink)',
  covered: 'var(--color-state-covered-ink)',
};
```

- [ ] **Step 5: Esegui il test — deve PASSARE**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- UmbrellaCell`
Expected: PASS.

- [ ] **Step 6: Suite + typecheck ui-kit**

Run: `corepack pnpm --filter @coralyn/ui-kit test` poi `corepack pnpm --filter @coralyn/ui-kit typecheck`
Expected: entrambi PASS. ui-kit **79** (77 + 2). *(web-staff typecheck resta rosso fino a Task 4 — atteso.)*

- [ ] **Step 7: Commit**

```bash
git add packages/ui-kit/src/styles/theme.css packages/ui-kit/src/components/UmbrellaCell.vue packages/ui-kit/src/components/UmbrellaCell.spec.ts
git commit -m "feat(ui-kit): token e resa dello stato 'covered' in UmbrellaCell (D-048)"
```

---

### Task 4: web-staff — resa onesta della fascia coperta (mappa + drawer) + esaustività report

**Files:**
- Modify: `apps/web-staff/src/features/map/MapView.vue`
- Test: `apps/web-staff/src/features/map/MapView.spec.ts`
- Modify: `apps/web-staff/src/lib/chartColors.ts`
- Modify: `apps/web-staff/src/features/report/ReportView.vue`

**Interfaces:**
- Consumes: `SlotState` (`'covered'`), `UmbrellaDTO.coveredBySlot?` (Task 1); `UmbrellaCell` che rende `covered` (Task 3); helper esistenti `liveStateFor`, `slotsById`, `bookings`, `customers`, `slotStatesFor`.
- Produces: resa `covered` (cella + box "Non disponibile" + dettaglio copritore nel drawer).

- [ ] **Step 1: Scrivi i test che falliscono (TDD)**

In `apps/web-staff/src/features/map/MapView.spec.ts`, aggiungi due test (dentro `describe('MapView', ...)`):

```ts
  it('fascia coperta (metà prenotate → full-day coperta): box "Non disponibile" + dettaglio copritori, senza azioni', async () => {
    const mapOv = {
      date: '2026-06-27',
      umbrellaTypes: [{ id: 't1', name: 'Palma', sortOrder: 1, icon: 'palmtree' }],
      timeSlots: [
        { id: 'mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
        { id: 'pom', name: 'Pomeriggio', startTime: '13:00', endTime: '19:00', sortOrder: 2 },
        { id: 'full', name: 'Giornata int.', startTime: '08:00', endTime: '19:00', sortOrder: 3 },
      ],
      sectors: [{ id: 'sec', name: 'Centro', sortOrder: 1, rows: [{ id: 'r1', label: 'Fila 1', sortOrder: 1, umbrellas: [
        { id: 'o9', label: '9', umbrellaTypeId: 't1', rowId: 'r1',
          stateBySlot: { mat: 'daily', pom: 'booked', full: 'covered' },
          coveredBySlot: { full: ['mat', 'pom'] } },
      ] }] }],
    };
    server.use(
      http.get('/api/map', () => HttpResponse.json(mapOv)),
      http.get('/api/bookings', () => HttpResponse.json([
        { id: 'bm', customerId: 'c-1', umbrellaId: 'o9', timeSlotId: 'mat', startDate: '2026-06-27', endDate: '2026-06-27', type: 'daily', status: 'confirmed', totalPrice: 30, paymentStatus: 'unpaid', amountCollected: 0 },
        { id: 'bp', customerId: 'c-1', umbrellaId: 'o9', timeSlotId: 'pom', startDate: '2026-06-27', endDate: '2026-06-27', type: 'periodic', status: 'confirmed', totalPrice: 55, paymentStatus: 'unpaid', amountCollected: 0 },
      ])),
    );

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();
    const aside = w.find('aside');

    // Il box "Giornata int." mostra "Non disponibile"
    const fullBox = aside.findAll('button').find((b) => b.text().includes('Giornata int.'));
    expect(fullBox).toBeTruthy();
    expect(fullBox!.text()).toContain('Non disponibile');

    // Selezionandolo → dettaglio copertura: fasce copritrici + clienti + importi; nessuna azione di booking
    await fullBox!.trigger('click');
    await flushPromises();
    expect(aside.text()).toContain('coperta da');
    expect(aside.text()).toContain('Mattina');
    expect(aside.text()).toContain('Pomeriggio');
    expect(aside.text()).toContain('30');
    expect(aside.text()).toContain('55');
    expect(aside.text()).not.toContain('Registra incasso');

    w.unmount();
  });

  it('fascia coperta (full-day prenotata → metà coperte): la metà nomina la full-day come copritrice', async () => {
    const mapOv2 = {
      date: '2026-06-27',
      umbrellaTypes: [{ id: 't1', name: 'Palma', sortOrder: 1, icon: 'palmtree' }],
      timeSlots: [
        { id: 'mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
        { id: 'pom', name: 'Pomeriggio', startTime: '13:00', endTime: '19:00', sortOrder: 2 },
        { id: 'full', name: 'Giornata int.', startTime: '08:00', endTime: '19:00', sortOrder: 3 },
      ],
      sectors: [{ id: 'sec', name: 'Centro', sortOrder: 1, rows: [{ id: 'r1', label: 'Fila 1', sortOrder: 1, umbrellas: [
        { id: 'o9', label: '9', umbrellaTypeId: 't1', rowId: 'r1',
          stateBySlot: { mat: 'covered', pom: 'covered', full: 'season' },
          coveredBySlot: { mat: ['full'], pom: ['full'] } },
      ] }] }],
    };
    server.use(
      http.get('/api/map', () => HttpResponse.json(mapOv2)),
      http.get('/api/bookings', () => HttpResponse.json([
        { id: 'bf', customerId: 'c-1', umbrellaId: 'o9', timeSlotId: 'full', startDate: '2026-06-27', endDate: '2026-06-27', type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'unpaid', amountCollected: 0 },
      ])),
    );

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();
    const aside = w.find('aside');

    // Seleziona la fascia "Mattina" (coperta dalla full-day)
    const matBox = aside.findAll('button').find((b) => b.text().includes('Mattina'));
    expect(matBox).toBeTruthy();
    await matBox!.trigger('click');
    await flushPromises();
    expect(aside.text()).toContain('coperta da');
    expect(aside.text()).toContain('Giornata int.');
    expect(aside.text()).toContain('800');

    w.unmount();
  });
```

- [ ] **Step 2: Esegui il test — deve FALLIRE (typecheck + resa mancante)**

Run: `corepack pnpm --filter web-staff test -- MapView`
Expected: FAIL (typecheck: `'covered'` mancante in `STATE_COLOR`/`STATE_LABEL`; e i nuovi test non trovano "coperta da").

- [ ] **Step 3: Aggiungi `covered` alle mappe e il helper `coveringInfo` in `MapView.vue`**

In `apps/web-staff/src/features/map/MapView.vue`, estendi `STATE_COLOR` e `STATE_LABEL`:

```ts
const STATE_COLOR: Record<SlotState, string> = {
  free: 'var(--color-state-free)', season: 'var(--color-state-season)',
  daily: 'var(--color-state-daily)', booked: 'var(--color-state-booked)',
  covered: 'var(--color-state-covered)',
};
const STATE_LABEL: Record<SlotState, string> = {
  free: 'Libero', season: 'Abbonato', daily: 'Giornaliero', booked: 'Prenotato',
  covered: 'Non disponibile',
};
```

Poi, **subito dopo** la definizione di `slotsById` (il `const slotsById = computed(...)`), aggiungi il helper che risolve i copritori di una fascia coperta:

```ts
interface CoverInfo { slotName: string; customer: string; amount: number | null; }
/** Per una fascia coperta, elenca le fasce copritrici col dettaglio della loro prenotazione (D-048). */
function coveringInfo(slotId: string): CoverInfo[] {
  if (!sel.value) return [];
  const coveringIds = liveU.value.coveredBySlot?.[slotId] ?? [];
  return coveringIds.map((cid) => {
    const b = (bookings.value ?? []).find((x) => x.umbrellaId === sel.value!.u.id && x.timeSlotId === cid);
    const cust = b ? (customers.value ?? []).find((c) => c.id === b.customerId) : undefined;
    return {
      slotName: slotsById.value.get(cid) ?? 'Fascia',
      customer: cust ? `${cust.firstName} ${cust.lastName}` : (b?.customerId ?? ''),
      amount: b ? b.totalPrice : null,
    };
  });
}
```

- [ ] **Step 4: Rendi il dettaglio copertura nel drawer + legenda**

In `apps/web-staff/src/features/map/MapView.vue`, sostituisci il blocco del messaggio disponibilità (il `<div v-else ...>{{ availabilityMessage }}</div>`) con:

```html
        <div v-else class="mt-3.5 rounded-xl border border-dashed border-[var(--color-warm-border-seg)] bg-[var(--color-warm-075)] p-4 text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
          <template v-if="liveStateFor(selectedSlotId) === 'covered'">
            <div class="mb-1.5 text-center text-[13px] font-semibold text-[var(--color-text)]">Non disponibile</div>
            <ul class="space-y-1">
              <li v-for="(c, i) in coveringInfo(selectedSlotId)" :key="i">
                coperta da <span class="font-semibold text-[var(--color-text-2nd)]">{{ c.slotName }}</span><template v-if="c.customer"> — {{ c.customer }}<template v-if="c.amount !== null"> · € {{ c.amount }}</template></template>
              </li>
            </ul>
          </template>
          <div v-else class="text-center">{{ availabilityMessage }}</div>
        </div>
```

Nella legenda "Stato" (la riga con gli swatch), aggiungi dopo lo swatch "Prenotato":

```html
              <span class="inline-flex items-center gap-1.5"><i class="size-[13px] rounded-full" style="background:var(--color-state-covered)"></i>Non disponibile</span>
```

- [ ] **Step 5: Soddisfa l'esaustività `Record<SlotState>` nel report FE**

In `apps/web-staff/src/lib/chartColors.ts`, estendi `STATE_VAR`:

```ts
const STATE_VAR: Record<SlotState, string> = {
  free: '--color-state-free', season: '--color-state-season', daily: '--color-state-daily', booked: '--color-state-booked',
  covered: '--color-state-covered',
};
```

In `apps/web-staff/src/features/report/ReportView.vue`, estendi `STATE_LABEL`:

```ts
const STATE_LABEL: Record<SlotState, string> = { free: 'Libero', season: 'Abbonato', daily: 'Giornaliero', booked: 'Prenotato', covered: 'Non disponibile' };
```

*(Nota: i report escludono le fasce coperte a monte — Task 2 — quindi `covered` non comparirà mai in `umbrellaStateMix`; queste voci esistono solo per l'esaustività del tipo.)*

- [ ] **Step 6: Esegui il test — deve PASSARE**

Run: `corepack pnpm --filter web-staff test -- MapView`
Expected: PASS (i 2 nuovi test + tutti gli esistenti).

- [ ] **Step 7: Suite web-staff + typecheck (+ ui-kit per il glob)**

Run in sequenza:
```
corepack pnpm --filter web-staff test
corepack pnpm --filter web-staff typecheck
corepack pnpm --filter @coralyn/ui-kit test
```
Expected: tutti PASS. web-staff **268** (264 + 2 nuovi MapView + 2 UmbrellaCell globati). typecheck **pulito** (tutte le mappe `Record<SlotState>` complete). ui-kit **79**.

- [ ] **Step 8: Commit**

```bash
git add apps/web-staff/src/features/map/MapView.vue apps/web-staff/src/features/map/MapView.spec.ts apps/web-staff/src/lib/chartColors.ts apps/web-staff/src/features/report/ReportView.vue
git commit -m "feat(web-staff): fascia coperta resa onesta (Non disponibile + copritori con cliente/importo) (D-048)"
```

---

## Self-Review (eseguita)

**1. Copertura spec:**
- §2/§3.1 stato `covered` distinto → Task 1 (SlotState) + Task 3 (colore) + Task 4 (label). ✓
- §3.2 projection a due fasi + `coveredBySlot` → Task 1. ✓
- §3.3 contracts additivi → Task 1 (`coveredBySlot?` opzionale per non churnare le fixture; projection lo popola sempre). ✓
- §3.4 token/resa cella → Task 3. ✓
- §3.5 drawer "Non disponibile" + copritori (nome fascia + cliente + importo), non prenotabile → Task 4 (`coveringInfo` + template; non-prenotabilità garantita da `freeSlotOptions`/`slotIsBusy` che escludono i non-`free`, asserito con `not.toContain('Registra incasso')`). ✓
- §3.6 reports escludono covered → Task 2 (`occupancyStates`). ✓
- §3.7 pricing full-day invariato → §Verifica (nessun cambio). ✓
- §3.8 editor Struttura consente overlap → nessuna modifica (corretto). ✓
- §5 verifiche (pricing keyed by timeSlotId; vincolo DB) → §Verifica. ✓
- §7 deferito (occupancy% formale, hint editor) → NON implementato (corretto). ✓
- §8 registrare D-048 in deferred.md → follow-up di chiusura (annotato per l'handoff, non un task di codice).

**2. Placeholder scan:** nessun TODO/TBD; ogni step con codice riporta il codice completo. ✓

**3. Coerenza tipi:** `SlotState` con `'covered'` coerente in contracts/projection/reports/ui-kit/web-staff. `coveredBySlot?: Record<string, string[]>` definito in Task 1, letto in Task 4 (`liveU.value.coveredBySlot?.[slotId] ?? []`). `occupancyStates(dayMap: DayMapDTO): SlotState[]` coerente tra Task 2 (def) e reports.service. `coveringInfo(slotId): CoverInfo[]` interno a MapView. Copy "Non disponibile"/"coperta da …" identica tra Global Constraints, template e test. ✓

**Nota di sequenza ribadita:** tra Task 1 e la fine di Task 4 il typecheck FE è rosso a tratti (mappe `Record<SlotState>` incomplete); ogni task green sul proprio layer, la review whole-branch valida la verde finale.
