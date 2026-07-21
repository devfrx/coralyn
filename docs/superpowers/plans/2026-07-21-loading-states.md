# Loading State Universale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Scratch (anti-collisione):** i report subagent vanno in `.superpowers/sdd/task-ls-N-report.md` (prefisso `ls`), il ledger `progress.md` va **appeso**, mai sovrascritto.

**Goal:** skeleton riutilizzabili (atomo + DataTable/StatTile) con anti-flicker uniforme, e chiusura del drift CTA (`:disabled` nudi → `:loading`), su tutto il monorepo.

**Architecture:** atomo `Skeleton` + composable `useDelayedLoading` in ui-kit; i componenti che possiedono il layout (DataTable, StatTile) gestiscono internamente il gate anti-flicker; le viste con layout bespoke compongono l'atomo col composable. Spec di riferimento: `docs/superpowers/specs/2026-07-21-loading-states-design.md`.

**Tech Stack:** Vue 3 `<script setup>` + TS, Tailwind v4 (`@theme` in `packages/ui-kit/src/styles/theme.css`), Vitest 4 + @vue/test-utils (fake timers per il gate), TanStack Query nelle viste.

## Global Constraints

- Anti-flicker: `delay: 150` ms, `minVisible: 300` ms — il gate vive DENTRO i componenti ui-kit; le viste passano `isLoading` grezzo.
- Lo skeleton **non sostituisce mai dati reali**: appare solo con 0 righe/valore assente (refetch con dati stantii = silenzioso).
- Zero hex fuori da `theme.css`; solo token semantici (`--color-skeleton`, `--color-skeleton-sheen`).
- Larghezze skeleton **deterministiche per indice** — mai `Math.random()`.
- Ogni skeleton `aria-hidden="true"`; il contenitore in caricamento porta `aria-busy="true"`.
- Regola cross-file: dopo ogni task gira l'INTERA suite del pacchetto toccato (`npx vitest run` da `apps/web-staff` include gli spec ui-kit; `apps/web-platform` e `apps/web-customer` a sé) — mai il solo spec.
- L'API a slot del DataTable resta congelata: `loading` è solo data-driven.
- Messaggi di commit in italiano, stile `feat(ui-kit): …` / `refactor(views): …` come da storia recente.

---

### Task 1: Token shimmer + atomo `Skeleton`

**Files:**
- Modify: `packages/ui-kit/src/styles/theme.css` (token in `@theme`, keyframe + classe dopo le keyframes esistenti)
- Create: `packages/ui-kit/src/components/Skeleton.vue`
- Create: `packages/ui-kit/src/components/Skeleton.spec.ts`
- Modify: `packages/ui-kit/src/index.ts`

**Interfaces:**
- Produces: componente `Skeleton` con props `{ variant?: 'line' | 'block' | 'circle'; width?: string; height?: string }` (default `variant: 'line'`), marcato `data-test="skeleton"`, sempre `aria-hidden="true"`. Export: `export { default as Skeleton } from './components/Skeleton.vue';`

- [ ] **Step 1: Scrivere lo spec (rosso)**

Creare `packages/ui-kit/src/components/Skeleton.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Skeleton from './Skeleton.vue';

describe('Skeleton', () => {
  it('default line: aria-hidden, radius sm, altezza 0.75em, larghezza 100%', () => {
    const w = mount(Skeleton);
    const el = w.find('[data-test="skeleton"]');
    expect(el.exists()).toBe(true);
    expect(el.attributes('aria-hidden')).toBe('true');
    expect(el.classes()).toContain('rounded-[var(--radius-sm)]');
    expect(el.attributes('style')).toContain('height: 0.75em');
    expect(el.attributes('style')).toContain('width: 100%');
  });

  it('circle: radius full e 32px di lato', () => {
    const w = mount(Skeleton, { props: { variant: 'circle' } });
    const el = w.find('[data-test="skeleton"]');
    expect(el.classes()).toContain('rounded-[var(--radius-full)]');
    expect(el.attributes('style')).toContain('width: 32px');
    expect(el.attributes('style')).toContain('height: 32px');
  });

  it('block: 64px di altezza, larghezza piena', () => {
    const w = mount(Skeleton, { props: { variant: 'block' } });
    expect(w.find('[data-test="skeleton"]').attributes('style')).toContain('height: 64px');
  });

  it('width/height espliciti vincono sui default', () => {
    const w = mount(Skeleton, { props: { width: '120px', height: '18px' } });
    const style = w.find('[data-test="skeleton"]').attributes('style');
    expect(style).toContain('width: 120px');
    expect(style).toContain('height: 18px');
  });

  it('porta la classe shimmer e il bg token', () => {
    const el = mount(Skeleton).find('[data-test="skeleton"]');
    expect(el.classes()).toContain('skeleton-sheen');
    expect(el.classes()).toContain('bg-[var(--color-skeleton)]');
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run (da `apps/web-staff`): `npx vitest run ../../packages/ui-kit/src/components/Skeleton.spec.ts`
Expected: FAIL — `Cannot find module './Skeleton.vue'`.

- [ ] **Step 3: Token + shimmer in theme.css**

In `packages/ui-kit/src/styles/theme.css`, dentro il blocco `@theme`, sezione SEMANTIC (dopo la riga `--color-scrim-strong: …`):

```css
  /* Skeleton di caricamento: base e sheen sui neutri caldi (vedi design-system §3) */
  --color-skeleton: var(--color-warm-150);
  --color-skeleton-sheen: var(--color-warm-050);
```

Dopo le keyframes esistenti (sotto `@keyframes toast-out …`):

```css
@keyframes skeleton-sheen { from { background-position: 150% 0 } to { background-position: -50% 0 } }
/* Sheen dello Skeleton: gradiente in sweep sul bg token. Con prefers-reduced-motion la regola
   globale azzera l'animazione e background-position resta 200% → blocco statico pulito. */
.skeleton-sheen {
  background-image: linear-gradient(100deg, transparent 30%, var(--color-skeleton-sheen) 50%, transparent 70%);
  background-size: 200% 100%;
  background-position: 200% 0;
  background-repeat: no-repeat;
  animation: skeleton-sheen 1.6s linear infinite;
}
```

- [ ] **Step 4: Implementare `Skeleton.vue`**

```vue
<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?: 'line' | 'block' | 'circle';
    width?: string;
    height?: string;
  }>(),
  { variant: 'line' },
);

const DEFAULTS = {
  line: { width: '100%', height: '0.75em' },
  block: { width: '100%', height: '64px' },
  circle: { width: '32px', height: '32px' },
} as const;
</script>
<template>
  <div
    data-test="skeleton"
    aria-hidden="true"
    class="skeleton-sheen bg-[var(--color-skeleton)]"
    :class="variant === 'circle' ? 'rounded-[var(--radius-full)]' : 'rounded-[var(--radius-sm)]'"
    :style="{ width: width ?? DEFAULTS[variant].width, height: height ?? DEFAULTS[variant].height }"
  />
</template>
```

In `packages/ui-kit/src/index.ts`, dopo l'export di `StatTile`:

```ts
export { default as Skeleton } from './components/Skeleton.vue';
```

- [ ] **Step 5: Verificare che passi**

Run: `npx vitest run ../../packages/ui-kit/src/components/Skeleton.spec.ts`
Expected: PASS (5 test).

- [ ] **Step 6: Suite intera + commit**

Run da `apps/web-staff`: `npx vitest run` → tutte verdi.

```bash
git add packages/ui-kit/src/styles/theme.css packages/ui-kit/src/components/Skeleton.vue packages/ui-kit/src/components/Skeleton.spec.ts packages/ui-kit/src/index.ts
git commit -m "feat(ui-kit): atomo Skeleton con shimmer sui token --color-skeleton*"
```

---

### Task 2: `SkeletonText`

**Files:**
- Create: `packages/ui-kit/src/components/SkeletonText.vue`
- Create: `packages/ui-kit/src/components/SkeletonText.spec.ts`
- Modify: `packages/ui-kit/src/index.ts`

**Interfaces:**
- Consumes: `Skeleton` (Task 1).
- Produces: componente `SkeletonText` con prop `{ lines?: number }` (default 3): righe `Skeleton` line, larghezze deterministiche per indice, ultima riga al 60%. Export: `export { default as SkeletonText } from './components/SkeletonText.vue';`

- [ ] **Step 1: Scrivere lo spec (rosso)**

Creare `packages/ui-kit/src/components/SkeletonText.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SkeletonText from './SkeletonText.vue';

describe('SkeletonText', () => {
  it('rende N righe skeleton, ultima più corta (60%)', () => {
    const w = mount(SkeletonText, { props: { lines: 4 } });
    const rows = w.findAll('[data-test="skeleton"]');
    expect(rows).toHaveLength(4);
    expect(rows[3].attributes('style')).toContain('width: 60%');
  });

  it('default 3 righe', () => {
    expect(mount(SkeletonText).findAll('[data-test="skeleton"]')).toHaveLength(3);
  });

  it('deterministico: due mount identici producono lo stesso markup', () => {
    const a = mount(SkeletonText, { props: { lines: 5 } });
    const b = mount(SkeletonText, { props: { lines: 5 } });
    expect(a.html()).toBe(b.html());
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run ../../packages/ui-kit/src/components/SkeletonText.spec.ts`
Expected: FAIL — modulo mancante.

- [ ] **Step 3: Implementare**

```vue
<script setup lang="ts">
import Skeleton from './Skeleton.vue';

const props = withDefaults(defineProps<{ lines?: number }>(), { lines: 3 });

// Larghezze variate per indice, deterministiche: niente random, niente shift tra render.
const WIDTHS = ['100%', '92%', '96%', '88%'] as const;
function widthFor(i: number): string {
  return i === props.lines - 1 ? '60%' : WIDTHS[i % WIDTHS.length];
}
</script>
<template>
  <div class="flex flex-col gap-2" aria-hidden="true">
    <Skeleton v-for="i in lines" :key="i" variant="line" :width="widthFor(i - 1)" />
  </div>
</template>
```

Export in `index.ts` dopo `Skeleton`:

```ts
export { default as SkeletonText } from './components/SkeletonText.vue';
```

- [ ] **Step 4: Verifica + suite + commit**

Run: `npx vitest run ../../packages/ui-kit/src/components/SkeletonText.spec.ts` → PASS; poi `npx vitest run` da `apps/web-staff` → verde.

```bash
git add packages/ui-kit/src/components/SkeletonText.vue packages/ui-kit/src/components/SkeletonText.spec.ts packages/ui-kit/src/index.ts
git commit -m "feat(ui-kit): SkeletonText - righe skeleton deterministiche"
```

---

### Task 3: `useDelayedLoading` (gate anti-flicker)

**Files:**
- Create: `packages/ui-kit/src/useDelayedLoading.ts`
- Create: `packages/ui-kit/src/useDelayedLoading.spec.ts`
- Modify: `packages/ui-kit/src/index.ts`

**Interfaces:**
- Produces: `useDelayedLoading(source: Ref<boolean> | (() => boolean), opts?: { delay?: number; minVisible?: number }): Ref<boolean>` — default `{ delay: 150, minVisible: 300 }`. Semantica: `true` solo se `source` resta `true` oltre `delay`; una volta `true`, resta tale per almeno `minVisible` ms. Export: `export { useDelayedLoading } from './useDelayedLoading';`

- [ ] **Step 1: Scrivere lo spec (rosso)**

Creare `packages/ui-kit/src/useDelayedLoading.spec.ts` (Vitest 4 con `vi.useFakeTimers()` mocka anche `Date.now`):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useDelayedLoading } from './useDelayedLoading';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDelayedLoading', () => {
  it('resta false se il loading finisce sotto la soglia di delay', async () => {
    const loading = ref(true);
    const visible = useDelayedLoading(loading);
    expect(visible.value).toBe(false);
    vi.advanceTimersByTime(100);
    loading.value = false;
    await nextTick();
    vi.advanceTimersByTime(1000);
    expect(visible.value).toBe(false);
  });

  it('diventa true dopo il delay se il loading persiste', async () => {
    const loading = ref(true);
    const visible = useDelayedLoading(loading);
    vi.advanceTimersByTime(149);
    expect(visible.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(visible.value).toBe(true);
  });

  it('una volta visibile resta true per almeno minVisible', async () => {
    const loading = ref(true);
    const visible = useDelayedLoading(loading);
    vi.advanceTimersByTime(200); // visibile da 50ms
    loading.value = false;
    await nextTick();
    expect(visible.value).toBe(true); // non spegne subito
    vi.advanceTimersByTime(249);
    expect(visible.value).toBe(true);
    vi.advanceTimersByTime(1); // 300ms dalla comparsa
    expect(visible.value).toBe(false);
  });

  it('se il loading finisce dopo minVisible, spegne subito', async () => {
    const loading = ref(true);
    const visible = useDelayedLoading(loading);
    vi.advanceTimersByTime(600); // visibile da 450ms
    loading.value = false;
    await nextTick();
    expect(visible.value).toBe(false);
  });

  it('accetta un getter e opzioni custom', async () => {
    const state = ref(true);
    const visible = useDelayedLoading(() => state.value, { delay: 50, minVisible: 100 });
    vi.advanceTimersByTime(50);
    expect(visible.value).toBe(true);
  });

  it('un nuovo loading durante la coda di spegnimento annulla lo spegnimento', async () => {
    const loading = ref(true);
    const visible = useDelayedLoading(loading);
    vi.advanceTimersByTime(200);
    loading.value = false;
    await nextTick();
    loading.value = true; // riparte prima che scada minVisible
    await nextTick();
    vi.advanceTimersByTime(10_000);
    expect(visible.value).toBe(true);
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run ../../packages/ui-kit/src/useDelayedLoading.spec.ts`
Expected: FAIL — modulo mancante.

- [ ] **Step 3: Implementare**

Creare `packages/ui-kit/src/useDelayedLoading.ts`:

```ts
import { computed, getCurrentScope, onScopeDispose, ref, watch, type Ref } from 'vue';

export interface DelayedLoadingOptions {
  /** ms prima che il loading diventi visibile (evita flash su risposte rapide). */
  delay?: number;
  /** ms minimi di visibilità una volta comparso (evita skeleton-lampo). */
  minVisible?: number;
}

/**
 * Gate anti-flicker per gli stati di caricamento (spec 2026-07-21-loading-states §3.3):
 * visibile solo se l'attesa supera `delay`; una volta visibile resta almeno `minVisible`.
 */
export function useDelayedLoading(
  source: Ref<boolean> | (() => boolean),
  opts: DelayedLoadingOptions = {},
): Ref<boolean> {
  const { delay = 150, minVisible = 300 } = opts;
  const src = typeof source === 'function' ? computed(source) : source;
  const visible = ref(false);
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let shownAt = 0;

  watch(
    src,
    (loading) => {
      if (loading) {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        if (visible.value || showTimer) return;
        showTimer = setTimeout(() => {
          showTimer = null;
          visible.value = true;
          shownAt = Date.now();
        }, delay);
      } else {
        if (showTimer) { clearTimeout(showTimer); showTimer = null; }
        if (!visible.value) return;
        const elapsed = Date.now() - shownAt;
        if (elapsed >= minVisible) { visible.value = false; return; }
        hideTimer = setTimeout(() => { hideTimer = null; visible.value = false; }, minVisible - elapsed);
      }
    },
    { immediate: true },
  );

  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (showTimer) clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
    });
  }
  return visible;
}
```

Export in `index.ts` (dopo la riga `export { formatEuro, … }`):

```ts
export { useDelayedLoading } from './useDelayedLoading';
```

- [ ] **Step 4: Verifica + suite + commit**

Run: `npx vitest run ../../packages/ui-kit/src/useDelayedLoading.spec.ts` → PASS (6 test); `npx vitest run` da `apps/web-staff` → verde.

```bash
git add packages/ui-kit/src/useDelayedLoading.ts packages/ui-kit/src/useDelayedLoading.spec.ts packages/ui-kit/src/index.ts
git commit -m "feat(ui-kit): useDelayedLoading - gate anti-flicker 150/300ms"
```

---

### Task 4: `DataTable` — prop `loading`

**Files:**
- Modify: `packages/ui-kit/src/components/DataTable.vue`
- Modify: `packages/ui-kit/src/components/DataTable.spec.ts`

**Interfaces:**
- Consumes: `Skeleton` (Task 1), `useDelayedLoading` (Task 3).
- Produces: props aggiuntive `loading?: boolean` (default `false`) e `skeletonRows?: number` (default `5`). Comportamento: gate interno; skeleton SOLO con 0 righe; `emptyMessage` soppresso mentre `loading`; footer nascosto mentre lo skeleton è visibile; `aria-busy="true"` sul contenitore radice quando lo skeleton è visibile.

- [ ] **Step 1: Aggiungere gli spec (rosso)**

In `packages/ui-kit/src/components/DataTable.spec.ts`, aggiornare la riga di import vitest in testa al file:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

e aggiungere in coda al file:

```ts
describe('DataTable — loading (skeleton in-card, gate anti-flicker interno)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pre-delay: niente skeleton, niente emptyMessage (finestra 0-150ms vuota)', () => {
    const w = mount(DataTable, { props: { columns, rows: [], loading: true, emptyMessage: 'Vuoto' } });
    expect(w.find('[data-test="skeleton"]').exists()).toBe(false);
    expect(w.text()).not.toContain('Vuoto');
  });

  it('dopo il delay: righe skeleton (default 5) per tutte le colonne, aria-busy sul contenitore', async () => {
    const w = mount(DataTable, { props: { columns, rows: [], loading: true, emptyMessage: 'Vuoto' } });
    await vi.advanceTimersByTimeAsync(150);
    await w.vm.$nextTick();
    const trs = w.findAll('tbody tr');
    expect(trs).toHaveLength(5);
    expect(trs[0].findAll('[data-test="skeleton"]')).toHaveLength(columns.length);
    expect(w.find('div.overflow-hidden').attributes('aria-busy')).toBe('true');
    expect(w.text()).not.toContain('Vuoto');
  });

  it('skeletonRows personalizza il numero di righe', async () => {
    const w = mount(DataTable, { props: { columns, rows: [], loading: true, skeletonRows: 3 } });
    await vi.advanceTimersByTimeAsync(150);
    await w.vm.$nextTick();
    expect(w.findAll('tbody tr')).toHaveLength(3);
  });

  it('mai sopra dati reali: refetch con righe presenti → nessuno skeleton', async () => {
    const w = mount(DataTable, { props: { columns, rows, loading: true } });
    await vi.advanceTimersByTimeAsync(2000);
    await w.vm.$nextTick();
    expect(w.find('[data-test="skeleton"]').exists()).toBe(false);
    expect(w.text()).toContain('Mario');
  });

  it('minVisible: i dati arrivati durante lo skeleton aspettano i 300ms; footer soppresso nel frattempo', async () => {
    const w = mount(DataTable, { props: { columns, rows: [], loading: true, showCount: true } });
    await vi.advanceTimersByTimeAsync(200); // skeleton visibile da 50ms
    await w.setProps({ loading: false, rows });
    await w.vm.$nextTick();
    expect(w.findAll('[data-test="skeleton"]').length).toBeGreaterThan(0); // ancora skeleton
    expect(w.find('[data-test="table-footer"]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(250); // 300ms dalla comparsa
    await w.vm.$nextTick();
    expect(w.find('[data-test="skeleton"]').exists()).toBe(false);
    expect(w.text()).toContain('Mario');
    expect(w.find('[data-test="table-footer"]').exists()).toBe(true);
  });

  it('risposta rapida: fine loading sotto i 150ms → mai skeleton, emptyMessage regolare', async () => {
    const w = mount(DataTable, { props: { columns, rows: [], loading: true, emptyMessage: 'Vuoto' } });
    await vi.advanceTimersByTimeAsync(100);
    await w.setProps({ loading: false });
    await vi.advanceTimersByTimeAsync(1000);
    await w.vm.$nextTick();
    expect(w.find('[data-test="skeleton"]').exists()).toBe(false);
    expect(w.text()).toContain('Vuoto');
  });
});
```

- [ ] **Step 2: Verificare che falliscano**

Run: `npx vitest run ../../packages/ui-kit/src/components/DataTable.spec.ts`
Expected: FAIL sui 6 test nuovi (prop `loading` inesistente → skeleton mai reso, `Vuoto` visibile nel primo test).

- [ ] **Step 3: Implementare in `DataTable.vue`**

Script — aggiungere gli import (accanto agli esistenti):

```ts
import Skeleton from './Skeleton.vue';
import { useDelayedLoading } from '../useDelayedLoading';
```

Estendere le props (dentro il `defineProps` esistente, dopo `rowClass`):

```ts
    loading?: boolean;
    skeletonRows?: number;
```

e i default: `{ density: 'comfortable', showCount: false, loading: false, skeletonRows: 5 }`.

Dopo il blocco `footerVisible`/`footerLabel`, aggiungere:

```ts
// --- skeleton di caricamento (spec 2026-07-21-loading-states §4.1) ---
// Gate interno: il chiamante passa isLoading grezzo. Input del gate = loading E 0 righe:
// un refetch con dati stantii visibili non attiva mai lo skeleton (mai sopra dati reali).
const skeletonBusy = useDelayedLoading(() => !!props.loading && (props.rows?.length ?? 0) === 0);
const SKELETON_WIDTHS = ['70%', '85%', '60%', '75%', '90%'] as const;
function skeletonWidth(r: number, c: number): string {
  return SKELETON_WIDTHS[(r + c) % SKELETON_WIDTHS.length];
}
```

Aggiornare `footerVisible` (il footer non convive con lo skeleton):

```ts
const footerVisible = computed(() => !skeletonBusy.value && !!props.rows && sorted.value.length > 0 && (!!props.pageSize || props.showCount));
```

Template — sul contenitore radice (il primo `div.overflow-hidden`) aggiungere:

```
:aria-busy="skeletonBusy ? 'true' : undefined"
```

Sostituire i due `tbody` data-driven con (il ramo slot `v-else` resta invariato):

```html
<tbody v-if="skeletonBusy">
  <tr v-for="r in skeletonRows" :key="r">
    <td v-for="(c, ci) in columns" :key="c.key" :class="cellClass(c, ci === 0)">
      <Skeleton variant="line" :width="skeletonWidth(r, ci)" />
    </td>
  </tr>
</tbody>
<tbody v-else-if="rows && rows.length === 0 && emptyMessage && !loading">
  <tr><td :colspan="columns.length" class="p-4"><EmptyState :message="emptyMessage" /></td></tr>
</tbody>
<tbody v-else-if="rows">
  <!-- righe reali: invariato -->
</tbody>
```

- [ ] **Step 4: Verifica + suite + commit**

Run: `npx vitest run ../../packages/ui-kit/src/components/DataTable.spec.ts` → PASS; poi `npx vitest run` da `apps/web-staff` → tutta verde (le viste esistenti non passano `loading`: default false, zero cambi).

```bash
git add packages/ui-kit/src/components/DataTable.vue packages/ui-kit/src/components/DataTable.spec.ts
git commit -m "feat(ui-kit): DataTable prop loading - righe skeleton con gate anti-flicker interno"
```

---

### Task 5: `StatTile` loading + `ModalFooter` submitLoading

**Files:**
- Modify: `packages/ui-kit/src/components/StatTile.vue`
- Modify: `packages/ui-kit/src/components/StatTile.spec.ts`
- Modify: `packages/ui-kit/src/components/ModalFooter.vue`
- Modify: `packages/ui-kit/src/components/ModalFooter.spec.ts`

**Interfaces:**
- Consumes: `Skeleton` (Task 1), `useDelayedLoading` (Task 3).
- Produces: `StatTile` — `value` diventa opzionale (default `''`), nuova prop `loading?: boolean` (gate interno; con gate attivo il valore è uno `Skeleton`, la label resta reale, `aria-busy` sul tile). `ModalFooter` — nuova prop `submitLoading?: boolean` (default `false`) passata come `:loading` al Button di submit.

- [ ] **Step 1: Spec StatTile (rosso)**

In `packages/ui-kit/src/components/StatTile.spec.ts` aggiornare l'import vitest per includere `vi, beforeEach, afterEach` e aggiungere in coda:

```ts
describe('StatTile — loading', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('dopo il delay il valore è uno skeleton, la label resta reale, aria-busy sul tile', async () => {
    const w = mount(StatTile, { props: { label: 'Ombrelloni', loading: true } });
    expect(w.find('[data-test="skeleton"]').exists()).toBe(false); // pre-delay
    await vi.advanceTimersByTimeAsync(150);
    await w.vm.$nextTick();
    expect(w.find('[data-test="skeleton"]').exists()).toBe(true);
    expect(w.text()).toContain('Ombrelloni');
    expect(w.attributes('aria-busy')).toBe('true');
  });

  it('senza loading rende il valore come sempre', () => {
    const w = mount(StatTile, { props: { label: 'File', value: '12' } });
    expect(w.text()).toContain('12');
    expect(w.find('[data-test="skeleton"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Spec ModalFooter (rosso)**

In `packages/ui-kit/src/components/ModalFooter.spec.ts` aggiungere in coda:

```ts
describe('ModalFooter — submitLoading', () => {
  it('il bottone di conferma mostra spinner, aria-busy ed è disabilitato', () => {
    const w = mount(ModalFooter, { props: { submitLabel: 'Salva', submitLoading: true } });
    const submit = w.findAll('button')[1];
    expect(submit.attributes('aria-busy')).toBe('true');
    expect(submit.attributes('disabled')).toBeDefined();
    expect(submit.find('svg').exists()).toBe(true);
  });
});
```

- [ ] **Step 3: Verificare che falliscano**

Run: `npx vitest run ../../packages/ui-kit/src/components/StatTile.spec.ts ../../packages/ui-kit/src/components/ModalFooter.spec.ts`
Expected: FAIL — 3 test nuovi rossi (StatTile: `value` required manca → warning + niente skeleton; ModalFooter: niente aria-busy).

- [ ] **Step 4: Implementare StatTile**

Sostituire lo script di `StatTile.vue`:

```vue
<script setup lang="ts">
import Skeleton from './Skeleton.vue';
import { useDelayedLoading } from '../useDelayedLoading';

const props = withDefaults(
  defineProps<{
    value?: string;
    label: string;
    tone?: 'default' | 'accent';
    layout?: 'value-first' | 'label-first';
    loading?: boolean;
  }>(),
  { value: '', tone: 'default', layout: 'value-first', loading: false },
);

const skeletonBusy = useDelayedLoading(() => !!props.loading);
</script>
```

Template — il div radice guadagna `:aria-busy="skeletonBusy ? 'true' : undefined"`; in ENTRAMBI i layout il div del valore diventa:

```html
<!-- layout label-first -->
<Skeleton v-if="skeletonBusy" width="56px" height="20px" class="mt-1.5" />
<div v-else class="mt-1 text-2xl font-bold tabular-nums" :class="tone === 'accent' ? 'text-[var(--color-brand-ink)]' : 'text-[var(--color-text)]'">{{ value }}</div>
```

```html
<!-- layout value-first -->
<Skeleton v-if="skeletonBusy" width="56px" height="20px" class="mb-1" />
<div v-else class="text-2xl font-bold tabular-nums" :class="tone === 'accent' ? 'text-[var(--color-brand-ink)]' : 'text-[var(--color-text)]'">{{ value }}</div>
```

- [ ] **Step 5: Implementare ModalFooter**

In `ModalFooter.vue`: aggiungere `submitLoading?: boolean;` alle props con default `submitLoading: false`, e sul Button di submit:

```html
<Button type="button" :variant="submitVariant" :disabled="submitDisabled" :loading="submitLoading" @click="$emit('submit')">{{ submitLabel }}</Button>
```

- [ ] **Step 6: Verifica + suite + commit**

Run mirato → PASS; `npx vitest run` da `apps/web-staff` → verde; `pnpm -r run typecheck` → pulito (il `value` opzionale è additivo).

```bash
git add packages/ui-kit/src/components/StatTile.vue packages/ui-kit/src/components/StatTile.spec.ts packages/ui-kit/src/components/ModalFooter.vue packages/ui-kit/src/components/ModalFooter.spec.ts
git commit -m "feat(ui-kit): StatTile loading + ModalFooter submitLoading"
```

---

### Task 6: web-staff — tabelle (CustomersView, RenewalsView, BookingsView)

**Files:**
- Modify: `apps/web-staff/src/features/customers/CustomersView.vue:60-62`
- Modify: `apps/web-staff/src/features/renewals/RenewalsView.vue`
- Modify: `apps/web-staff/src/features/bookings/BookingsView.vue:17,60`

**Interfaces:**
- Consumes: `DataTable :loading` (Task 4).

- [ ] **Step 1: CustomersView**

Rimuovere la riga `<p v-if="isLoading" class="text-[var(--color-text-muted)]">Caricamento…</p>` e il `v-else` sul DataTable; aggiungere `:loading="isLoading"`:

```html
<DataTable
  :columns="cols"
  :rows="(filtered as unknown as Record<string, unknown>[])"
  :row-key="(r) => (r as unknown as CustomerDTO).id"
  :page-size="25"
  :loading="isLoading"
  empty-message="Nessun cliente trovato"
  @row-click="(r) => router.push({ name: 'customer-detail', params: { id: (r as unknown as CustomerDTO).id } })"
>
```

- [ ] **Step 2: RenewalsView — loading su entrambe le tabelle + pending per-riga su «Rinnova»**

Nello script, estrarre gli `isLoading`:

```ts
const { data: subs, isLoading: subsLoading } = useSubscriptions(originSeasonId);
const { data: campaign, isLoading: campaignLoading } = useRenewalCampaign(destinationSeasonId);
```

Tabella finestre (riga `<DataTable v-if="campaign" …`): aggiungere `:loading="campaignLoading"`.
Tabella abbonati: aggiungere `:loading="subsLoading"`.

Bottoni «Rinnova» — pending sulla riga giusta via `variables` (il payload di `renew.mutate` è `{ id, destinationSeasonId }`):

```html
<!-- tabella finestre -->
<Button size="sm" :disabled="(row as unknown as RenewalWindowItemDTO).state === 'exercised' || !destinationSeasonId"
  :loading="renew.isPending.value && renew.variables.value?.id === (row as unknown as RenewalWindowItemDTO).sourceBookingId"
  @click="doRenew((row as unknown as RenewalWindowItemDTO).sourceBookingId)">Rinnova</Button>
```

```html
<!-- tabella abbonati -->
<Button size="sm" :disabled="(row as unknown as SubscriptionListItemDTO).renewed"
  :loading="renew.isPending.value && renew.variables.value?.id === (row as unknown as SubscriptionListItemDTO).id"
  @click="doRenew((row as unknown as SubscriptionListItemDTO).id)">Rinnova</Button>
```

- [ ] **Step 3: BookingsView (costo zero)**

Riga 17: `const { data: bookings, isLoading: bookingsLoading } = useDayBookings(activeDate);`
Riga 60 (DataTable): aggiungere `:loading="bookingsLoading"`.

- [ ] **Step 4: Suite + typecheck + commit**

Run da `apps/web-staff`: `npx vitest run` → verde (MSW risponde sotto i 150ms → il gate non scatta, gli spec esistenti non vedono differenze). `pnpm --filter @coralyn/web-staff run typecheck`.

```bash
git add apps/web-staff/src/features/customers/CustomersView.vue apps/web-staff/src/features/renewals/RenewalsView.vue apps/web-staff/src/features/bookings/BookingsView.vue
git commit -m "refactor(web-staff): Clienti, Rinnovi e Prenotazioni su DataTable :loading + pending per-riga su Rinnova"
```

---

### Task 7: web-staff — dettagli (CustomerDetailView, EstablishmentView)

**Files:**
- Modify: `apps/web-staff/src/features/customers/CustomerDetailView.vue:121`
- Modify: `apps/web-staff/src/features/establishment/EstablishmentView.vue`

**Interfaces:**
- Consumes: `Skeleton`, `SkeletonText`, `useDelayedLoading` (Task 1-3), `StatTile :loading` (Task 5).

- [ ] **Step 1: CustomerDetailView**

Import: aggiungere `Skeleton, SkeletonText, useDelayedLoading` all'import da `@coralyn/ui-kit`. Script:

```ts
const skeletonVisible = useDelayedLoading(() => isLoading.value);
```

Sostituire `<p v-if="isLoading" class="text-[var(--color-text-muted)]">Caricamento…</p>` con:

```html
<div v-if="skeletonVisible" aria-busy="true" class="flex max-w-[720px] flex-col gap-4">
  <Skeleton width="90px" />
  <div class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 [box-shadow:var(--shadow-card)]">
    <SkeletonText :lines="4" />
  </div>
</div>
```

(i rami `v-else-if="isError"` / `v-else-if="customer"` restano invariati: nella finestra pre-delay non rende nulla, per design).

- [ ] **Step 2: EstablishmentView — skeleton card info/team + chiusura drift CTA**

Import: aggiungere `SkeletonText, useDelayedLoading` all'import da `@coralyn/ui-kit`. Script:

```ts
const skeletonVisible = useDelayedLoading(() => isPending.value);
```

Card «Informazioni stabilimento»: avvolgere il blocco campi in

```html
<SkeletonText v-if="skeletonVisible" :lines="3" class="mt-4" aria-busy="true" />
<div v-else class="mt-4 flex flex-col gap-3.5">
  <!-- i tre campi Nome / Stagione attiva / Fasce operative, invariati -->
</div>
```

Tiles struttura: `<StatTile v-for="s in structureTiles" … :loading="isPending" />` (gate interno).

Lista team — il contenitore righe (riga 165, `<div class="flex flex-col">`) diventa:

```html
<SkeletonText v-if="skeletonVisible" :lines="3" aria-busy="true" />
<div v-else class="flex flex-col">
  <!-- le righe v-for="u in team", invariate -->
</div>
```

Drift CTA (righe 175-176):

```html
<Button data-testid="toggle-user-disabled" variant="secondary" size="sm" :loading="togglingDisabled" @click="toggleDisabled(u)">{{ u.disabled ? 'Riabilita' : 'Disabilita' }}</Button>
<Button v-if="!u.disabled" data-testid="reset-user-password" variant="secondary" size="sm" :loading="resetStaff.isPending.value" @click="askReset(u)">Reset password</Button>
```

- [ ] **Step 3: Suite + commit**

`npx vitest run` da `apps/web-staff` → verde.

```bash
git add apps/web-staff/src/features/customers/CustomerDetailView.vue apps/web-staff/src/features/establishment/EstablishmentView.vue
git commit -m "refactor(web-staff): skeleton nei dettagli cliente/stabilimento + CTA :loading"
```

---

### Task 8: web-staff — MapView (skeleton canvas + submitLoading prenotazione)

**Files:**
- Modify: `apps/web-staff/src/features/map/MapView.vue:299-301,524`

**Interfaces:**
- Consumes: `Skeleton`, `useDelayedLoading` (Task 1, 3), `ModalFooter submitLoading` (Task 5).

- [ ] **Step 1: Skeleton canvas**

Import: aggiungere `Skeleton, useDelayedLoading` all'import da `@coralyn/ui-kit`. Script:

```ts
const skeletonVisible = useDelayedLoading(() => isLoading.value);
```

Sostituire `<p v-if="isLoading" class="px-[26px] py-10 text-[var(--color-text-muted)]">Caricamento…</p>` e il `v-else` successivo con:

```html
<div v-if="skeletonVisible" aria-busy="true" class="min-w-0 flex-1 px-[26px] py-6">
  <Skeleton variant="block" height="420px" />
</div>
<div v-else-if="!isLoading" class="map-stage min-w-0 flex-1">
```

(nella finestra pre-delay non rende nulla; il resto del template è invariato).

- [ ] **Step 2: ModalFooter prenotazione**

Riga 524 — la precondizione del preventivo resta su `submit-disabled`, il pending della mutation va su `submit-loading`:

```html
<ModalFooter submit-label="Conferma prenotazione" :submit-disabled="quoteError || quoteLoading" :submit-loading="createBooking.isPending.value" @cancel="modalBooking = false" @submit="confirmBooking" />
```

- [ ] **Step 3: Suite + commit**

`npx vitest run` da `apps/web-staff` → verde.

```bash
git add apps/web-staff/src/features/map/MapView.vue
git commit -m "refactor(web-staff): skeleton canvas mappa + submitLoading su conferma prenotazione"
```

---

### Task 9: web-staff — modali incasso, RentalsView, Pricing/Catalogo (costo zero)

**Files:**
- Modify: `apps/web-staff/src/features/bookings/SettlePaymentModal.vue:98`
- Modify: `apps/web-staff/src/features/rentals/SettleRentalPaymentModal.vue:99`
- Modify: `apps/web-staff/src/features/rentals/RentalsView.vue:21,157,197`
- Modify: `apps/web-staff/src/features/pricing/PricingView.vue:78`
- Modify: `apps/web-staff/src/features/rentals/RentalCatalogView.vue:34,92`

**Interfaces:**
- Consumes: `DataTable :loading` (Task 4), `ModalFooter submitLoading` (Task 5); `Button :loading` (esistente).

- [ ] **Step 1: Modali incasso — `submitting` da disabled a loading**

In entrambi i file (`SettlePaymentModal.vue` riga 98, `SettleRentalPaymentModal.vue` riga 99):

```html
<ModalFooter submit-label="Conferma incasso" :submit-loading="submitting" @cancel="open = false" @submit="confirm" />
```

- [ ] **Step 2: RentalsView — checkout e rientro**

Riga 197 (la validità form resta su disabled, il pending sulla mutation):

```html
<ModalFooter submit-label="Conferma noleggio" :submit-disabled="!itemId || !tariffId" :submit-loading="checkout.isPending.value" @cancel="modalOpen = false" @submit="confirmCheckout" />
```

Riga 157 — «Rientro» per-riga (variables è l'id):

```html
<Button v-if="(row as unknown as RentalDTO).status === 'active'" variant="secondary" size="sm" :data-test="`return-${(row as unknown as RentalDTO).id}`"
  :loading="returnRental.isPending.value && returnRental.variables.value === (row as unknown as RentalDTO).id"
  @click="returnRental.mutate((row as unknown as RentalDTO).id)">Rientro</Button>
```

- [ ] **Step 3: Tabelle a costo zero (Rentals, Pricing, Catalogo)**

`RentalsView.vue` riga 21: `const { data: day, isLoading: dayLoading } = useRentals(activeDate);` → sul DataTable dei noleggi del giorno aggiungere `:loading="dayLoading"`.

`PricingView.vue` riga 78: `const { data: rates, isLoading: ratesLoading } = useRates(getSeasonId);` → sul DataTable delle tariffe aggiungere `:loading="ratesLoading"`.

`RentalCatalogView.vue` riga 34: `const { data: itemsData, isLoading: itemsLoading } = useAllRentalItems();` → DataTable del catalogo: `:loading="itemsLoading"`. Riga 92: `const { data: tariffsData, isLoading: tariffsLoading } = useRentalTariffs(getItemId, getSeasonId);` → DataTable delle tariffe noleggio: `:loading="tariffsLoading"`.

(`CustomerPaymentsCard` è escluso a ragion veduta: riceve `bookings` via prop dal dettaglio già caricato — lo copre lo skeleton del padre.)

- [ ] **Step 4: Suite + commit**

`npx vitest run` da `apps/web-staff` → verde (gli spec dei modali asseriscono il testo dei bottoni, non gli attributi disabled).

```bash
git add apps/web-staff/src/features/bookings/SettlePaymentModal.vue apps/web-staff/src/features/rentals/SettleRentalPaymentModal.vue apps/web-staff/src/features/rentals/RentalsView.vue apps/web-staff/src/features/pricing/PricingView.vue apps/web-staff/src/features/rentals/RentalCatalogView.vue
git commit -m "refactor(web-staff): submitLoading nei modali + :loading sulle tabelle restanti"
```

---

### Task 10: web-platform — Lidi lista + dettaglio

**Files:**
- Modify: `apps/web-platform/src/features/establishments/EstablishmentsListView.vue:83-92,107-120`
- Modify: `apps/web-platform/src/features/establishments/EstablishmentDetailView.vue`

**Interfaces:**
- Consumes: `DataTable :loading` (Task 4), `Skeleton`, `useDelayedLoading` (Task 1, 3), `StatTile :loading` (Task 5).

- [ ] **Step 1: EstablishmentsListView**

Rimuovere la riga 83 `<p v-if="isLoading" class="py-10 text-center text-sm text-[var(--color-text-muted)]">Caricamento…</p>`; il DataTable perde `v-else` e guadagna `:loading`:

```html
<DataTable
  :columns="cols"
  :rows="(establishments as unknown as Record<string, unknown>[])"
  :row-key="(r) => (r as unknown as PlatformEstablishmentDTO).id"
  :loading="isLoading"
  empty-message="Nessun lido registrato."
>
```

Bottoni per-riga Sospendi/Riattiva (righe 107-120): sostituire `:disabled="isSuspending((row as unknown as PlatformEstablishmentDTO).id)"` con `:loading="isSuspending((row as unknown as PlatformEstablishmentDTO).id)"` e, sul bottone Riattiva, `:disabled="isReactivating(…)"` con `:loading="isReactivating(…)"` (stesso argomento).

- [ ] **Step 2: EstablishmentDetailView**

Import: aggiungere `Skeleton, useDelayedLoading` da `@coralyn/ui-kit`. Script:

```ts
const skeletonVisible = useDelayedLoading(() => isLoading.value);
const METRIC_LABELS = ['Ombrelloni', 'Settori', 'File', 'Staff attivi', 'Incasso stagione', 'Abbonamenti attivi', 'Prenotazioni stagione', 'Occ. oggi', 'Ultima attività', 'Creato'] as const;
```

Sostituire `<p v-if="isLoading" …>Caricamento…</p>` con:

```html
<div v-if="skeletonVisible" aria-busy="true">
  <div class="mb-5 flex items-center gap-3"><Skeleton width="220px" height="28px" /></div>
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
    <StatTile v-for="l in METRIC_LABELS" :key="l" :label="l" loading />
  </div>
</div>
```

e il ramo EmptyState diventa `v-else-if="!isLoading && (isError || !data)"` (senza la guardia, nella finestra pre-delay «Lido non trovato» lampeggerebbe).

Drift CTA (righe 77-90): `:disabled` → `:loading` su entrambi i bottoni:

```html
:loading="suspend.isPending.value || reactivate.isPending.value"
```

```html
:loading="resetPw.isPending.value"
```

- [ ] **Step 3: Suite + typecheck + commit**

Run da `apps/web-platform`: `npx vitest run` → verde; `pnpm --filter @coralyn/web-platform run typecheck`.

```bash
git add apps/web-platform/src/features/establishments/EstablishmentsListView.vue apps/web-platform/src/features/establishments/EstablishmentDetailView.vue
git commit -m "refactor(web-platform): skeleton su lista/dettaglio Lidi + CTA :loading"
```

---

### Task 11: web-customer — MySubscriptionsView + AbsenceReleaseModal

**Files:**
- Modify: `apps/web-customer/src/features/subscriptions/MySubscriptionsView.vue:47-49`
- Modify: `apps/web-customer/src/features/subscriptions/AbsenceReleaseModal.vue:90-96`

**Interfaces:**
- Consumes: `SkeletonText`, `useDelayedLoading` (Task 2-3); `Button :loading` (esistente).

- [ ] **Step 1: MySubscriptionsView**

Import: aggiungere `SkeletonText, useDelayedLoading` da `@coralyn/ui-kit`. Script:

```ts
const skeletonVisible = useDelayedLoading(() => isLoading.value);
```

Sostituire `<p v-if="isLoading" …>Caricamento…</p>` con:

```html
<div v-if="skeletonVisible" aria-busy="true" class="flex flex-col gap-4">
  <div v-for="i in 2" :key="i" class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 [box-shadow:var(--shadow-card)]">
    <SkeletonText :lines="3" />
  </div>
</div>
```

e la guardia dell'EmptyState diventa `v-else-if="!isLoading && subscriptions.length === 0"`.

- [ ] **Step 2: AbsenceReleaseModal**

Bottone conferma (righe 90-96): `:disabled="release.isPending.value"` → `:loading="release.isPending.value"`.

- [ ] **Step 3: Suite + typecheck + commit**

Run da `apps/web-customer`: `npx vitest run` → verde; `pnpm --filter @coralyn/web-customer run typecheck`.

```bash
git add apps/web-customer/src/features/subscriptions/MySubscriptionsView.vue apps/web-customer/src/features/subscriptions/AbsenceReleaseModal.vue
git commit -m "refactor(web-customer): skeleton abbonamenti + :loading su segnala assenza"
```

---

### Task 12: Docs design-system + verifica finale monorepo

**Files:**
- Modify: `docs/design/design-system.md` (§3 token, §10 voci componenti)

**Interfaces:**
- Consumes: tutto quanto sopra (documenta lo stato shippato).

- [ ] **Step 1: §3 — token skeleton**

Nel blocco token di §3 (accanto a `--tracking-caps`):

```
--color-skeleton: var(--color-warm-150);        /* base skeleton di caricamento */
--color-skeleton-sheen: var(--color-warm-050);  /* sheen dello shimmer (sweep 1.6s, statico con reduced-motion) */
```

- [ ] **Step 2: §10 — voce Skeleton + aggiornamenti DataTable/StatTile/ModalFooter**

Nuova voce (in ordine alfabetico accanto a Select/SegmentedControl):

```markdown
- **Skeleton / SkeletonText** — placeholder di caricamento: `variant: line | block | circle`,
  `width`/`height`; shimmer `skeleton-sheen` sui token `--color-skeleton*` (statico con
  reduced-motion); sempre `aria-hidden` (lo stato lo annuncia il contenitore con `aria-busy`).
  `SkeletonText :lines` = righe a larghezze deterministiche per indice (mai random), ultima al
  60%. Anti-flicker centralizzato in `useDelayedLoading(source, { delay: 150, minVisible: 300 })`:
  visibile solo oltre 150ms di attesa, poi per almeno 300ms. Regola: lo skeleton non sostituisce
  MAI dati reali (refetch con dati stantii = silenzioso). Spec:
  [loading-states](../superpowers/specs/2026-07-21-loading-states-design.md).
```

Voce DataTable — aggiungere accanto a `emptyMessage`:

```markdown
  - **`loading`**: skeleton in-card (`skeletonRows`, default 5) con gate anti-flicker interno —
    il chiamante passa `isLoading` grezzo. Solo con 0 righe; `emptyMessage` e footer soppressi
    durante lo skeleton; `aria-busy` sul contenitore. Solo API data-driven.
```

Voce StatTile: menzionare `loading` (skeleton al posto del valore, label reale, gate interno) e `value` ora opzionale. Voce ModalFooter: aggiungere `submitLoading` all'elenco prop.

- [ ] **Step 3: Coerenza doc↔codice**

Rileggere le voci §10 modificate confrontandole col codice shippato (prop, default, comportamenti). Correggere eventuali discrepanze ORA.

- [ ] **Step 4: Verifica finale monorepo + commit**

```bash
cd apps/web-staff && npx vitest run          # attese: tutte verdi
cd ../web-platform && npx vitest run
cd ../web-customer && npx vitest run
cd ../.. && pnpm -r run typecheck
grep -rn "Caricamento…" apps --include=*.vue # atteso: nessun residuo nelle viste migrate
```

```bash
git add docs/design/design-system.md
git commit -m "docs(design): voce Skeleton/useDelayedLoading + aggiornamenti DataTable, StatTile, ModalFooter"
```

---

## Post-piano (fuori dai task, per il controller)

- La resa (shimmer, proporzioni skeleton, reduced-motion) va vista in browser: jsdom non la copre. Prova visiva con l'utente a 375/768/1280.
- `SetPasswordView` («Verifica del link…») è fuori scope per spec §8 — non toccarla.
