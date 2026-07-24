# 5.3 Calendar day-nav — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire l'`<input type="date">` nativo (oggi rotto: non apre il picker) nella Topbar di web-staff con un popup calendario tematizzato reka-ui, riusabile come `Calendar` in ui-kit.

**Architecture:** Un `Calendar.vue` composto in ui-kit assembla le primitive reka-ui e espone `v-model` come stringa ISO `yyyy-mm-dd`, mappando ISO↔`CalendarDate` ai due bordi (stesso pattern-sentinella del Select). Il `Popover` di ui-kit guadagna `v-model:open` per chiudersi alla selezione. La Topbar compone il navigatore locale (Popover + pill-trigger + i due chevron invariati).

**Tech Stack:** Vue 3.5 `<script setup>`, reka-ui 2.10.1 (solo dentro ui-kit), `@internationalized/date`, Tailwind con token da `theme.css`, Vitest + @vue/test-utils.

**Spec:** [2026-07-24-calendar-day-nav-design.md](../specs/2026-07-24-calendar-day-nav-design.md)

## Global Constraints

- **reka-ui vive SOLO in `packages/ui-kit`**: la Topbar consuma i wrapper, non importa reka-ui.
- **Niente hex fuori da `theme.css`**: stile solo con token (`var(--color-*)`, `var(--radius-*)`, `var(--ring-focus)`) o utility idiomatiche già usate (`text-white` sul brand, come `Button` primary). Non esiste `--color-on-brand`.
- **Niente em dash `—` nel testo mostrato all'utente**: nuovi `aria-label` = "Scegli data", "Mese precedente", "Mese successivo".
- **Contratto `Calendar`**: `v-model` è **stringa ISO `yyyy-mm-dd`**; emette `''` solo su deselect (evitato con `prevent-deselect`).
- **Suite di pacchetti diversi SEMPRE una alla volta**, mai in parallelo. Le spec di ui-kit sono incluse dal vitest di web-staff (`include: ['src/**/*.spec.ts', '../../packages/ui-kit/src/**/*.spec.ts']`), quindi girano dentro `corepack pnpm -C apps/web-staff test`.
- **Non esiste tema dark.** Stub jsdom (`ResizeObserver`, pointer-capture, `scrollIntoView`) sono globali in `apps/web-staff/src/test/setup.ts`.
- Baseline di partenza: web-staff (incl. ui-kit) **589/589**, `typecheck -r` exit 0. Branch di lavoro: `feat/calendar-day-nav-5-3`.

---

### Task 1: Dipendenza diretta `@internationalized/date` in ui-kit

Oggi è una dipendenza **fantasma** (presente solo sotto reka-ui, non risolvibile dalla root). Il `Calendar` la importa (`parseDate`, `CalendarDate`), quindi va dichiarata diretta.

**Files:**
- Modify: `packages/ui-kit/package.json` (blocco `dependencies`)
- Modify: `pnpm-lock.yaml` (via install, non a mano)

**Interfaces:**
- Consumes: nulla.
- Produces: `@internationalized/date` risolvibile da `packages/ui-kit` (Task 2 importerà `parseDate` e il tipo `DateValue`).

- [ ] **Step 1: Aggiungere la dipendenza a `packages/ui-kit/package.json`**

Nel blocco `dependencies` (attualmente `@coralyn/contracts`, `echarts`, `reka-ui`, `vue-echarts`), aggiungere la riga `@internationalized/date` mantenendo l'ordine alfabetico:

```json
  "dependencies": {
    "@coralyn/contracts": "workspace:*",
    "@internationalized/date": "^3.5.0",
    "echarts": "^5.5.1",
    "reka-ui": "^2.0.0",
    "vue-echarts": "^7.0.3"
  },
```

- [ ] **Step 2: Installare (aggiorna il lockfile e crea il symlink in ui-kit)**

Run: `corepack pnpm install`
Expected: install OK, `pnpm-lock.yaml` aggiornato con `@internationalized/date` come dipendenza diretta di `@coralyn/ui-kit`.

- [ ] **Step 3: Verificare che sia risolvibile da ui-kit (non più fantasma)**

Run: `ls packages/ui-kit/node_modules/@internationalized/date`
Expected: la directory esiste (symlink/junction pnpm). Prima di questo task il path NON esisteva.

- [ ] **Step 4: Commit**

```bash
git add packages/ui-kit/package.json pnpm-lock.yaml
git commit -m "build(ui-kit): @internationalized/date come dipendenza diretta (era fantasma)"
```

---

### Task 2: `Calendar.vue` in ui-kit (griglia-mese tematizzata, v-model ISO)

**Files:**
- Create: `packages/ui-kit/src/components/Calendar.vue`
- Create: `packages/ui-kit/src/components/Calendar.spec.ts`
- Modify: `packages/ui-kit/src/index.ts` (export `Calendar`)

**Interfaces:**
- Consumes: `@internationalized/date` (Task 1); reka-ui `Calendar*`; `./Icon.vue`.
- Produces: componente `Calendar` con `v-model` **stringa ISO `yyyy-mm-dd`**; emette `update:modelValue` con la stringa ISO del giorno scelto (o `''` su deselect, che qui `prevent-deselect` impedisce). Consumato dalla Topbar in Task 4.

- [ ] **Step 1: Scrivere lo spec che fallisce**

Create `packages/ui-kit/src/components/Calendar.spec.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Calendar from './Calendar.vue';

// reka-ui usa ResizeObserver/pointer-capture, assenti in jsdom (additivi, come Select.spec).
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => {};

let current: ReturnType<typeof mount> | undefined;
afterEach(() => { current?.unmount(); current = undefined; document.body.innerHTML = ''; vi.restoreAllMocks(); });

// Celle-giorno del mese corrente (escluse quelle fuori-mese, che ripetono numeri di mesi adiacenti).
function dayCells(w: ReturnType<typeof mount>): HTMLElement[] {
  return Array.from(w.element.querySelectorAll('[data-reka-calendar-cell-trigger]:not([data-outside-view])'));
}
function cell(w: ReturnType<typeof mount>, day: number): HTMLElement {
  const el = dayCells(w).find((c) => c.textContent?.trim() === String(day));
  if (!el) throw new Error(`cella ${day} non trovata: ${dayCells(w).map((c) => c.textContent?.trim()).join(' ')}`);
  return el;
}

describe('Calendar (reka-ui, v-model ISO)', () => {
  it('mostra il mese del v-model e marca il giorno selezionato', async () => {
    const w = current = mount(Calendar, { props: { modelValue: '2026-07-15' } });
    await nextTick();
    expect(w.text().toLowerCase()).toContain('luglio');
    expect(w.text()).toContain('2026');
    expect(cell(w, 15).hasAttribute('data-selected')).toBe(true);
  });

  it('cliccando un giorno emette la stringa ISO di quel giorno (round-trip)', async () => {
    const w = current = mount(Calendar, { props: { modelValue: '2026-07-15' } });
    await nextTick();
    cell(w, 20).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick(); await nextTick();
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['2026-07-20']);
  });

  it('prevent-deselect: cliccare il giorno già selezionato non azzera il modello', async () => {
    const w = current = mount(Calendar, { props: { modelValue: '2026-07-15' } });
    await nextTick();
    cell(w, 15).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick(); await nextTick();
    const emits = w.emitted('update:modelValue') ?? [];
    expect(emits.every((e) => e[0] !== '')).toBe(true);
  });

  it('senza v-model mostra comunque una griglia col giorno di oggi marcato', async () => {
    const w = current = mount(Calendar);
    await nextTick();
    expect(w.element.querySelector('[data-today]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Eseguire lo spec e verificarne il fallimento**

Run: `corepack pnpm -C apps/web-staff exec vitest run ../../packages/ui-kit/src/components/Calendar.spec.ts`
Expected: FAIL — `Failed to resolve import "./Calendar.vue"` (il componente non esiste ancora).

- [ ] **Step 3: Implementare `Calendar.vue`**

Create `packages/ui-kit/src/components/Calendar.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { parseDate, type DateValue } from '@internationalized/date';
import {
  CalendarRoot, CalendarPrev, CalendarNext, CalendarHeading,
  CalendarGrid, CalendarGridHead, CalendarGridRow, CalendarHeadCell,
  CalendarGridBody, CalendarCell, CalendarCellTrigger,
} from 'reka-ui';
import Icon from './Icon.vue';

// Il modello dei consumatori è una stringa ISO 'yyyy-mm-dd'; dentro reka-ui viaggia un CalendarDate.
// Stesso pattern-sentinella del Select (''↔SELECT_EMPTY): mappa ai due bordi, trasparente al consumatore.
const model = defineModel<string>();
const inner = computed<DateValue | undefined>({
  get: () => (model.value ? parseDate(model.value) : undefined),
  set: (v) => { model.value = v ? v.toString() : ''; },
});
</script>
<template>
  <CalendarRoot
    v-slot="{ grid, weekDays }"
    v-model="inner"
    locale="it-IT"
    weekday-format="short"
    prevent-deselect
    calendar-label="Scegli data"
    class="select-none"
  >
    <div class="mb-2 flex items-center justify-between">
      <CalendarPrev aria-label="Mese precedente" class="grid size-7 place-items-center rounded-full text-[var(--color-text-2nd)] hover:bg-[var(--color-raised)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]">
        <Icon name="chevron-left" :size="17" />
      </CalendarPrev>
      <CalendarHeading class="text-[13px] font-semibold capitalize text-[var(--color-text)]" />
      <CalendarNext aria-label="Mese successivo" class="grid size-7 place-items-center rounded-full text-[var(--color-text-2nd)] hover:bg-[var(--color-raised)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]">
        <Icon name="chevron-right" :size="17" />
      </CalendarNext>
    </div>
    <CalendarGrid v-for="month in grid" :key="month.value.toString()" class="w-full">
      <CalendarGridHead>
        <CalendarGridRow class="grid grid-cols-7">
          <CalendarHeadCell v-for="d in weekDays" :key="d" class="pb-1 text-[11px] font-medium capitalize text-[var(--color-text-muted)]">{{ d }}</CalendarHeadCell>
        </CalendarGridRow>
      </CalendarGridHead>
      <CalendarGridBody>
        <CalendarGridRow v-for="(week, i) in month.rows" :key="`w${i}`" class="grid grid-cols-7">
          <CalendarCell v-for="date in week" :key="date.toString()" :date="date" class="text-center">
            <CalendarCellTrigger
              :day="date"
              :month="month.value"
              class="mx-auto grid size-8 place-items-center rounded-full text-[13px] tabular-nums text-[var(--color-text)] outline-none hover:bg-[var(--color-raised)] focus-visible:[box-shadow:var(--ring-focus)] data-[outside-view]:text-[var(--color-text-muted)] data-[today]:font-semibold data-[today]:text-[var(--color-brand)] data-[selected]:bg-[var(--color-brand)] data-[selected]:font-semibold data-[selected]:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[unavailable]:pointer-events-none data-[unavailable]:opacity-50"
            />
          </CalendarCell>
        </CalendarGridRow>
      </CalendarGridBody>
    </CalendarGrid>
  </CalendarRoot>
</template>
```

- [ ] **Step 4: Esportare `Calendar` da ui-kit**

In `packages/ui-kit/src/index.ts`, dopo la riga `export { default as Option } from './components/Option.vue';` aggiungere:

```ts
export { default as Calendar } from './components/Calendar.vue';
```

- [ ] **Step 5: Eseguire lo spec e verificarne il successo**

Run: `corepack pnpm -C apps/web-staff exec vitest run ../../packages/ui-kit/src/components/Calendar.spec.ts`
Expected: PASS (4 test verdi).

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/components/Calendar.vue packages/ui-kit/src/components/Calendar.spec.ts packages/ui-kit/src/index.ts
git commit -m "feat(ui-kit): Calendar reka-ui con v-model ISO (confine ISO<->CalendarDate)"
```

---

### Task 3: `Popover.vue` — supporto `v-model:open` (chiusura controllata)

Serve alla Topbar per chiudere il popup alla selezione. Retro-compatibile: `open` è opzionale; chi usa solo `default-open` non cambia (model `undefined` → reka-ui resta uncontrolled).

**Files:**
- Modify: `packages/ui-kit/src/components/Popover.vue`
- Modify: `packages/ui-kit/src/components/Popover.spec.ts` (nuovo caso)

**Interfaces:**
- Consumes: reka-ui `PopoverRoot` (`open`/`@update:open`).
- Produces: `Popover` accetta `v-model:open` (boolean). Consumato dalla Topbar in Task 4.

- [ ] **Step 1: Scrivere il caso di test che fallisce**

In `packages/ui-kit/src/components/Popover.spec.ts`, aggiungere dentro `describe('Popover', …)` (dopo il test `defaultOpen`):

```ts
  it('v-model:open controllato: aperto mostra il contenuto, chiuso lo nasconde', async () => {
    const w = mount(Popover, { props: { open: true }, slots, attachTo: document.body });
    await nextTick();
    expect(document.body.textContent).toContain('Stato misto');
    await w.setProps({ open: false });
    await nextTick();
    expect(document.body.textContent).not.toContain('Stato misto');
  });

  it('v-model:open: chiudendo dall’esterno il Popover emette update:open=false', async () => {
    const w = mount(Popover, { props: { open: true }, slots, attachTo: document.body });
    await nextTick();
    await w.get('button').trigger('click'); // il trigger fa toggle
    expect(w.emitted('update:open')?.some((e) => e[0] === false)).toBe(true);
  });
```

- [ ] **Step 2: Eseguire e verificare il fallimento**

Run: `corepack pnpm -C apps/web-staff exec vitest run ../../packages/ui-kit/src/components/Popover.spec.ts`
Expected: FAIL — con `open` non gestito, passare `props: { open: true }` non monta il contenuto (il primo nuovo test fallisce su `toContain('Stato misto')`).

- [ ] **Step 3: Implementare `v-model:open` in `Popover.vue`**

Sostituire l'intero `packages/ui-kit/src/components/Popover.vue` con:

```vue
<script setup lang="ts">
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent, PopoverArrow } from 'reka-ui';

withDefaults(defineProps<{
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  defaultOpen?: boolean;
}>(), { side: 'bottom', align: 'end', defaultOpen: false });

// Open controllato opzionale: se il consumatore non usa v-model:open, il model resta undefined
// e PopoverRoot ricade su defaultOpen (uncontrolled) — retro-compatibile.
const open = defineModel<boolean>('open');
</script>
<template>
  <PopoverRoot v-model:open="open" :default-open="defaultOpen">
    <PopoverTrigger as-child><slot name="trigger" /></PopoverTrigger>
    <PopoverPortal>
      <PopoverContent :side="side" :align="align" :side-offset="8"
        class="z-[45] min-w-[220px] rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 [box-shadow:var(--shadow-drawer)] focus:outline-none data-[state=open]:[animation:overlay-in_var(--motion-fast)_var(--ease-standard)]">
        <slot name="content" />
        <PopoverArrow class="fill-[var(--color-surface)]" :width="10" :height="5" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
```

- [ ] **Step 4: Eseguire e verificare il successo**

Run: `corepack pnpm -C apps/web-staff exec vitest run ../../packages/ui-kit/src/components/Popover.spec.ts`
Expected: PASS (i 3 test pre-esistenti + i 2 nuovi).

- [ ] **Step 5: Commit**

```bash
git add packages/ui-kit/src/components/Popover.vue packages/ui-kit/src/components/Popover.spec.ts
git commit -m "feat(ui-kit): Popover con v-model:open opzionale (retro-compatibile)"
```

---

### Task 4: Topbar — Popover + Calendar al posto dell'input nativo

**Files:**
- Modify: `apps/web-staff/src/test/utils.ts` (nuovo helper `pickCalendarDay`)
- Modify: `apps/web-staff/src/app/Topbar.vue`
- Modify: `apps/web-staff/src/app/Topbar.spec.ts`

**Interfaces:**
- Consumes: `Popover`, `Calendar` da `@coralyn/ui-kit`; `session.activeDate` (stringa ISO); `addDays` (invariato).
- Produces: nessuna API nuova verso altri task (è il consumatore finale).

- [ ] **Step 1: Aggiungere l'helper `pickCalendarDay` a `utils.ts`**

In `apps/web-staff/src/test/utils.ts`, in fondo al file (dopo `selectOption`), aggiungere:

```ts
/** Apre il Popover-calendario (click sul trigger) e clicca il giorno indicato del mese mostrato.
 *  Il contenuto del Popover è portalato: le celle vivono in document.body SOLO a popover aperto.
 *  Le celle fuori-mese (data-outside-view) sono escluse per non colpire numeri di mesi adiacenti. */
export async function pickCalendarDay(trigger: { element: Element } | Element, day: number): Promise<void> {
  const el = (trigger instanceof Element ? trigger : trigger.element) as HTMLElement;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await nextTick(); await nextTick();
  const cells = Array.from(document.body.querySelectorAll('[data-reka-calendar-cell-trigger]:not([data-outside-view])'));
  const target = cells.find((c) => c.textContent?.trim() === String(day));
  if (!target) throw new Error(`pickCalendarDay: giorno ${day} non trovato. Presenti: ${cells.map((c) => c.textContent?.trim()).join(' ')}`);
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await nextTick(); await nextTick();
  await flushPromises();
}
```

(`nextTick` e `flushPromises` sono già importati in cima al file.)

- [ ] **Step 2: Aggiornare `Topbar.spec.ts` — nuovo test del picker (fallisce)**

In `apps/web-staff/src/app/Topbar.spec.ts`:

(a) Aggiungere agli import in cima:

```ts
import { afterEach } from 'vitest';
import { pickCalendarDay } from '@/test/utils';
```

(b) Introdurre il tracking del wrapper per rispettare la trappola di teardown del Popover (smonta il wrapper PRIMA di pulire il body). Sostituire la funzione `mountAt` con:

```ts
let current: ReturnType<typeof mount> | undefined;
afterEach(() => { current?.unmount(); current = undefined; document.body.innerHTML = ''; });

async function mountAt(path: string) {
  setActivePinia(createPinia());
  const router = makeRouter();
  router.push(path);
  await router.isReady();
  current = mount(Topbar, { global: { plugins: [router] } });
  return current;
}
```

(c) Sostituire il test esistente `il picker imposta activeDate alla data scelta (salto arbitrario)` (quello che usa `input[type="date"]` + `.setValue`) con:

```ts
  it('il picker calendario imposta activeDate alla data scelta e si chiude', async () => {
    const w = await mountAt('/map');
    const s = useSessionStore();
    s.activeDate = '2026-07-06';
    await w.vm.$nextTick();
    const trigger = w.get('[data-testid="date-picker-trigger"]');
    await pickCalendarDay(trigger, 20); // il mese mostrato segue activeDate → luglio 2026
    expect(s.activeDate).toBe('2026-07-20');
    expect(trigger.attributes('aria-expanded')).toBe('false'); // popover chiuso
  });
```

- [ ] **Step 3: Eseguire e verificare il fallimento**

Run: `corepack pnpm -C apps/web-staff exec vitest run src/app/Topbar.spec.ts`
Expected: FAIL — non esiste `[data-testid="date-picker-trigger"]` (la Topbar usa ancora l'input nativo).

- [ ] **Step 4: Implementare la Topbar**

In `apps/web-staff/src/app/Topbar.vue`:

(a) Nel `<script setup>`, aggiornare gli import e lo stato, e rimuovere `onPickDate`. Sostituire le righe 1-27 con:

```ts
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Icon, Popover, Calendar } from '@coralyn/ui-kit';
import { useSessionStore } from '@/stores/session';
import { addDays } from '@/lib/dates';
const route = useRoute();
const emit = defineEmits<{ 'open-nav': [] }>();
const session = useSessionStore();
const title = computed(() => (route.meta.title as string | undefined) ?? '');
const subtitle = computed(() => (route.meta.subtitle as string | undefined) ?? '');
const showDateNav = computed(() => route.meta.usesDate === true);
const pickerOpen = ref(false);
const dateLabel = computed(() => {
  // Parse e format entrambi in UTC: la convenzione "niente aritmetica in ora locale" resta uniforme
  // con addDays/todayIso (il giorno di calendario ISO è preservato su qualunque fuso host).
  const d = new Date(session.activeDate + 'T00:00:00Z');
  const s = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
});
function shiftDay(n: number): void {
  session.activeDate = addDays(session.activeDate, n);
}
function onPick(v: string | undefined): void {
  if (v) session.activeDate = v;
  pickerOpen.value = false;
}
</script>
```

(b) Nel `<template>`, sostituire l'intero blocco del navigatore data (il `<div v-if="showDateNav" …> … </div>`, righe ~38-45) con:

```html
    <div v-if="showDateNav" data-testid="date-nav" class="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 [box-shadow:var(--shadow-soft)]">
      <button aria-label="Giorno precedente" class="grid size-7 place-items-center rounded-full text-[var(--color-text-2nd)] hover:bg-[var(--color-raised)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]" @click="shiftDay(-1)"><Icon name="chevron-left" :size="17" /></button>
      <Popover v-model:open="pickerOpen" align="center">
        <template #trigger>
          <button type="button" aria-label="Scegli data" data-testid="date-picker-trigger" class="grid min-w-[128px] cursor-pointer place-items-center rounded-full px-1 py-0.5 text-center text-[13px] font-semibold tabular-nums text-[var(--color-text)] hover:bg-[var(--color-raised)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]">{{ dateLabel }}</button>
        </template>
        <template #content>
          <Calendar :model-value="session.activeDate" @update:model-value="onPick" />
        </template>
      </Popover>
      <button aria-label="Giorno successivo" class="grid size-7 place-items-center rounded-full text-[var(--color-text-2nd)] hover:bg-[var(--color-raised)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]" @click="shiftDay(1)"><Icon name="chevron-right" :size="17" /></button>
    </div>
```

- [ ] **Step 5: Eseguire e verificare il successo dello spec Topbar**

Run: `corepack pnpm -C apps/web-staff exec vitest run src/app/Topbar.spec.ts`
Expected: PASS (tutti i test Topbar, incluso il nuovo picker + i chevron invariati).

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/test/utils.ts apps/web-staff/src/app/Topbar.vue apps/web-staff/src/app/Topbar.spec.ts
git commit -m "feat(web-staff): navigatore data Topbar con Popover+Calendar (via input nativo rotto)"
```

---

### Task 5: Documentazione design-system + gate completo

**Files:**
- Modify: `docs/design/design-system.md` (nuova sezione Calendar)

**Interfaces:**
- Consumes: nulla. Produces: nulla (docs + verifica finale).

- [ ] **Step 1: Aggiungere la sezione Calendar al design-system**

In `docs/design/design-system.md`, subito dopo la sezione del Select (§10), aggiungere una nuova sezione:

```markdown
## 11. Calendar (day picker)

`Calendar` (ui-kit) è la griglia-mese tematizzata su primitive reka-ui, gemella del Select come pattern
headless-dietro-wrapper. Contratto: **`v-model` è una stringa ISO `yyyy-mm-dd`**; internamente mappa
ISO↔`CalendarDate` di `@internationalized/date` ai due bordi (come `SELECT_EMPTY` per il Select), così il
consumatore non tocca mai `CalendarDate`. `locale="it-IT"` (settimana da lunedì, mesi/weekday italiani),
`prevent-deselect` (un click sul giorno attivo non azzera). Stile solo con token; il giorno selezionato è
`--color-brand` con `text-white` (idioma del Button primary), "oggi" è `--color-brand` senza sfondo.

Il **navigatore giorni** della Topbar è composizione **locale** (unico consumatore): `Popover`
(`v-model:open`) con la pill-etichetta come trigger (`aria-label="Scegli data"`) e `Calendar` nel contenuto;
alla selezione imposta `session.activeDate` e chiude. I 16 `<input type="date">` sparsi in modali/form NON
sono migrati (follow-up). Test: le celle si cliccano via l'helper `pickCalendarDay(trigger, giorno)` in
`src/test/utils.ts` (contenuto portalato: celle in `document.body` solo a popover aperto; escluse le
`data-outside-view`).
```

- [ ] **Step 2: Commit della doc**

```bash
git add docs/design/design-system.md
git commit -m "docs(design): 5.3 sezione Calendar nel design system"
```

- [ ] **Step 3: Gate — intera suite web-staff (incl. ui-kit), da sola**

Run: `corepack pnpm -C apps/web-staff test`
Expected: PASS, **596/596** (589 di baseline + 4 Calendar + 2 Popover + 1 Topbar netto; il vecchio test input rimpiazzato non aggiunge, il nuovo picker sì). Se il numero differisce, riconciliare prima di proseguire; non lasciare rossi.

- [ ] **Step 4: Gate — typecheck di tutti i pacchetti**

Run: `corepack pnpm -r typecheck`
Expected: exit 0.

- [ ] **Step 5: Verifica visiva (delegata all'utente)**

La verifica autenticata di web-staff richiede il login dell'utente (l'agente non può fare screenshot autenticati). Chiedere all'utente di aprire una vista con `usesDate` (Mappa/Prenotazioni/Noleggi), cliccare l'etichetta-data e confermare che: il calendario tematizzato si apre, la selezione di un giorno aggiorna la vista e chiude il popup, i chevron ±1 funzionano come prima.

---

## Self-Review

**Spec coverage** (spec §): §3.1 Calendar+confine ISO → Task 2; §3.2 Popover v-model:open → Task 3; §3.3 Topbar → Task 4; §4 test (Calendar.spec, pickCalendarDay, Topbar.spec) → Task 2/4; §5 file → tutti; §6 dipendenza diretta → Task 1; §2.2 nessuna scorciatoia / §2.3 nessun min/max → Task 2 (il componente non li introduce); docs design-system → Task 5. Nessun gap.

**Placeholder scan:** nessun TBD/TODO; ogni step di codice mostra il codice completo; comandi con output atteso.

**Type consistency:** `Calendar` `v-model` = stringa ISO ovunque (Task 2 emette `['2026-07-20']`, Task 4 `onPick(v: string | undefined)`); `pickCalendarDay(trigger, day)` definito in Task 4 Step 1 e usato in Task 4 Step 2; `Popover` `open` boolean (Task 3) usato come `v-model:open="pickerOpen"` (Task 4). `data-reka-calendar-cell-trigger` / `data-outside-view` / `data-selected` / `data-today` sono attributi reali verificati nella dist reka-ui 2.10.1.

**Nota conteggio test:** il numero 596 allo Step 3 di Task 5 è una stima (baseline 589 + 7 netti). Il gate è "verde e coerente", non il numero esatto: se i test aggiunti danno un totale diverso ma tutto verde, va bene — aggiornare il conteggio nell'handoff.
</content>
