# Rework Mappa «Riva» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework completo della Mappa di `web-staff`: scena «Riva» (mare a velature + bagnasciuga + grana), cella «Tessera» a colonne per fascia, dettaglio in drawer overlay (riallinea ADR-0019), occupazione settore/fila, legenda operativa, ricerca rapida, hovercard.

**Architecture:** I primitivi cambiano in `ui-kit` (UmbrellaCell rework, SegmentedControl esteso, nuovo HoverCard su reka-ui); le derivazioni dati sono funzioni pure in `mapDerive.ts` (testabili senza DOM); `MapView.vue` compone tutto; la scena vive in un CSS feature-scoped. Nessuna nuova API backend: tutti i dati sono già nel FE.

**Tech Stack:** Vue 3 + TS, Tailwind v4 (token in `@theme`), reka-ui (solo dietro ui-kit), TanStack Query, vitest + MSW + @vue/test-utils.

**Spec:** [`docs/superpowers/specs/2026-07-21-map-redesign-riva-design.md`](../specs/2026-07-21-map-redesign-riva-design.md) · **Mockup approvato:** [`docs/design/mockups/map-redesign-esplorazione.html`](../../design/mockups/map-redesign-esplorazione.html)

## Global Constraints

- **Branch di lavoro:** `feat/map-redesign-riva` da `main` (crearlo al Task 1 se non esiste: `git checkout -b feat/map-redesign-riva`).
- **reka-ui SOLO dietro ui-kit** — `web-staff` non lo importa mai direttamente (ADR-0017).
- **Solo token semantici Coralyn** — nessun hex hardcoded nei componenti (i soli hex ammessi sono i NUOVI token in `theme.css`).
- **Test:** girare SEMPRE l'intera suite (`npx vitest run` da `apps/web-staff`, include gli spec ui-kit), mai solo lo spec toccato. Typecheck: `pnpm -C apps/web-staff typecheck`.
- **API di `UmbrellaCell` retro-compatibile**: props esistenti (`label/ariaLabel/slotStates/typeIcon/selected`) invariate; le nuove (`dimmed/found`) sono opzionali.
- **`prefers-reduced-motion`**: ogni animazione nuova va neutralizzata sotto media query.
- **Metrica occupazione (spec §6):** postazione occupata = **almeno una fascia ≠ `free`** (`covered` conta come occupata). Diversa dalla metrica Report/D-048: è disponibilità operativa, non venduto.
- **Ordine fasce = `sortOrder`** (Mattina a sinistra nella Tessera).
- I test jsdom non vedono la resa ai breakpoint né l'hover reale: coprono il **comportamento**; la resa si verifica nel browser a fine lavoro (login utente richiesto).

---

### Task 1: Token scena + `UmbrellaCell` «Tessera» (ui-kit)

**Files:**
- Modify: `packages/ui-kit/src/styles/theme.css` (token + keyframe)
- Modify: `packages/ui-kit/src/components/UmbrellaCell.vue` (rework completo)
- Modify: `packages/ui-kit/src/components/UmbrellaCell.spec.ts` (riscrittura assertion resa)

**Interfaces:**
- Produces: `UmbrellaCell` props `{ label: string; ariaLabel: string; slotStates: readonly SlotState[]; typeIcon?: string | null; selected?: boolean; dimmed?: boolean; found?: boolean }`; expose per test `{ uniform: ComputedRef<boolean>, fills: ComputedRef<string[]> }` (`fills` = token colore per colonna, length 1 se uniforme). Token CSS `--color-sea-deep`, `--shadow-sun`; keyframe `cell-found`.

- [ ] **Step 1: Aggiorna gli spec esistenti alla nuova resa (falliranno)**

Sostituisci in `UmbrellaCell.spec.ts` i test che usano `vm.bg`/conic con la nuova API `fills` e aggiungi i casi `dimmed`/`found`. Contenuto completo del file:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UmbrellaCell from './UmbrellaCell.vue';

const base = {
  label: '8',
  ariaLabel: 'Ombrellone 8, Settore Centro Fila 2, tipologia Normale, Mattina Prenotato, Pomeriggio Libero',
  slotStates: ['booked', 'free'] as const,
};

describe('UmbrellaCell (Tessera)', () => {
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
  it('N=1: una sola colonna piena', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['free'] } });
    expect(w.vm.uniform).toBe(true);
    expect(w.vm.fills).toEqual(['var(--color-state-free)']);
  });
  it('fasce tutte uguali: uniforme anche per N=3', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['daily', 'daily', 'daily'] } });
    expect(w.vm.uniform).toBe(true);
    expect(w.vm.fills).toEqual(['var(--color-state-daily)']);
  });
  it('N=3 misti: una colonna per fascia NELL\'ORDINE delle fasce (prima a sinistra)', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['free', 'daily', 'booked'] } });
    expect(w.vm.uniform).toBe(false);
    expect(w.vm.fills).toEqual([
      'var(--color-state-free)', 'var(--color-state-daily)', 'var(--color-state-booked)',
    ]);
  });
  it('slotStates vuoto: non lancia, tratta come una fascia libera', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: [] } });
    expect(w.vm.uniform).toBe(true);
    expect(w.vm.fills).toEqual(['var(--color-state-free)']);
  });
  it('la fascia coperta è una colonna col colore neutro', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['daily', 'covered'] } });
    expect(w.vm.uniform).toBe(false);
    expect(w.vm.fills).toEqual(['var(--color-state-daily)', 'var(--color-state-covered)']);
  });
  it('N=1 coperta: colonna piena neutra', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['covered'] } });
    expect(w.vm.uniform).toBe(true);
    expect(w.vm.fills).toEqual(['var(--color-state-covered)']);
  });
  it('dimmed: il wrapper si attenua (filtro legenda)', () => {
    const w = mount(UmbrellaCell, { props: { ...base, dimmed: true } });
    expect(w.classes()).toContain('opacity-25');
  });
  it('found: il button porta l\'animazione di impulso (ricerca)', () => {
    const w = mount(UmbrellaCell, { props: { ...base, found: true } });
    expect(w.get('button').attributes('class')).toContain('cell-found');
  });
  it('typeIcon: rende il marcatore tipologia', () => {
    const w = mount(UmbrellaCell, { props: { ...base, typeIcon: 'palmtree' } });
    expect(w.find('[data-test="type-badge"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run (da `apps/web-staff`): `npx vitest run ../../packages/ui-kit/src/components/UmbrellaCell.spec.ts`
Expected: FAIL (`fills` non esiste, `opacity-25`/`cell-found`/`type-badge` assenti).

- [ ] **Step 3: Aggiungi i token e la keyframe in `theme.css`**

Nella riga `/* Mare */` aggiungi `--color-sea-deep`:

```css
  /* Mare */
  --color-sea-1: #E0EFF3; --color-sea-2: #BEDDE8; --color-sea-3: #A8D0DE; --color-sea-deep: #8FC2D4; --color-sea-ink: #2E6B81;
```

Dopo la riga `--shadow-brand: 0 2px 8px rgba(224,121,90,.3);` aggiungi:

```css
  /* Ombra "da sole alto" delle celle mappa (tinta stage-1 calda, portata in basso) */
  --shadow-sun: 0 5px 9px -3px rgba(138,110,63,.30), 0 1px 2px rgba(138,110,63,.12);
```

Nella sezione keyframes (dopo `overlay-out`) aggiungi:

```css
@keyframes cell-found { 0%,100% { box-shadow: 0 0 0 0 rgba(224,121,90,0), var(--shadow-sun); }
  45% { box-shadow: 0 0 0 9px rgba(224,121,90,.28), var(--shadow-sun); } }
```

(La keyframe usa l'alpha del coral brand `#E0795A` → `rgba(224,121,90,…)`: unico posto dove il valore è espanso, come già fanno `--ring-focus`/`--shadow-brand`.)

- [ ] **Step 4: Riscrivi `UmbrellaCell.vue` (Tessera)**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { SlotState } from '@coralyn/contracts';
import Icon from './Icon.vue';

const props = withDefaults(defineProps<{
  label: string;
  ariaLabel: string;
  slotStates: readonly SlotState[];
  typeIcon?: string | null;
  selected?: boolean;
  dimmed?: boolean;
  found?: boolean;
}>(), { selected: false, dimmed: false, found: false });

defineEmits<{ select: [] }>();

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

// N-agnostico: array vuoto → una fascia libera; nessun ramo speciale per N=2.
const states = computed<readonly SlotState[]>(() => (props.slotStates.length ? props.slotStates : ['free']));
const uniform = computed(() => states.value.every((s) => s === states.value[0]));
/** Colonne verticali nell'ordine delle fasce (prima fascia a sinistra); length 1 se uniforme. */
const fills = computed<string[]>(() =>
  uniform.value ? [fill[states.value[0]]] : states.value.map((s) => fill[s]),
);
const color = computed(() => (uniform.value ? ink[states.value[0]] : 'var(--color-text)'));

// jsdom non serializza var() negli style: esponiamo i computed grezzi per i test.
defineExpose({ uniform, fills });
</script>

<template>
  <span class="relative inline-flex transition-[opacity,filter] duration-200" :class="dimmed ? 'opacity-25 saturate-50' : ''">
    <button
      type="button" :aria-label="ariaLabel" :aria-pressed="selected"
      class="relative grid size-11 place-items-center overflow-hidden rounded-[12px] text-xs font-semibold [font-variant-numeric:tabular-nums] transition-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[.97] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] lg:size-10"
      :class="[
        selected
          ? 'outline outline-2 outline-offset-2 outline-[var(--color-brand)] [box-shadow:0_0_0_4px_var(--color-brand-tint)]'
          : '[box-shadow:var(--shadow-sun)]',
        found ? '[animation:cell-found_1.15s_var(--ease-standard)_2]' : '',
      ]"
      :style="{ color }"
      @click="$emit('select')"
    >
      <span aria-hidden="true" class="absolute inset-0 flex">
        <span v-for="(f, i) in fills" :key="i" class="h-full flex-1"
          :class="i > 0 ? 'border-l border-[rgba(255,255,255,.55)]' : ''" :style="{ background: f }"></span>
      </span>
      <span aria-hidden="true" class="absolute inset-x-0 top-0 h-[35%] bg-gradient-to-b from-white/35 to-transparent"></span>
      <span class="relative z-[1]">{{ label }}</span>
    </button>
    <span v-if="typeIcon" data-test="type-badge" class="absolute -right-1 -top-1 z-10 grid size-[15px] place-items-center rounded-full bg-[var(--color-surface)] text-[var(--color-accent)] [box-shadow:var(--shadow-soft)]">
      <Icon :name="typeIcon" :size="10" />
    </span>
  </span>
</template>
```

Nota dimensioni: `size-11` (44px, compatto/touch) mobile-first, `lg:size-10` (40px, esteso) — spec §4.

- [ ] **Step 5: Verifica che i test passino**

Run: `npx vitest run ../../packages/ui-kit/src/components/UmbrellaCell.spec.ts`
Expected: PASS (13 test).

- [ ] **Step 6: Suite intera + typecheck**

Run (da `apps/web-staff`): `npx vitest run` poi `pnpm typecheck`
Expected: la suite può avere FAIL **solo** in `MapView.spec.ts` sui test che asseriscono la resa a
spicchi. In particolare `rende N spicchi per N fasce: …` : se asserisce su `vm.bg`/`conic-gradient`
della cella, aggiorna l'assertion alla nuova API (`fills` con N elementi nell'ordine delle fasce,
es. `expect(cell.vm.fills).toHaveLength(3)`), PRESERVANDO l'intento anti-compressione (la fascia
"piena" non viene scartata). Nessun test va cancellato. Tutto il resto verde, typecheck pulito.

- [ ] **Step 7: Commit**

```bash
git add packages/ui-kit/src/styles/theme.css packages/ui-kit/src/components/UmbrellaCell.vue packages/ui-kit/src/components/UmbrellaCell.spec.ts
git commit -m "feat(ui-kit): UmbrellaCell 'Tessera' - colonne per fascia, dimmed/found, ombra da sole"
```

---

### Task 2: `SegmentedControl` con `hint` per opzione (ui-kit)

**Files:**
- Modify: `packages/ui-kit/src/components/SegmentedControl.vue`
- Modify: `packages/ui-kit/src/components/SegmentedControl.spec.ts`

**Interfaces:**
- Produces: `options: { value: string; label: string; hint?: string }[]` — `hint` è testo secondario (qui: la % occupazione). Retro-compatibile: senza `hint` la resa è identica a oggi.

- [ ] **Step 1: Aggiungi i test (falliranno)**

In coda al `describe` esistente di `SegmentedControl.spec.ts` aggiungi:

```ts
  it('rende l\'hint secondario quando presente', () => {
    const w = mount(SegmentedControl, {
      props: { modelValue: 'a', options: [{ value: 'a', label: 'Centro', hint: '82%' }, { value: 'b', label: 'Levante' }] },
    });
    const hints = w.findAll('[data-test="seg-hint"]');
    expect(hints).toHaveLength(1);
    expect(hints[0].text()).toBe('82%');
  });
  it('senza hint: nessuno span extra', () => {
    const w = mount(SegmentedControl, {
      props: { modelValue: 'a', options: [{ value: 'a', label: 'Centro' }] },
    });
    expect(w.find('[data-test="seg-hint"]').exists()).toBe(false);
  });
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run ../../packages/ui-kit/src/components/SegmentedControl.spec.ts`
Expected: FAIL (`seg-hint` assente).

- [ ] **Step 3: Estendi il componente**

`SegmentedControl.vue` completo:

```vue
<script setup lang="ts">
defineProps<{ modelValue: string; options: { value: string; label: string; hint?: string }[] }>();
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>
<template>
  <div role="radiogroup" class="inline-flex gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-warm-border-seg)] bg-[var(--color-warm-250)] p-[3px]">
    <button v-for="o in options" :key="o.value" role="radio" :aria-checked="o.value === modelValue"
      class="inline-flex items-baseline gap-1.5 rounded-[9px] px-3.5 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      :class="o.value === modelValue ? 'bg-[var(--color-surface)] font-semibold text-[var(--color-text)] [box-shadow:var(--shadow-soft)]' : 'text-[var(--color-ink-600)] hover:text-[var(--color-text)]'"
      @click="$emit('update:modelValue', o.value)">{{ o.label }}<span v-if="o.hint" data-test="seg-hint"
        class="text-[10px] font-bold tabular-nums" :class="o.value === modelValue ? 'text-[var(--color-accent)]' : 'text-[var(--color-stage-2)]'">{{ o.hint }}</span></button>
  </div>
</template>
```

- [ ] **Step 4: Verifica che passino** — Run: `npx vitest run ../../packages/ui-kit/src/components/SegmentedControl.spec.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-kit/src/components/SegmentedControl.vue packages/ui-kit/src/components/SegmentedControl.spec.ts
git commit -m "feat(ui-kit): SegmentedControl - hint secondario opzionale per opzione"
```

---

### Task 3: primitivo `HoverCard` (ui-kit, su reka-ui)

**Files:**
- Create: `packages/ui-kit/src/components/HoverCard.vue`
- Create: `packages/ui-kit/src/components/HoverCard.spec.ts`
- Modify: `packages/ui-kit/src/index.ts` (aggiungi l'export accanto agli altri componenti)

**Interfaces:**
- Produces: `HoverCard` — props `{ disabled?: boolean; openDelay?: number; closeDelay?: number; defaultOpen?: boolean }` (default: `false / 350 / 150 / false`); slot `trigger` (l'elemento che attiva) e `content`. Con `disabled: true` rende SOLO il trigger (zero overhead touch). reka-ui resta incapsulato qui (ADR-0017).

- [ ] **Step 1: Scrivi i test (falliranno)**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import HoverCard from './HoverCard.vue';

afterEach(() => { document.body.innerHTML = ''; });

const slots = {
  trigger: '<button>cella</button>',
  content: '<p>Ombrellone 8 — Mattina Prenotato</p>',
};

describe('HoverCard', () => {
  it('disabled: rende solo il trigger, nessun contenuto montato', () => {
    const w = mount(HoverCard, { props: { disabled: true }, slots });
    expect(w.find('button').exists()).toBe(true);
    expect(document.body.textContent).not.toContain('Ombrellone 8');
  });
  it('defaultOpen: il contenuto è nel portal (body)', () => {
    mount(HoverCard, { props: { defaultOpen: true }, slots, attachTo: document.body });
    expect(document.body.textContent).toContain('Ombrellone 8 — Mattina Prenotato');
  });
  it('default (chiuso): trigger presente, contenuto assente', () => {
    const w = mount(HoverCard, { slots, attachTo: document.body });
    expect(w.find('button').exists()).toBe(true);
    expect(document.body.textContent).not.toContain('Ombrellone 8');
  });
});
```

- [ ] **Step 2: Verifica che falliscano** — Run: `npx vitest run ../../packages/ui-kit/src/components/HoverCard.spec.ts` → FAIL (modulo inesistente).

- [ ] **Step 3: Implementa il componente**

```vue
<script setup lang="ts">
import { HoverCardRoot, HoverCardTrigger, HoverCardPortal, HoverCardContent, HoverCardArrow } from 'reka-ui';

withDefaults(defineProps<{
  /** true = rende solo il trigger (es. dispositivi touch: la card non esiste). */
  disabled?: boolean;
  openDelay?: number;
  closeDelay?: number;
  defaultOpen?: boolean;
}>(), { disabled: false, openDelay: 350, closeDelay: 150, defaultOpen: false });
</script>
<template>
  <slot v-if="disabled" name="trigger" />
  <HoverCardRoot v-else :open-delay="openDelay" :close-delay="closeDelay" :default-open="defaultOpen">
    <HoverCardTrigger as-child><slot name="trigger" /></HoverCardTrigger>
    <HoverCardPortal>
      <HoverCardContent side="top" :side-offset="8"
        class="z-[45] min-w-[200px] rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 [box-shadow:var(--shadow-drawer)] data-[state=open]:[animation:overlay-in_var(--motion-fast)_var(--ease-standard)]">
        <slot name="content" />
        <HoverCardArrow class="fill-[var(--color-surface)]" :width="10" :height="5" />
      </HoverCardContent>
    </HoverCardPortal>
  </HoverCardRoot>
</template>
```

(`z-[45]`: sopra lo stage, sotto drawer `z-50` e scrim `z-40`+drawer — la card non deve mai coprire un drawer aperto.)

In `packages/ui-kit/src/index.ts` aggiungi l'export nello stesso stile delle righe esistenti (cerca `export { default as Drawer }` e aggiungi accanto):

```ts
export { default as HoverCard } from './components/HoverCard.vue';
```

- [ ] **Step 4: Verifica che passino** — Run: `npx vitest run ../../packages/ui-kit/src/components/HoverCard.spec.ts` → PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add packages/ui-kit/src/components/HoverCard.vue packages/ui-kit/src/components/HoverCard.spec.ts packages/ui-kit/src/index.ts
git commit -m "feat(ui-kit): primitivo HoverCard su reka-ui (trigger/content, disabled per touch)"
```

---

### Task 4: derivazioni pure `mapDerive.ts` (occupazione, ricerca, hover)

**Files:**
- Create: `apps/web-staff/src/features/map/mapDerive.ts`
- Create: `apps/web-staff/src/features/map/mapDerive.spec.ts`

**Interfaces:**
- Consumes: tipi `UmbrellaDTO`, `RowDTO`, `SectorDTO`, `TimeSlotDTO`, `SlotState`, `BookingDTO`, `CustomerDTO` da `@coralyn/contracts`.
- Produces (usate dai Task 7–10):
  - `isOccupied(u: UmbrellaDTO): boolean`
  - `rowOccupancy(row: RowDTO): { occupied: number; total: number }`
  - `sectorOccupancyPct(sector: SectorDTO): number` (0–100, arrotondato)
  - `matchesQuery(u: UmbrellaDTO, query: string, customerNames: readonly string[]): boolean`
  - `namesByUmbrella(bookings: readonly BookingDTO[], customers: readonly CustomerDTO[]): Map<string, string[]>`

- [ ] **Step 1: Scrivi i test (falliranno)**

```ts
import { describe, it, expect } from 'vitest';
import type { RowDTO, SectorDTO, UmbrellaDTO } from '@coralyn/contracts';
import { isOccupied, rowOccupancy, sectorOccupancyPct, matchesQuery, namesByUmbrella } from './mapDerive';

const u = (id: string, stateBySlot: UmbrellaDTO['stateBySlot']): UmbrellaDTO =>
  ({ id, label: id.replace('o-', ''), umbrellaTypeId: null, rowId: 'r-1', stateBySlot });

describe('isOccupied — disponibilità operativa (spec §6)', () => {
  it('tutte le fasce libere → NON occupata', () => {
    expect(isOccupied(u('o-1', { m: 'free', p: 'free' }))).toBe(false);
  });
  it('almeno una fascia ≠ free → occupata', () => {
    expect(isOccupied(u('o-1', { m: 'booked', p: 'free' }))).toBe(true);
  });
  it('covered CONTA come occupata (non prenotabile)', () => {
    expect(isOccupied(u('o-1', { m: 'covered', p: 'free' }))).toBe(true);
  });
  it('stateBySlot vuoto → non occupata (difensivo)', () => {
    expect(isOccupied(u('o-1', {}))).toBe(false);
  });
});

describe('rowOccupancy / sectorOccupancyPct', () => {
  const row: RowDTO = { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [
    u('o-1', { m: 'daily', p: 'daily' }), u('o-2', { m: 'free', p: 'free' }), u('o-8', { m: 'booked', p: 'free' }),
  ] };
  it('conta occupate/totali per fila', () => {
    expect(rowOccupancy(row)).toEqual({ occupied: 2, total: 3 });
  });
  it('percentuale settore arrotondata', () => {
    const sector: SectorDTO = { id: 's-1', name: 'Centro', sortOrder: 1, rows: [row] };
    expect(sectorOccupancyPct(sector)).toBe(67); // 2/3
  });
  it('settore vuoto → 0 (niente divisione per zero)', () => {
    expect(sectorOccupancyPct({ id: 's', name: 'X', sortOrder: 1, rows: [] })).toBe(0);
  });
});

describe('matchesQuery — ricerca (spec §7)', () => {
  const omb = u('o-8', { m: 'booked', p: 'free' }); // label '8'
  it('match per etichetta esatta, case-insensitive', () => {
    expect(matchesQuery(omb, '8', [])).toBe(true);
    expect(matchesQuery({ ...omb, label: '20BIS' }, '20bis', [])).toBe(true);
  });
  it('NO match per etichetta parziale (8 non matcha 18)', () => {
    expect(matchesQuery({ ...omb, label: '18' }, '8', [])).toBe(false);
  });
  it('match per cliente substring (min 2 char)', () => {
    expect(matchesQuery(omb, 'ross', ['Mario Rossi'])).toBe(true);
    expect(matchesQuery(omb, 'r', ['Mario Rossi'])).toBe(false);
  });
  it('query vuota/spazi → mai match', () => {
    expect(matchesQuery(omb, '  ', ['Mario Rossi'])).toBe(false);
  });
});

describe('namesByUmbrella', () => {
  it('aggrega i nomi dei clienti per ombrellone dai booking del giorno', () => {
    const bookings = [
      { id: 'b-1', umbrellaId: 'o-8', customerId: 'c-1' },
      { id: 'b-2', umbrellaId: 'o-8', customerId: 'c-2' },
      { id: 'b-3', umbrellaId: 'o-1', customerId: 'c-manca' },
    ] as never[];
    const customers = [
      { id: 'c-1', firstName: 'Mario', lastName: 'Rossi' },
      { id: 'c-2', firstName: 'Luca', lastName: 'Bianchi' },
    ] as never[];
    const m = namesByUmbrella(bookings, customers);
    expect(m.get('o-8')).toEqual(['Mario Rossi', 'Luca Bianchi']);
    expect(m.get('o-1')).toEqual([]); // cliente non trovato → nessun nome, nessun crash
  });
});
```

- [ ] **Step 2: Verifica che falliscano** — Run: `npx vitest run src/features/map/mapDerive.spec.ts` → FAIL (modulo inesistente).

- [ ] **Step 3: Implementa**

```ts
import type { BookingDTO, CustomerDTO, RowDTO, SectorDTO, UmbrellaDTO } from '@coralyn/contracts';

/** Disponibilità operativa (spec rework Riva §6): una postazione è occupata se ALMENO una
 *  fascia non è 'free'. 'covered' conta come occupata (non è prenotabile). Metrica DIVERSA
 *  dal Report (D-048), che misura il venduto: qui si misura il prenotabile. */
export function isOccupied(u: UmbrellaDTO): boolean {
  return Object.values(u.stateBySlot).some((s) => s !== 'free');
}

export function rowOccupancy(row: RowDTO): { occupied: number; total: number } {
  const occupied = row.umbrellas.filter(isOccupied).length;
  return { occupied, total: row.umbrellas.length };
}

export function sectorOccupancyPct(sector: SectorDTO): number {
  const umbrellas = sector.rows.flatMap((r) => r.umbrellas);
  if (umbrellas.length === 0) return 0;
  return Math.round((umbrellas.filter(isOccupied).length / umbrellas.length) * 100);
}

/** Ricerca: etichetta ESATTA (case-insensitive) oppure nome cliente substring (min 2 char). */
export function matchesQuery(u: UmbrellaDTO, query: string, customerNames: readonly string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (u.label.toLowerCase() === q) return true;
  return q.length >= 2 && customerNames.some((n) => n.toLowerCase().includes(q));
}

/** Nomi cliente per ombrellone dai booking del giorno (per ricerca e hovercard). */
export function namesByUmbrella(
  bookings: readonly BookingDTO[], customers: readonly CustomerDTO[],
): Map<string, string[]> {
  const byId = new Map(customers.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
  const out = new Map<string, string[]>();
  for (const b of bookings) {
    const list = out.get(b.umbrellaId) ?? [];
    const name = byId.get(b.customerId);
    if (name) list.push(name);
    out.set(b.umbrellaId, list);
  }
  return out;
}
```

- [ ] **Step 4: Verifica che passino** — Run: `npx vitest run src/features/map/mapDerive.spec.ts` → PASS (12 test).

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/map/mapDerive.ts apps/web-staff/src/features/map/mapDerive.spec.ts
git commit -m "feat(web-staff): mapDerive - occupazione operativa, match ricerca, nomi per ombrellone"
```

---

### Task 5: dettaglio in drawer overlay (MapView + fix larghezza Drawer)

**Files:**
- Modify: `packages/ui-kit/src/components/Drawer.vue` (solo classe larghezza)
- Modify: `apps/web-staff/src/features/map/MapView.vue` (aside → Drawer)
- Modify: `apps/web-staff/src/features/map/MapView.spec.ts` (adattamento selettori)

**Interfaces:**
- Consumes: `Drawer` ui-kit (`v-model:open`, prop `title`, slot default + `footer`).
- Produces: MapView senza `aside` inline; drawer aperto ⇔ `sel !== null`.

- [ ] **Step 1: Fix additivo larghezza `Drawer`** — in `Drawer.vue` sostituisci `w-[380px]` con `w-[380px] max-w-[calc(100vw-24px)]` (su telefono il drawer non sfora; ovunque else identico).

- [ ] **Step 2: Sposta il contenuto dell'aside nel Drawer**

In `MapView.vue`:
1. aggiungi `Drawer` all'import da `@coralyn/ui-kit` (rimuovi `IconButton` se resta inutilizzato dopo il passaggio — il bottone X del pannello sparisce, lo fornisce il Drawer);
2. sostituisci l'intero blocco `<aside v-if="sel" …>…</aside>` con:

```vue
    <Drawer :open="sel !== null" @update:open="(v: boolean) => { if (!v) close(); }"
      :title="sel ? `Ombrellone «${sel.u.label}»` : ''">
      <template v-if="sel">
        <div class="flex items-center gap-2">
          <Badge tone="accent"><Icon :name="typeIcon(sel.u) ?? 'umbrella'" :size="12" />{{ typeName(sel.u) }}</Badge>
          <span class="text-xs text-[var(--color-text-muted)]">Settore {{ sel.sector }} · {{ sel.row }}</span>
        </div>
        <!-- QUI, INVARIATO, tutto il contenuto interno dell'ex-aside dal blocco
             "fasce cliccabili" (mt-3 flex flex-wrap gap-2.5) fino al blocco disponibilità/copritori:
             identico com'era, solo reindentato dentro il template del Drawer. -->
      </template>
      <template #footer>
        <div class="flex flex-col gap-2">
          <Button @click="openModal()"><Icon name="plus" :size="17" />Nuova prenotazione</Button>
          <Button variant="secondary" @click="openModal('subscription')"><Icon name="star" :size="15" />Abbonamento</Button>
        </div>
      </template>
    </Drawer>
```

Il vecchio header dell'aside (eyebrow "Ombrellone" + h3 + X) sparisce: titolo e chiusura li dà il `Drawer`. Il wrapper flex esterno della mappa perde il ramo `lg:flex-row` (la mappa è sempre full-width): sostituisci `class="flex flex-1 flex-col items-stretch gap-[18px] px-[26px] pb-[26px] pt-4 lg:flex-row"` con `class="flex flex-1 flex-col px-[26px] pb-[26px] pt-4"`.

- [ ] **Step 3: Adatta gli spec di MapView**

Run: `npx vitest run src/features/map/MapView.spec.ts` e osserva i fallimenti. Regole di adattamento (STESSO pattern già usato nel file per il contenuto del `Modal`, che è in portal — cerca nel file come vengono asseriti i testi del modale e replica):
- le assertion sul dettaglio (cliente, importo, fasce, «Non disponibile», copritori) ora leggono dal portal del Drawer;
- il click di chiusura non è più l'IconButton dell'aside ma il bottone "Chiudi" del Drawer;
- nessun test deve essere CANCELLATO: solo selettori/scoping aggiornati.

Expected dopo l'adattamento: `npx vitest run src/features/map/MapView.spec.ts` → PASS (21 test).

- [ ] **Step 4: Suite + typecheck** — `npx vitest run` e `pnpm typecheck` → verdi.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-kit/src/components/Drawer.vue apps/web-staff/src/features/map/MapView.vue apps/web-staff/src/features/map/MapView.spec.ts
git commit -m "feat(web-staff): dettaglio mappa in Drawer overlay (riallinea ADR-0019), mappa full-width"
```

---

### Task 6: scena «Riva» (mare, bagnasciuga, grana, marcatori fila, reveal)

**Files:**
- Create: `apps/web-staff/src/styles/map-scene.css`
- Modify: `apps/web-staff/src/styles/main.css` (aggiungi `@import './map-scene.css';` accanto agli import esistenti)
- Modify: `apps/web-staff/src/features/map/MapView.vue` (markup scena)

**Interfaces:**
- Produces: classi CSS `map-stage`, `map-sea`, `map-sea-veil` (×3 con `--i`), `map-shore`, `map-row-in`. Nessun cambio di comportamento: la suite esistente resta verde.

- [ ] **Step 1: Scrivi `map-scene.css`**

```css
/* Scena «Riva» della Mappa (spec 2026-07-21-map-redesign-riva §3).
   Feature-scoped: solo MapView la usa. Token Coralyn, nessun hex nuovo qui
   (unica eccezione: la sabbia bagnata del bagnasciuga, tonalità di transizione). */

.map-stage {
  position: relative;
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-warm-border-stage);
  overflow: hidden;
  background: linear-gradient(172deg, var(--color-warm-075) 0%, var(--color-warm-150) 100%);
}
/* grana di sabbia: feTurbulence inline, impercettibile */
.map-stage::after {
  content: "";
  position: absolute; inset: 0; pointer-events: none;
  opacity: .05; mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* mare a orizzonte: gradiente profondo→chiaro + 3 velature in drift lento */
.map-sea {
  position: relative; height: 64px; overflow: hidden;
  background: linear-gradient(180deg, var(--color-sea-deep) 0%, var(--color-sea-3) 34%, var(--color-sea-2) 66%, var(--color-sea-1) 100%);
}
.map-sea-veil {
  position: absolute; left: -50%; width: 200%; height: 200%;
  border-radius: 46%; background: rgba(255, 255, 255, .16);
}
.map-sea-veil:nth-child(1) { top: 52%; animation: map-sea-drift 26s linear infinite; }
.map-sea-veil:nth-child(2) { top: 66%; background: rgba(255, 255, 255, .22); animation: map-sea-drift 19s linear infinite reverse; }
.map-sea-veil:nth-child(3) { top: 80%; background: color-mix(in srgb, var(--color-sea-1) 50%, transparent); animation: map-sea-drift 33s linear infinite; }
@keyframes map-sea-drift { from { transform: translateX(-3.5%); } to { transform: translateX(3.5%); } }

/* bagnasciuga: il mare bagna la sabbia (sabbia bagnata di transizione) */
.map-shore { height: 16px; background: linear-gradient(180deg, var(--color-sea-1) 0%, #EDE6D2 46%, var(--color-warm-075) 100%); }

/* reveal scaglionato per fila (design-system §8) */
.map-row-in { animation: map-row-in .5s var(--ease-emphasized) both; }
@keyframes map-row-in { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .map-sea-veil, .map-row-in { animation: none !important; }
}
```

- [ ] **Step 2: Rimonta lo stage in `MapView.vue`**

Nel template, sostituisci il contenitore stage e la vecchia striscia mare:
1. il div stage esterno (quello con `style="background:linear-gradient(168deg,…)"`) diventa `class="map-stage relative min-w-0 flex-1 overflow-auto"` **senza** style inline; il padding interno passa a un div `class="relative z-[1] p-5"` che avvolge tutto il contenuto sotto il mare;
2. la vecchia striscia `<div class="relative mb-[18px] flex h-9 …" style="background:linear-gradient(180deg,var(--color-sea-1)…">` (icona waves + "Mare") viene SOSTITUITA da:

```vue
        <div class="map-sea">
          <div class="map-sea-veil"></div><div class="map-sea-veil"></div><div class="map-sea-veil"></div>
          <span class="absolute right-3.5 top-2.5 text-[9px] font-semibold uppercase tracking-[.3em] text-[var(--color-sea-ink)] opacity-75">Mare</span>
        </div>
        <div class="map-shore"></div>
```

   (l'icona `waves` sparisce; se l'import `waves` non è più usato altrove nel file, va rimosso dagli usi — l'icona resta nel registry ui-kit);
3. ogni riga-fila `<div v-for="r in currentSector?.rows ?? []" …>` prende in più la classe `map-row-in` e uno stagger inline: `:style="{ animationDelay: `${i * 70}ms` }"` (aggiungi `(r, i)` al v-for). Il marcatore fila diventa:

```vue
          <span class="w-[52px] flex-none text-right">
            <b class="block text-[10px] font-bold tracking-[.06em] text-[var(--color-stage-1)]">{{ r.label.toUpperCase() }}</b>
            <span v-if="i === 0" class="text-[9px] text-[var(--color-stage-2)]">prima linea</span>
          </span>
```

4. il blocco Speciali e la legenda restano dove sono (la legenda diventa operativa nel Task 8).

- [ ] **Step 3: Suite + typecheck** — `npx vitest run` (MapView spec: il testo "Mare" ora è nella nuova fascia — il test `rende settori e ombrelloni dal mock MSW` non asserisce sulla striscia, atteso verde) e `pnpm typecheck` → verdi.

- [ ] **Step 4: Commit**

```bash
git add apps/web-staff/src/styles/map-scene.css apps/web-staff/src/styles/main.css apps/web-staff/src/features/map/MapView.vue
git commit -m "feat(web-staff): scena Riva - mare a velature, bagnasciuga, grana sabbia, reveal per fila"
```

---

### Task 7: occupazione — hint sui tab settore + righello di fila

**Files:**
- Modify: `apps/web-staff/src/features/map/MapView.vue`
- Modify: `apps/web-staff/src/features/map/MapView.spec.ts`

**Interfaces:**
- Consumes: `sectorOccupancyPct`, `rowOccupancy` da `./mapDerive` (Task 4); `SegmentedControl` `hint` (Task 2).

- [ ] **Step 1: Test (falliranno)** — aggiungi in coda al describe di `MapView.spec.ts`:

```ts
  it('i tab settore mostrano la % di occupazione operativa (hint)', async () => {
    const w = await mountMap(); // usa l'helper di mount già presente nel file (stesso nome usato dagli altri test)
    // seed: Centro ha o-1 (daily/daily), o-2 (free/free), o-8 (booked/free) → 2/3 = 67%
    expect(w.find('[data-test="seg-hint"]').text()).toBe('67%');
  });
  it('ogni fila mostra il righello occupate/totali', async () => {
    const w = await mountMap();
    const ruler = w.find('[data-test="row-ruler"]');
    expect(ruler.exists()).toBe(true);
    expect(ruler.text()).toContain('2/3');
  });
```

(Nota: `mountMap` è il nome dell'helper di mount usato dagli altri test del file — se nel file si chiama diversamente, usa quello; NON crearne un secondo.)

- [ ] **Step 2: Verifica che falliscano** — `npx vitest run src/features/map/MapView.spec.ts` → FAIL sui 2 nuovi.

- [ ] **Step 3: Implementa**

In `MapView.vue`:

```ts
import { rowOccupancy, sectorOccupancyPct } from './mapDerive';

const sectorOptions = computed(() =>
  normalSectors.value.map((s) => ({ value: s.id, label: s.name, hint: `${sectorOccupancyPct(s)}%` })),
);
```

e nel template, dentro la riga-fila, dopo il blocco celle:

```vue
          <span data-test="row-ruler" class="w-[74px] flex-none">
            <span class="block h-1 overflow-hidden rounded-full bg-[var(--color-warm-border-seg)]">
              <span class="block h-full rounded-full bg-[var(--color-accent)] opacity-75"
                :style="{ width: `${(rowOccupancy(r).occupied / Math.max(rowOccupancy(r).total, 1)) * 100}%` }"></span>
            </span>
            <span class="mt-0.5 block text-right text-[9px] font-semibold tabular-nums text-[var(--color-stage-2)]">{{ rowOccupancy(r).occupied }}/{{ rowOccupancy(r).total }}</span>
          </span>
```

- [ ] **Step 4: Verifica che passino** — `npx vitest run src/features/map/MapView.spec.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/map/MapView.vue apps/web-staff/src/features/map/MapView.spec.ts
git commit -m "feat(web-staff): occupazione operativa - % sui tab settore, righello per fila"
```

---

### Task 8: legenda operativa (evidenzia/filtra per stato)

**Files:**
- Modify: `apps/web-staff/src/features/map/MapView.vue`
- Modify: `apps/web-staff/src/features/map/MapView.spec.ts`

**Interfaces:**
- Consumes: prop `dimmed` di `UmbrellaCell` (Task 1).
- Produces: chip legenda `<button data-test="legend-chip" data-state="<SlotState>" aria-pressed>`; set reattivo `highlight`.

- [ ] **Step 1: Test (falliranno)**

```ts
  it('legenda operativa: clic su "Libero" attenua le celle senza fasce libere', async () => {
    const w = await mountMap();
    await w.get('[data-test="legend-chip"][data-state="free"]').trigger('click');
    const cells = w.findAllComponents({ name: 'UmbrellaCell' });
    const byLabel = (l: string) => cells.find((c) => c.props('label') === l)!;
    expect(byLabel('1').props('dimmed')).toBe(true);   // daily/daily: nessuna fascia libera
    expect(byLabel('2').props('dimmed')).toBe(false);  // free/free
    expect(byLabel('8').props('dimmed')).toBe(false);  // booked/free: ha una fascia libera
    // secondo clic: filtro spento, niente dimmed
    await w.get('[data-test="legend-chip"][data-state="free"]').trigger('click');
    expect(byLabel('1').props('dimmed')).toBe(false);
  });
```

- [ ] **Step 2: Verifica che fallisca** — `npx vitest run src/features/map/MapView.spec.ts` → FAIL.

- [ ] **Step 3: Implementa**

Script setup:

```ts
const highlight = ref<Set<SlotState>>(new Set());
function toggleHighlight(s: SlotState) {
  const next = new Set(highlight.value);
  next.has(s) ? next.delete(s) : next.add(s);
  highlight.value = next;
}
function isDimmed(u: UmbrellaDTO): boolean {
  if (highlight.value.size === 0) return false;
  return !slotStatesFor(u).some((s) => highlight.value.has(s));
}
```

Template: la legenda «Stato» esistente (i 6 `<span>` con pallino) diventa una riga di `<button>` chip (uno per stato reale, la voce "Stato misto" resta uno span informativo NON cliccabile):

```vue
            <div class="flex flex-wrap gap-2 text-[11.5px]">
              <button v-for="s in (['free','season','daily','booked','covered'] as SlotState[])" :key="s"
                type="button" data-test="legend-chip" :data-state="s" :aria-pressed="highlight.has(s)"
                class="inline-flex items-center gap-1.5 rounded-full border-[1.5px] bg-[var(--color-surface)] px-2.5 py-1 font-medium transition-shadow focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
                :class="highlight.has(s) ? 'border-[var(--color-accent)] font-semibold text-[var(--color-accent)] [box-shadow:0_0_0_3px_var(--color-accent-tint)]' : 'border-[var(--color-border)] text-[var(--color-text-2nd)]'"
                @click="toggleHighlight(s)">
                <i class="size-[11px] rounded-full" :style="{ background: STATE_COLOR[s] }"></i>{{ STATE_LABEL[s] }}
              </button>
              <span class="inline-flex items-center gap-1.5 px-1 text-[var(--color-text-2nd)]"><i class="size-[11px] rounded-full" style="background:conic-gradient(from 0deg,var(--color-state-booked) 0 33.333%,var(--color-state-daily) 33.333% 66.666%,var(--color-state-free) 66.666% 100%)"></i>Stato misto</span>
              <span class="ml-auto self-center text-[10.5px] text-[var(--color-placeholder)]">clic per filtrare · di nuovo per tutto</span>
            </div>
```

e su OGNI `UmbrellaCell` (settori normali e Speciali) aggiungi `:dimmed="isDimmed(u)"`.
(`highlight` esposto nel template: in `<script setup>` è già disponibile; `highlight.has(s)` nel template richiede `highlight.value.has(s)`? No: nei template i ref si auto-unwrappano → usa `highlight.has(s)`.)

- [ ] **Step 4: Verifica che passi** — `npx vitest run src/features/map/MapView.spec.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/map/MapView.vue apps/web-staff/src/features/map/MapView.spec.ts
git commit -m "feat(web-staff): legenda operativa mappa - chip toggle che attenuano gli stati non selezionati"
```

---

### Task 9: ricerca / salto rapido

**Files:**
- Modify: `apps/web-staff/src/features/map/MapView.vue`
- Modify: `apps/web-staff/src/features/map/MapView.spec.ts`

**Interfaces:**
- Consumes: `matchesQuery`, `namesByUmbrella` da `./mapDerive` (Task 4); prop `found` di `UmbrellaCell` (Task 1).
- Produces: `<input data-test="map-find">` nell'header dello stage; debounce 150ms; auto-switch settore.

- [ ] **Step 1: Test (falliranno)**

```ts
  it('ricerca per etichetta: la cella matchata pulsa (found)', async () => {
    const w = await mountMap();
    vi.useFakeTimers();
    await w.get('[data-test="map-find"]').setValue('8');
    vi.advanceTimersByTime(200); await nextTick();
    const cells = w.findAllComponents({ name: 'UmbrellaCell' });
    expect(cells.find((c) => c.props('label') === '8')!.props('found')).toBe(true);
    expect(cells.find((c) => c.props('label') === '2')!.props('found')).toBe(false);
    vi.useRealTimers();
  });
  it('ricerca per cliente: matcha gli ombrelloni prenotati da quel cliente', async () => {
    // override bookings del giorno: Mario Rossi (c-1, già nel seed clienti) su o-8
    server.use(http.get('/api/bookings', () => HttpResponse.json([
      { id: 'b-x', umbrellaId: 'o-8', timeSlotId: 'f-mat', customerId: 'c-1', type: 'daily',
        startDate: '2026-06-27', endDate: '2026-06-27', totalPrice: 25, amountCollected: 0,
        refundedAmount: 0, paymentStatus: 'unpaid', status: 'confirmed' },
    ])));
    const w = await mountMap();
    vi.useFakeTimers();
    await w.get('[data-test="map-find"]').setValue('rossi');
    vi.advanceTimersByTime(200); await nextTick();
    const cells = w.findAllComponents({ name: 'UmbrellaCell' });
    expect(cells.find((c) => c.props('label') === '8')!.props('found')).toBe(true);
    vi.useRealTimers();
  });
```

(Import necessari già presenti nel file: `server`, `http`, `HttpResponse` da msw/mocks — verificali in testa al file; `vi`, `nextTick` da aggiungere se mancano. Il payload booking replica la shape usata dagli altri override del file — confrontala e adeguala se il DTO reale ha campi in più: fa fede il file.)

- [ ] **Step 2: Verifica che falliscano** — `npx vitest run src/features/map/MapView.spec.ts` → FAIL.

- [ ] **Step 3: Implementa**

Script setup:

```ts
import { matchesQuery, namesByUmbrella, rowOccupancy, sectorOccupancyPct } from './mapDerive';

const findQuery = ref('');
const findDebounced = ref('');
let findTimer: ReturnType<typeof setTimeout> | undefined;
watch(findQuery, (q) => {
  clearTimeout(findTimer);
  findTimer = setTimeout(() => { findDebounced.value = q; }, 150);
});
const namesByUmb = computed(() => namesByUmbrella(bookings.value ?? [], customers.value ?? []));
function isFound(u: UmbrellaDTO): boolean {
  return matchesQuery(u, findDebounced.value, namesByUmb.value.get(u.id) ?? []);
}
// auto-switch: se nessun match nel settore attivo ma ce n'è in un altro, attiva il settore del primo match;
// poi porta in vista il primo match (spec §7). scrollIntoView è guardato: jsdom non lo implementa,
// e sotto prefers-reduced-motion lo scroll è istantaneo, non smooth.
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
watch(findDebounced, async (q) => {
  if (!q.trim()) return;
  const inActive = currentSector.value?.rows.some((r) => r.umbrellas.some((u) => isFound(u)));
  if (!inActive) {
    for (const s of normalSectors.value) {
      const hit = s.rows.some((r) => r.umbrellas.some((u) => isFound(u)));
      if (hit) { activeSector.value = s.id; break; }
    }
  }
  await nextTick();
  const first = sectors.value.flatMap((s) => s.rows).flatMap((r) => r.umbrellas).find((u) => isFound(u));
  if (!first) return;
  document.querySelector(`[aria-label^="Ombrellone ${first.label},"]`)
    ?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion.value ? 'auto' : 'smooth' });
});
```

(`useMediaQuery` è importato al Task 10 per l'hovercard — se questo task viene eseguito prima,
aggiungi qui l'import `import { useMediaQuery } from '@/lib/useMediaQuery';` e `nextTick` da `vue`.)

Template — nell'header dello stage (riga con `SegmentedControl`), aggiungi a destra:

```vue
      <label class="flex min-w-[220px] items-center gap-2 rounded-full border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2">
        <Icon name="search" :size="13" class="text-[var(--color-text-muted)]" />
        <input data-test="map-find" v-model="findQuery" type="text" placeholder="Trova ombrellone o cliente…"
          aria-label="Trova ombrellone o cliente"
          class="w-full bg-transparent text-[12.5px] text-[var(--color-text)] placeholder:text-[var(--color-placeholder)] focus:outline-none" />
      </label>
```

(verifica che `search` esista nel registry icone ui-kit: `grep -n "search" packages/ui-kit/src/icons/registry.ts` — se manca, registralo come le altre icone Lucide del registry).
Su OGNI `UmbrellaCell` aggiungi `:found="isFound(u)"`.

- [ ] **Step 4: Verifica che passino** — `npx vitest run src/features/map/MapView.spec.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/map/MapView.vue apps/web-staff/src/features/map/MapView.spec.ts
git commit -m "feat(web-staff): ricerca rapida mappa - etichetta o cliente, impulso e switch settore"
```

---

### Task 10: hovercard sulle celle (desktop)

**Files:**
- Modify: `apps/web-staff/src/features/map/MapView.vue`
- Modify: `apps/web-staff/src/features/map/MapView.spec.ts`

**Interfaces:**
- Consumes: `HoverCard` ui-kit (Task 3, slot `trigger`/`content`, prop `disabled`); `useMediaQuery` (`@/lib/useMediaQuery`, ritorna `Ref<boolean>`, false in jsdom); `namesByUmb` (Task 9).

- [ ] **Step 1: Test (falliranno)** — jsdom non ha matchMedia ⇒ `useMediaQuery('(hover: hover)')` è `false` ⇒ HoverCard `disabled` ⇒ il DOM delle celle resta identico. Il test copre il contratto "disabled su non-hover":

```ts
  it('hovercard: su ambienti senza hover (jsdom) le celle NON sono avvolte da HoverCardRoot', async () => {
    const w = await mountMap();
    // il trigger renderizzato è direttamente il button della cella, nessun contenuto card nel body
    expect(document.body.innerHTML).not.toContain('data-reka-hover-card');
    expect(w.findAllComponents({ name: 'UmbrellaCell' }).length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Verifica che fallisca** — FAIL solo se l'attributo scelto non matcha: prima di fissare l'assertion, monta HoverCard con `defaultOpen: true` nello spec di ui-kit (già fatto al Task 3) e osserva nel DOM l'attributo `data-*` reale che reka-ui emette sul content; usa quello nell'assertion. Poi: `npx vitest run src/features/map/MapView.spec.ts` → il nuovo test FAIL perché `HoverCard` non è ancora usato… se invece passa "a vuoto" (l'attributo non c'è comunque), tienilo: diventa una guardia di regressione dopo lo Step 3.

- [ ] **Step 3: Implementa**

Script setup:

```ts
import { useMediaQuery } from '@/lib/useMediaQuery';
const hoverCapable = useMediaQuery('(hover: hover)');

interface HoverRow { slotName: string; state: SlotState; customer: string | null }
function hoverRows(u: UmbrellaDTO): HoverRow[] {
  return timeSlots.value.map((s) => {
    const st = (u.stateBySlot[s.id] ?? 'free') as SlotState;
    const b = (bookings.value ?? []).find((x) => x.umbrellaId === u.id && x.timeSlotId === s.id);
    const c = b ? (customers.value ?? []).find((x) => x.id === b.customerId) : undefined;
    return { slotName: s.name, state: st, customer: c ? `${c.firstName} ${c.lastName}` : null };
  });
}
```

Template — ogni `UmbrellaCell` (nei settori normali e Speciali) viene avvolta:

```vue
            <HoverCard v-for="u in r.umbrellas" :key="u.id" :disabled="!hoverCapable">
              <template #trigger>
                <UmbrellaCell :label="u.label" :ariaLabel="ariaLabel(u, currentSector!.name, r.label)"
                  :slot-states="slotStatesFor(u)" :type-icon="typeIcon(u)" :selected="sel?.u.id === u.id"
                  :dimmed="isDimmed(u)" :found="isFound(u)" @select="open(u, currentSector!.name, r.label)" />
              </template>
              <template #content>
                <div class="mb-1.5 flex items-baseline gap-2">
                  <b class="text-[13px] tracking-[-.01em] text-[var(--color-text)]">Ombrellone {{ u.label }}</b>
                  <span class="text-[10.5px] text-[var(--color-text-muted)]">{{ currentSector!.name }} · {{ r.label }}</span>
                </div>
                <div v-for="h in hoverRows(u)" :key="h.slotName" class="flex items-center gap-2 py-0.5 text-[11.5px] text-[var(--color-text-2nd)]">
                  <i class="size-[9px] flex-none rounded-full" :style="{ background: STATE_COLOR[h.state] }"></i>
                  {{ h.slotName }} · <b class="font-semibold text-[var(--color-text)]">{{ STATE_LABEL[h.state] }}</b>
                  <span v-if="h.customer" class="ml-auto text-[10.5px] text-[var(--color-text-muted)]">{{ h.customer }}</span>
                </div>
                <div class="mt-1.5 border-t border-dashed border-[var(--color-border)] pt-1.5 text-[10px] text-[var(--color-placeholder)]">Clic per aprire il dettaglio</div>
              </template>
            </HoverCard>
```

(il `v-for` si sposta dalla cella al wrapper `HoverCard`; `HoverCard` va aggiunto all'import da `@coralyn/ui-kit`; per il blocco Speciali usa `'Speciali'` come nome settore nell'header della card, come già fa `ariaLabel`).

- [ ] **Step 4: Suite + typecheck** — `npx vitest run` e `pnpm typecheck` → verdi (con `disabled` in jsdom il DOM celle è invariato: gli spec esistenti non cambiano).

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/map/MapView.vue apps/web-staff/src/features/map/MapView.spec.ts
git commit -m "feat(web-staff): hovercard sulle celle mappa (solo hover-capable, consultazione senza click)"
```

---

### Task 11: sync design docs + verifica finale

**Files:**
- Modify: `docs/design/design-system.md` (§2 token, §8 motion, §9 `--cell-size`, §13 riscrittura)
- Modify: `docs/handoff/` — NON creare handoff qui (lo fa la sessione a fine lavoro); solo design-system.

**Interfaces:** nessuna — solo documentazione (ADR-0009: aggiornamento contestuale, stesso branch).

- [ ] **Step 1: Aggiorna `design-system.md`**

1. **§2 (primitive)**: nella riga Mare aggiungi `--color-sea-deep: #8FC2D4`; tra le ombre aggiungi `--shadow-sun` col valore esatto di theme.css e il commento «ombra "da sole" delle celle mappa».
2. **§8 (motion)**: aggiungi alla lista usi: «drift velature mare (`map-sea-drift`, 19–33s, transform-only) e reveal scaglionato per fila (`map-row-in`); impulso ricerca `cell-found`. Tutte neutralizzate da `prefers-reduced-motion`.»
3. **§9**: `--cell-size: 34px` → `--cell-size: 40px;` (commento: «esteso; la Tessera usa 40/44»).
4. **§13**: riscrivi le sottosezioni alla luce dello shippato:
   - §13.1: forma = **Tessera** (quadrato arrotondato 12px, 40px esteso / 44px compatto), 4 assi invariati;
   - §13.2: split = **colonne verticali in ordine fascia** (prima fascia a sinistra), divisore hairline bianco `.55`; niente più conic;
   - §13.4: selezione/focus invariati + stati `dimmed` (legenda) e `found` (ricerca);
   - §13.6: legenda **operativa** (chip toggle multi-select, `aria-pressed`, attenuazione opacity .25) + «Stato misto» informativo;
   - §13.7: dettaglio = **`Drawer` in overlay** (non più pannello inline) — coerente con ADR-0019 §Decision;
   - NUOVA §13.8: scena «Riva» (mare a velature + bagnasciuga + grana, marcatori fila, righello occupazione, ricerca) con riferimento alla spec e al mockup `map-redesign-esplorazione.html`;
   - NUOVA §13.9: hovercard (solo hover-capable, consultazione, `HoverCard` ui-kit).
5. **§10 o inventario componenti**: aggiungi `HoverCard` all'elenco dei componenti base con una riga di descrizione, e l'`hint` di `SegmentedControl` dove il componente è descritto.

- [ ] **Step 2: Verifica finale completa**

Run (da `apps/web-staff`): `npx vitest run` e `pnpm typecheck`
Expected: TUTTO verde (baseline attesa: ≥ 421 + i nuovi test di questo piano), typecheck pulito.

- [ ] **Step 3: Commit**

```bash
git add docs/design/design-system.md
git commit -m "docs(design): design-system allineato al rework mappa Riva (Tessera, scena, hovercard, legenda operativa)"
```

---

## Dopo l'ultimo task

1. **Review whole-branch** (superpowers:requesting-code-review) prima del merge.
2. **Merge FF su `main`** + push (convenzione repo), poi cancellare il branch.
3. **Prova visiva nel browser** (richiede login utente): scena, hover, drawer, legenda, ricerca a 375/768/1280. La resa NON è coperta da jsdom.
4. La sessione scrive l'handoff (non è parte di questo piano).
