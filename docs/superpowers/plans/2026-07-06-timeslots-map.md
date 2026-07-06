# Fasce orarie ↔ mappa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere fedelmente **N fasce orarie arbitrarie** nella mappa (cella + drawer + messaggio), eliminando la compressione visiva N→2 che nasconde le fasce centrali, ignora i nomi reali e mostra un messaggio di disponibilità errato.

**Architecture:** Slice **FE-only** (verifica §5 confermata sotto). La cella `UmbrellaCell` (ui-kit) passa da 2 stati fissi (`morningState`/`afternoonState`) a un array N-agnostico `slotStates: SlotState[]` reso a spicchi (`conic-gradient`, tinta piena se uniforme). `MapView` (web-staff) sostituisce ogni logica a-2-metà (`halfSlots` e derivati) con iterazione diretta su `timeSlots` ordinati per `sortOrder`: celle a N spicchi, drawer con N box reali (nome/orario/stato, selezionabili), messaggio di disponibilità computato dallo stato reale. Un test di regressione backend blocca l'invariante «il projection popola `stateBySlot` per **ogni** fascia».

**Tech Stack:** Vue 3 `<script setup lang="ts">`, Pinia, TanStack Query, vitest + @vue/test-utils + MSW (FE); NestJS + ts-jest (backend guard); pnpm monorepo; `@coralyn/contracts` (build in `dist/`).

## Global Constraints

- **pnpm, MAI npm.** Comandi test dalla root con `corepack pnpm`. Se pnpm chiede purge senza TTY → `CI=true corepack pnpm install`.
- **`@coralyn/contracts`**: NON si tocca in questa slice (nessun cambio di tipo). Se per errore lo si modificasse → `corepack pnpm --filter @coralyn/contracts build` prima di typecheck/test.
- **Gotcha conteggio test**: `apps/web-staff/vitest.config.ts` globa `../../packages/ui-kit/src/**/*.spec.ts` → `UmbrellaCell.spec.ts` conta sia in ui-kit sia in web-staff. Deve restare verde sotto **entrambe** le suite.
- **Baseline da non regredire (LIVE su `main`):** ui-kit **73** · web-staff **257** · web-platform **16** · api unit **200** · api e2e **235** (`--runInBand`) · typecheck pulito ovunque. Questa slice è **additiva** (nuovi test) e sostituisce alcuni test obsoleti di `MapView.spec` (vedi Task 3) → i conteggi salgono, non scendono.
- **Copy messaggio disponibilità (verbatim):** tutte-libere → `Postazione libera tutto il giorno` · alcune-libere → `Libera nelle fasce: {nomi separati da ", "}` · nessuna-libera → `Nessuna fascia libera`.
- **`SlotState`** (da `@coralyn/contracts`) = `'free' | 'season' | 'daily' | 'booked'`. `STATE_LABEL`: free→`Libero`, season→`Abbonato`, daily→`Giornaliero`, booked→`Prenotato`.

## §5 — Verifica pre-implementazione (FE-only CONFERMATO)

`apps/api/src/map/map.projection.ts:78` costruisce
`stateBySlot: Object.fromEntries(source.timeSlots.map((slot) => [slot.id, stateFor(u.id, slot)]))` —
itera su **tutte** le `source.timeSlots`, quindi il backend espone già `stateBySlot` per **ogni** fascia configurata, non solo 2. Nessun cambio backend richiesto. Task 1 blocca questa invariante con un test a 3 fasce.

## File Structure

- `apps/api/src/map/map.projection.spec.ts` — **modifica**: +1 test (3 fasce → 3 chiavi in `stateBySlot`). Guardia §5.
- `packages/ui-kit/src/components/UmbrellaCell.vue` — **modifica**: props `slotStates: SlotState[]` (rimuove `morningState`/`afternoonState`); resa a spicchi conic-gradient; `defineExpose({ bg, uniform })` come seam di test (jsdom non serializza `conic-gradient`/`var()` nello style attribute — si testa il computed grezzo).
- `packages/ui-kit/src/components/UmbrellaCell.spec.ts` — **modifica**: riscrive i casi prop; +casi N=1/uniforme/N=3-misti.
- `apps/web-staff/src/mocks/data/seed.ts` — **modifica**: +export `mapSeed3` (config a 3 fasce con nomi non-standard) riusabile nei test.
- `apps/web-staff/src/features/map/MapView.vue` — **modifica**: rimuove `halfSlots`/`slotState`/`liveSlotState`/`morning`/`afternoon`/`morningSlotId`/`afternoonSlotId`; `timeSlots` ordinato per `sortOrder`; `slotStatesFor`, `liveStateFor`, `availabilityMessage`, `ariaLabel` N-agnostico; template celle `:slot-states`, drawer `v-for` su fasce, messaggio computato, copy header/legenda.
- `apps/web-staff/src/features/map/MapView.spec.ts` — **modifica**: riscrive i 2 test che assertano `morningState`/`afternoonState`; +test 3-fasce (centrale visibile/prenotabile, nomi reali, messaggi).

---

### Task 1: Guardia backend — il projection popola `stateBySlot` per OGNI fascia (§5 lock)

**Files:**
- Test: `apps/api/src/map/map.projection.spec.ts` (append nuovo `it` nel `describe('projectDayMap')`, dopo la riga 69 area)

**Interfaces:**
- Consumes: `projectDayMap(date, source: MapSource)` e `MapSource` (già importati in cima al file, riga 1). Fixture `source` esistente (righe 4-33) con 2 slot `s1`/`s2`.
- Produces: nessuna nuova API. Blocca solo l'invariante N-agnostica del projection.

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi questo `it` dentro `describe('projectDayMap', () => { ... })` (es. subito prima della chiusura del describe):

```ts
  it('popola stateBySlot per OGNI fascia configurata (N=3, non solo 2) — §5 FE-only lock', () => {
    const source3: MapSource = {
      ...source,
      timeSlots: [
        ...source.timeSlots, // s1 (Mattina), s2 (Pomeriggio)
        { id: 's3', establishmentId: 'e', name: 'Sera', startTime: new Date('1970-01-01T19:00:00Z'), endTime: new Date('1970-01-01T23:00:00Z'), sortOrder: 3 },
      ],
      bookings: [{ umbrellaId: 'u1', timeSlotId: 's2', type: 'daily' as const }],
    };
    const dto = projectDayMap('2026-07-15', source3);
    const u1 = dto.sectors[0].rows[0].umbrellas[0];
    // Tutte e 3 le fasce presenti come chiavi (la centrale/s2 non "sparisce")
    expect(Object.keys(u1.stateBySlot).sort()).toEqual(['s1', 's2', 's3']);
    // La prenotazione daily accende SOLO la fascia sovrapposta; le altre restano free
    expect(u1.stateBySlot).toEqual({ s1: 'free', s2: 'daily', s3: 'free' });
  });
```

- [ ] **Step 2: Esegui il test — deve PASSARE subito (guardia, non TDD-red)**

Run: `corepack pnpm --filter @coralyn/api test -- map.projection`
Expected: PASS. *(Il projection è già N-agnostico; questo test lo blocca contro regressioni. Se fallisse, la slice NON è FE-only: fermarsi e ripianificare.)*

- [ ] **Step 3: Esegui l'intera suite unit api per confermare nessuna regressione**

Run: `corepack pnpm --filter @coralyn/api test`
Expected: PASS, **201** test (200 baseline + 1).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/map/map.projection.spec.ts
git commit -m "test(api): il projection popola stateBySlot per ogni fascia (N=3, §5 FE-only lock)"
```

---

### Task 2: `UmbrellaCell` N-agnostica a spicchi (layer ui-kit)

**Files:**
- Modify: `packages/ui-kit/src/components/UmbrellaCell.vue`
- Test: `packages/ui-kit/src/components/UmbrellaCell.spec.ts`

**Interfaces:**
- Consumes: `SlotState` da `@coralyn/contracts`; `Icon` locale.
- Produces (contratto consumato da MapView in Task 3):
  - prop **`slotStates: SlotState[]`** (ordine = ordine di visualizzazione delle fasce). Sostituisce `morningState`/`afternoonState`.
  - prop invariate: `label: string`, `ariaLabel: string`, `typeIcon?: string | null`, `selected?: boolean` (default `false`).
  - emit invariato: `select: []`.
  - `defineExpose({ bg: string, uniform: boolean })` — seam di test.

> **NOTA di sequenza (attesa, non un errore):** dopo questo task `apps/web-staff` **non typecheckerà** finché Task 3 non aggiorna `MapView.vue` (che ancora passa `:morning-state`/`:afternoon-state`). In questo task si eseguono **solo** i gate ui-kit. La verde d'insieme torna a fine Task 3 e la conferma la review whole-branch.

- [ ] **Step 1: Riscrivi la spec (TDD) con i nuovi casi**

Sostituisci **tutto** il contenuto di `packages/ui-kit/src/components/UmbrellaCell.spec.ts` con:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UmbrellaCell from './UmbrellaCell.vue';

const base = {
  label: '8',
  ariaLabel: 'Ombrellone 8, Settore Centro Fila 2, tipologia Normale, Mattina Prenotato, Pomeriggio Libero',
  slotStates: ['booked', 'free'] as const,
};

describe('UmbrellaCell', () => {
  it('è un button con aria-label testuale completa', () => {
    const btn = mount(UmbrellaCell, { props: { ...base } }).get('button');
    expect(btn.attributes('aria-label')).toContain('Mattina Prenotato');
    expect(btn.attributes('aria-label')).toContain('Pomeriggio Libero');
  });
  it("mostra l'etichetta", () => {
    expect(mount(UmbrellaCell, { props: { ...base } }).text()).toContain('8');
  });
  it('emette select al click', async () => {
    const w = mount(UmbrellaCell, { props: { ...base } });
    await w.get('button').trigger('click');
    expect(w.emitted('select')).toBeTruthy();
  });
  it('riflette la selezione (aria-pressed + ring)', () => {
    const w = mount(UmbrellaCell, { props: { ...base, selected: true } });
    const btn = w.get('button');
    expect(btn.attributes('aria-pressed')).toBe('true');
    expect(btn.classes()).toContain('outline');
  });
  it('N=1: tinta piena (nessun conic-gradient)', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['free'] } });
    expect(w.vm.uniform).toBe(true);
    expect(w.vm.bg).toBe('var(--color-state-free)');
  });
  it('fasce tutte uguali: tinta piena (nessun conic-gradient anche per N=3)', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['daily', 'daily', 'daily'] } });
    expect(w.vm.uniform).toBe(true);
    expect(w.vm.bg).toBe('var(--color-state-daily)');
  });
  it('N=3 stati misti: conic-gradient a spicchi (un colore per fascia)', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['free', 'daily', 'booked'] } });
    expect(w.vm.uniform).toBe(false);
    expect(w.vm.bg).toContain('conic-gradient');
    expect(w.vm.bg).toContain('var(--color-state-free)');
    expect(w.vm.bg).toContain('var(--color-state-daily)');
    expect(w.vm.bg).toContain('var(--color-state-booked)');
  });
  it('slotStates vuoto: non lancia, tratta come una fascia libera', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: [] } });
    expect(w.vm.uniform).toBe(true);
    expect(w.vm.bg).toBe('var(--color-state-free)');
  });
});
```

- [ ] **Step 2: Esegui la spec — deve FALLIRE (prop `slotStates` non esiste ancora, `w.vm.bg`/`uniform` non esposti)**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- UmbrellaCell`
Expected: FAIL (type/prop error su `slotStates`; `w.vm.bg` undefined).

- [ ] **Step 3: Riscrivi il componente**

Sostituisci **tutto** il contenuto di `packages/ui-kit/src/components/UmbrellaCell.vue` con:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { SlotState } from '@coralyn/contracts';
import Icon from './Icon.vue';

const props = withDefaults(defineProps<{
  label: string;
  ariaLabel: string;
  slotStates: SlotState[];
  typeIcon?: string | null;
  selected?: boolean;
}>(), { selected: false });

defineEmits<{ select: [] }>();

const fill: Record<SlotState, string> = {
  free: 'var(--color-state-free)', season: 'var(--color-state-season)',
  daily: 'var(--color-state-daily)', booked: 'var(--color-state-booked)',
};
const ink: Record<SlotState, string> = {
  free: 'var(--color-state-free-ink)', season: 'var(--color-state-season-ink)',
  daily: 'var(--color-state-daily-ink)', booked: 'var(--color-state-booked-ink)',
};

// N-agnostico: array vuoto → una fascia libera; nessun ramo speciale per N=2.
const states = computed<SlotState[]>(() => (props.slotStates.length ? props.slotStates : ['free']));
const uniform = computed(() => states.value.every((s) => s === states.value[0]));
const bg = computed(() => {
  if (uniform.value) return fill[states.value[0]];
  const n = states.value.length;
  // Spicchi uguali in senso orario da ore 12 (conic-gradient); stop netti tra i colori.
  const stops = states.value
    .map((s, i) => `${fill[s]} ${((i / n) * 100).toFixed(3)}% ${(((i + 1) / n) * 100).toFixed(3)}%`)
    .join(', ');
  return `conic-gradient(from 0deg, ${stops})`;
});
const color = computed(() => (uniform.value ? ink[states.value[0]] : 'var(--color-text)'));

// jsdom non serializza conic-gradient/var() nello style attribute → esponiamo i computed grezzi per i test.
defineExpose({ bg, uniform });
</script>

<template>
  <span class="relative inline-flex">
    <button
      type="button" :aria-label="ariaLabel" :aria-pressed="selected"
      class="grid size-[34px] place-items-center rounded-full text-xs font-semibold [font-variant-numeric:tabular-nums] transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      :class="selected ? 'outline outline-2 outline-offset-2 outline-[var(--color-brand)] [box-shadow:0_0_0_4px_var(--color-brand-tint)]' : '[box-shadow:var(--shadow-soft)]'"
      :style="{ background: bg, color }"
      @click="$emit('select')"
    >{{ label }}</button>
    <span v-if="typeIcon" class="absolute -right-1 -top-1 z-10 grid size-[15px] place-items-center rounded-full bg-[var(--color-surface)] text-[var(--color-accent)] [box-shadow:var(--shadow-soft)]">
      <Icon :name="typeIcon" :size="10" />
    </span>
  </span>
</template>
```

- [ ] **Step 4: Esegui la spec — deve PASSARE**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- UmbrellaCell`
Expected: PASS (8 test).

- [ ] **Step 5: Suite + typecheck ui-kit completi**

Run: `corepack pnpm --filter @coralyn/ui-kit test` poi `corepack pnpm --filter @coralyn/ui-kit typecheck`
Expected: entrambi PASS. Conteggio ui-kit **73** (numero `it` in `UmbrellaCell.spec` invariato: 4 vecchi rimpiazzati, ma erano 4 e ora sono 8 → il totale ui-kit sale a **77**; annota il nuovo numero come baseline). *(Non è una regressione: sono test additivi.)*

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/components/UmbrellaCell.vue packages/ui-kit/src/components/UmbrellaCell.spec.ts
git commit -m "feat(ui-kit): UmbrellaCell N-agnostica a spicchi (slotStates[] al posto di morning/afternoon)"
```

---

### Task 3: `MapView` N-box, messaggio disponibilità computato, mock 3-fasce (layer web-staff)

**Files:**
- Modify: `apps/web-staff/src/mocks/data/seed.ts`
- Modify: `apps/web-staff/src/features/map/MapView.vue`
- Test: `apps/web-staff/src/features/map/MapView.spec.ts`

**Interfaces:**
- Consumes: `UmbrellaCell` (Task 2) con prop **`slotStates: SlotState[]`**; `map.value.timeSlots` (già ordinabili per `sortOrder`), `u.stateBySlot`.
- Produces (helper interni al componente, riferiti dai test):
  - `slotStatesFor(u: UmbrellaDTO): SlotState[]` — stati per fascia nell'ordine `sortOrder`.
  - `liveStateFor(slotId: string): SlotState` — stato live dell'ombrellone selezionato per una fascia.
  - `availabilityMessage: string` — messaggio computato (copy verbatim in Global Constraints).

- [ ] **Step 1: Aggiungi al mock una config a 3 fasce con nomi non-standard**

In `apps/web-staff/src/mocks/data/seed.ts`, **in fondo al file**, aggiungi:

```ts
// Config a 3 fasce con nomi NON standard: esercita il caso N>2 (fascia centrale + nomi reali).
export const mapSeed3: DayMapDTO = {
  date: '2026-06-27',
  umbrellaTypes: [{ id: 't-palma', name: 'Palma', sortOrder: 1, icon: 'palmtree' }],
  timeSlots: [
    { id: 'alba', name: 'Alba', startTime: '06:00', endTime: '10:00', sortOrder: 1 },
    { id: 'giorno', name: 'Pieno giorno', startTime: '10:00', endTime: '16:00', sortOrder: 2 },
    { id: 'tramonto', name: 'Tramonto', startTime: '16:00', endTime: '20:00', sortOrder: 3 },
  ],
  sectors: [
    {
      id: 's-centro', name: 'Centro', sortOrder: 1,
      rows: [
        {
          id: 'row-1', label: 'Fila 1', sortOrder: 1,
          umbrellas: [
            // Fascia centrale occupata, estreme libere → "Libera nelle fasce: Alba, Tramonto"
            { id: 'o-mid', label: '1', umbrellaTypeId: 't-palma', rowId: 'row-1', stateBySlot: { alba: 'free', giorno: 'daily', tramonto: 'free' } },
            // Tutte libere → "Postazione libera tutto il giorno"
            { id: 'o-free', label: '2', umbrellaTypeId: 't-palma', rowId: 'row-1', stateBySlot: { alba: 'free', giorno: 'free', tramonto: 'free' } },
          ],
        },
      ],
    },
  ],
};
```

*(`DayMapDTO` è già importato in cima al file.)*

- [ ] **Step 2: Scrivi i nuovi test 3-fasce e riscrivi i test obsoleti (TDD)**

In `apps/web-staff/src/features/map/MapView.spec.ts`:

**(a)** Aggiungi in cima l'import del nuovo fixture:

```ts
import { mapSeed3 } from '@/mocks/data/seed';
```

**(b)** **Sostituisci integralmente** il test esistente `it('deriva le due metà dagli orari: Giornata intera occupa mattina+pomeriggio', ...)` (≈ righe 213-255) con questi due test:

```ts
  it('rende N spicchi per N fasce: la fascia "piena" NON viene più scartata (regressione anti-compressione)', async () => {
    // 3 fasce, tra cui una "Giornata intera" che copre l'intera banda: col vecchio codice veniva scartata.
    const map3 = {
      date: '2026-06-27',
      umbrellaTypes: [{ id: 't1', name: 'Palma', sortOrder: 1, icon: 'palmtree' }],
      timeSlots: [
        { id: 'mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
        { id: 'pom', name: 'Pomeriggio', startTime: '13:00', endTime: '19:00', sortOrder: 2 },
        { id: 'giorno', name: 'Giornata intera', startTime: '08:00', endTime: '19:00', sortOrder: 3 },
      ],
      sectors: [{
        id: 'sec', name: 'Centro', sortOrder: 1,
        rows: [{ id: 'r1', label: 'Fila 1', sortOrder: 1, umbrellas: [
          { id: 'u-mat', label: '2', umbrellaTypeId: 't1', rowId: 'r1',
            stateBySlot: { mat: 'daily', pom: 'free', giorno: 'free' } },
        ] }],
      }],
    };
    server.use(http.get('/api/map', () => HttpResponse.json(map3)));

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    const cell = w.findComponent({ name: 'UmbrellaCell' });
    // Tutte e 3 le fasce nell'ordine sortOrder (nessuna scartata)
    expect(cell.props('slotStates')).toEqual(['daily', 'free', 'free']);
    // aria-label elenca le 3 fasce reali col loro stato
    expect(cell.find('button').attributes('aria-label')).toContain('Mattina Giornaliero');
    expect(cell.find('button').attributes('aria-label')).toContain('Pomeriggio Libero');
    expect(cell.find('button').attributes('aria-label')).toContain('Giornata intera Libero');

    w.unmount();
  });

  it('drawer con N box reali: nomi delle fasce reali, fascia centrale selezionabile', async () => {
    server.use(http.get('/api/map', () => HttpResponse.json(mapSeed3)));

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    // Apri il drawer sul primo ombrellone (o-mid)
    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();

    const aside = w.find('aside');
    expect(aside.exists()).toBe(true);
    // Nomi reali, NON "Mattina"/"Pomeriggio" hardcoded
    expect(aside.text()).toContain('Alba');
    expect(aside.text()).toContain('Pieno giorno');
    expect(aside.text()).toContain('Tramonto');

    // La fascia centrale è selezionabile: clic sul box "Pieno giorno" → aria-pressed=true
    const midBox = aside.findAll('button').find((b) => b.text().includes('Pieno giorno'));
    expect(midBox).toBeTruthy();
    await midBox!.trigger('click');
    await flushPromises();
    expect(midBox!.attributes('aria-pressed')).toBe('true');

    w.unmount();
  });

  it('messaggio disponibilità: alcune fasce libere → "Libera nelle fasce: <nomi>"', async () => {
    server.use(http.get('/api/map', () => HttpResponse.json(mapSeed3)));

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    // o-mid: alba/tramonto libere, giorno occupato; nessuna prenotazione reale → drawer mostra il messaggio
    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();

    const aside = w.find('aside');
    expect(aside.text()).toContain('Libera nelle fasce:');
    expect(aside.text()).toContain('Alba');
    expect(aside.text()).toContain('Tramonto');
    expect(aside.text()).not.toContain("l'intera giornata");

    w.unmount();
  });

  it('messaggio disponibilità: tutte le fasce libere → "Postazione libera tutto il giorno"', async () => {
    server.use(http.get('/api/map', () => HttpResponse.json(mapSeed3)));

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    // Secondo ombrellone (o-free): tutte le fasce libere
    const cells = w.findAllComponents({ name: 'UmbrellaCell' });
    await cells[1].find('button').trigger('click');
    await flushPromises();

    const aside = w.find('aside');
    expect(aside.text()).toContain('Postazione libera tutto il giorno');

    w.unmount();
  });
```

**(c)** Nel test esistente `it('cliccando le fasce Mattina/Pomeriggio cambia la prenotazione mostrata (fix §5b)', ...)` **nessuna modifica** è richiesta: i box ora usano `v-for` sui nomi reali del mock (`Mattina`/`Pomeriggio`), quindi `findAll('button').find(b => b.text().includes('Pomeriggio'))` continua a funzionare.

- [ ] **Step 3: Esegui la spec — deve FALLIRE (MapView ancora a-2-metà, `slotStates` non passato, messaggi vecchi)**

Run: `corepack pnpm --filter web-staff test -- MapView`
Expected: FAIL (i nuovi test non trovano `slotStates`/nomi reali/messaggi; il test regressione trova ancora `morningState`).

- [ ] **Step 4: Aggiorna lo `<script setup>` di `MapView.vue`**

In `apps/web-staff/src/features/map/MapView.vue`:

**(4.1)** Rimuovi `TimeSlotDTO` dall'import di contracts (non più usato). La riga 4 diventa:

```ts
import type { UmbrellaDTO, SlotState, BookingDTO, BookingType } from '@coralyn/contracts';
```

**(4.2)** Sostituisci la definizione di `timeSlots` (riga 41) con una versione **ordinata per `sortOrder`**:

```ts
const timeSlots = computed(() => [...(map.value?.timeSlots ?? [])].sort((a, b) => a.sortOrder - b.sortOrder));
```

**(4.3)** **Elimina** il blocco `halfSlots` (righe 54-69).

**(4.4)** Sostituisci `slotState` + `ariaLabel` (righe 71-83) con:

```ts
function slotStatesFor(u: UmbrellaDTO): SlotState[] {
  return timeSlots.value.map((s) => (u.stateBySlot[s.id] ?? 'free') as SlotState);
}
function typeIcon(u: UmbrellaDTO): string | null {
  return u.umbrellaTypeId ? (typesById.value.get(u.umbrellaTypeId)?.icon ?? 'umbrella') : null;
}
function typeName(u: UmbrellaDTO): string {
  return u.umbrellaTypeId ? (typesById.value.get(u.umbrellaTypeId)?.name ?? 'Tipologia') : 'Normale';
}
function ariaLabel(u: UmbrellaDTO, sector: string, row: string): string {
  const perSlot = timeSlots.value
    .map((s) => `${s.name} ${STATE_LABEL[(u.stateBySlot[s.id] ?? 'free') as SlotState]}`)
    .join(', ');
  return `Ombrellone ${u.label}, Settore ${sector} ${row}, tipologia ${typeName(u)}, ${perSlot}`;
}
```

*(`typeIcon`/`typeName` sono invariati rispetto all'originale: riportati integri perché il blocco sostituito li conteneva.)*

**(4.5)** Nella funzione `open` (righe 89-95) sostituisci il fallback `halfSlots.value[0]?.id ??` così:

```ts
function open(u: UmbrellaDTO, sector: string, row: string) {
  sel.value = { u, sector, row };
  // Auto-seleziona la fascia che HA una prenotazione per questo ombrellone; altrimenti la prima fascia.
  const booked = (bookings.value ?? []).find((b) => b.umbrellaId === u.id);
  selectedSlotId.value = booked?.timeSlotId ?? timeSlots.value[0]?.id ?? '';
}
```

**(4.6)** **Elimina** `liveSlotState` + `morning` + `afternoon` (righe 98-103) e sostituiscili con `liveStateFor` + `availabilityMessage`. Mantieni `tintBg`/`tintBorder` (righe 104-105) invariati:

```ts
function liveStateFor(slotId: string): SlotState {
  return sel.value ? ((liveU.value.stateBySlot[slotId] ?? 'free') as SlotState) : 'free';
}
const availabilityMessage = computed<string>(() => {
  if (!sel.value) return '';
  const slots = timeSlots.value;
  if (slots.length === 0) return '';
  const free = slots.filter((s) => (liveU.value.stateBySlot[s.id] ?? 'free') === 'free');
  if (free.length === slots.length) return 'Postazione libera tutto il giorno';
  if (free.length > 0) return `Libera nelle fasce: ${free.map((s) => s.name).join(', ')}`;
  return 'Nessuna fascia libera';
});
function tintBg(s: SlotState) { return `color-mix(in srgb, ${STATE_COLOR[s]} 18%, var(--color-surface))`; }
function tintBorder(s: SlotState) { return `color-mix(in srgb, ${STATE_COLOR[s]} 40%, var(--color-surface))`; }
```

**(4.7)** **Elimina** `morningSlotId` + `afternoonSlotId` (righe 108-109). Mantieni `selectSlot` (riga 110):

```ts
function selectSlot(id: string) { if (id) selectedSlotId.value = id; }
```

*(`liveU`, `currentBooking`, `selUmbrella`, `firstFreeSlot`, `slotIsBusy`, `freeSlotOptions` restano invariati: già iterano `timeSlots`/`stateBySlot` in modo N-agnostico.)*

- [ ] **Step 5: Aggiorna il `<template>` di `MapView.vue`**

**(5.1)** Header hint (riga 236) — togli "· mattina / pomeriggio":

```html
        <Icon name="clock" :size="15" class="text-[var(--color-accent)]" />Stato per fascia
```

**(5.2)** Celle griglia (righe 257-260) — passa `slot-states`:

```html
            <UmbrellaCell v-for="u in r.umbrellas" :key="u.id" :label="u.label"
              :ariaLabel="ariaLabel(u, currentSector!.name, r.label)" :slot-states="slotStatesFor(u)"
              :type-icon="typeIcon(u)" :selected="sel?.u.id === u.id"
              @select="open(u, currentSector!.name, r.label)" />
```

**(5.3)** Celle Speciali (righe 266-269) — idem:

```html
            <UmbrellaCell v-for="u in r.umbrellas" :key="u.id" :label="u.label"
              :ariaLabel="ariaLabel(u, 'Speciali', r.label)" :slot-states="slotStatesFor(u)"
              :type-icon="typeIcon(u)" :selected="sel?.u.id === u.id"
              @select="open(u, 'Speciali', r.label)" />
```

**(5.4)** Legenda (riga 280) — swatch conic + copy "Stato misto":

```html
              <span class="inline-flex items-center gap-1.5"><i class="size-[13px] rounded-full" style="background:conic-gradient(from 0deg,var(--color-state-booked) 0 33.333%,var(--color-state-daily) 33.333% 66.666%,var(--color-state-free) 66.666% 100%)"></i>Stato misto</span>
```

**(5.5)** Box fasce nel drawer (righe 306-319) — sostituisci i **due box hardcoded** con un `v-for` sulle fasce reali:

```html
        <div class="mt-3 flex flex-wrap gap-2.5">
          <button v-for="s in timeSlots" :key="s.id" type="button" @click="selectSlot(s.id)"
            :aria-pressed="selectedSlotId === s.id"
            class="min-w-[92px] flex-1 rounded-[11px] p-3 text-left focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            :style="{ background: tintBg(liveStateFor(s.id)), border: `1px solid ${tintBorder(liveStateFor(s.id))}`, boxShadow: selectedSlotId === s.id ? 'inset 0 0 0 2px var(--color-accent)' : undefined }">
            <span class="mb-1 block text-[9.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-ink-600)]">{{ s.name }}</span>
            <span v-if="s.startTime && s.endTime" class="mb-1 block text-[9px] tabular-nums text-[var(--color-text-muted)]">{{ s.startTime }}–{{ s.endTime }}</span>
            <span class="text-[13px] font-semibold" :style="{ color: STATE_COLOR[liveStateFor(s.id)] }">{{ STATE_LABEL[liveStateFor(s.id)] }}</span>
          </button>
        </div>
```

**(5.6)** Messaggio disponibilità (righe 333-335) — usa il computed:

```html
        <div v-else class="mt-3.5 rounded-xl border border-dashed border-[var(--color-warm-border-seg)] bg-[var(--color-warm-075)] p-4 text-center text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
          {{ availabilityMessage }}
        </div>
```

- [ ] **Step 6: Esegui la spec — deve PASSARE**

Run: `corepack pnpm --filter web-staff test -- MapView`
Expected: PASS (tutti i test MapView, inclusi i 4 nuovi).

- [ ] **Step 7: Suite web-staff completa + typecheck (+ ui-kit per il glob)**

Run in sequenza:
```
corepack pnpm --filter web-staff test
corepack pnpm --filter web-staff typecheck
corepack pnpm --filter @coralyn/ui-kit test
```
Expected: tutti PASS. web-staff sale rispetto a 257 (net: −1 test rimosso «Giornata intera» + 4 nuovi = **+3** → **260**; annota il numero reale osservato). typecheck **pulito**. ui-kit resta verde.

- [ ] **Step 8: Commit**

```bash
git add apps/web-staff/src/mocks/data/seed.ts apps/web-staff/src/features/map/MapView.vue apps/web-staff/src/features/map/MapView.spec.ts
git commit -m "feat(web-staff): mappa rende N fasce reali (celle a spicchi, drawer a N box, messaggio disponibilità computato)"
```

---

## Self-Review (eseguita)

**1. Copertura spec:**
- §1 bug «fasce centrali sparite» → Task 1 (backend lock) + Task 3 test «rende N spicchi… fascia piena NON scartata» + `slotStatesFor` che itera tutte le fasce. ✓
- §1 bug «nomi/orari ignorati» → Task 3 drawer `v-for` con `s.name`/`s.startTime–endTime` + test «drawer con N box reali». ✓
- §1 bug «messaggio errato» → Task 3 `availabilityMessage` + 2 test messaggio. ✓
- §3.1 cella N-agnostica a spicchi → Task 2. ✓
- §3.2 modale N box reali selezionabili → Task 3 (5.5) + test centrale selezionabile. ✓
- §3.3 messaggio computato (all-free / some-free / none-free) → Task 3 `availabilityMessage` (3 rami). ✓
- §3.4 prenotazione per-fascia invariata → `selectedSlotId`/`createBooking`/`open()` invariati (solo fallback aggiornato). ✓
- §3.5 partizione disgiunta / FE-only → §5 verificato; Task 1 lock. ✓
- §4 impatto file → tutti coperti (UmbrellaCell, MapView, spec, mock). ✓
- §5 verifica 3 fasce → Task 1 (unit projection) + Task 3 (mock FE 3 fasce). ✓
- §7 deferito (overlap/giornata-intera cross-fascia) → **NON** implementato (corretto); registrare come **D-048** in `deferred.md` è un follow-up di documentazione fuori da questo piano (annotato per l'handoff).

**2. Placeholder scan:** nessun TODO/TBD/"handle edge cases"; ogni step di codice riporta il codice completo. ✓

**3. Coerenza tipi:** `slotStates: SlotState[]` coerente tra Task 2 (definizione + `defineExpose`) e Task 3 (`:slot-states="slotStatesFor(u)"`, `slotStatesFor(): SlotState[]`). `liveStateFor`/`availabilityMessage`/`STATE_LABEL`/`STATE_COLOR` coerenti. Copy messaggi identica tra Global Constraints, componente e test. ✓

**Nota di sequenza ribadita:** tra la fine di Task 2 e la fine di Task 3, `web-staff` non typechecka (atteso). I gate per-layer sono verdi; la review whole-branch (opus) valida la verde d'insieme finale.
