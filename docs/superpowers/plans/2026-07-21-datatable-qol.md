# DataTable QoL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolvere il `DataTable` ui-kit con wrapping governato, paginazione client-side, ordinamento, stati integrati, sticky header e densità — e migrare le 4 viste che usano l'API a slot alla API data-driven.

**Architecture:** Tutte le feature nuove sono **additive** sull'API data-driven (`rows`); l'API a slot resta funzionante ma congelata. Le funzioni pure (sort, finestra di paginazione, label conteggio) vivono in `packages/ui-kit/src/tableData.ts` (stesso pattern di `format.ts`), il componente tiene stato e orchestrazione. Zero dominio in ui-kit (ADR-0033). Spec di riferimento: `docs/superpowers/specs/2026-07-21-datatable-qol-design.md`.

**Tech Stack:** Vue 3.5 (`defineModel` stabile), Tailwind (token Coralyn in `theme.css`), Vitest + @vue/test-utils (jsdom).

## Global Constraints

- **Solo token semantici** — nessun hex fuori da `theme.css`; hover/focus/disabled secondo design-system §10.1 (`--ring-focus`, `opacity-50`, `--motion-fast`/`--ease-standard`).
- **Retro-compatibilità**: i 9 usi attuali di DataTable devono compilare e rendere invariati senza modifiche. L'API a slot non riceve feature nuove.
- **Suite completa sempre**: ogni task termina con `npx vitest run` da `apps/web-staff` (include gli spec ui-kit; baseline attuale 451 test) + `pnpm typecheck` dalla root. Mai solo lo spec toccato (regola cross-file).
- **Niente reka-ui** in questo lavoro → niente stub `ResizeObserver` necessari.
- **Icone già disponibili**: `chevron-left`, `chevron-right`, `arrow-up`, `arrow-down` sono già nel registry — nessun lavoro sulle icone.
- **jsdom non vede la resa**: truncate/sticky/breakpoint si asseriscono come classi/stili; la prova visiva in browser è un gate separato post-piano (login gate, insieme all'utente).
- Commit convenzionali in italiano (`feat(ui-kit): …`, `refactor(web-staff): …`), un commit per task, con trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Funzioni pure `tableData.ts`

**Files:**
- Create: `packages/ui-kit/src/tableData.ts`
- Test: `packages/ui-kit/src/tableData.spec.ts`

**Interfaces:**
- Consumes: niente.
- Produces (usati dai Task 2–5 e riesportati nel Task 2):
  - `type DataTableColumn = { key: string; label: string; align?: 'left'|'right'; numeric?: boolean; sortable?: boolean; sortValue?: (row: Record<string, unknown>) => string | number; wrap?: 'wrap'|'nowrap'|'truncate'; maxWidth?: string; hideBelow?: 'sm'|'md'|'lg' }`
  - `type SortDir = 'asc' | 'desc'`
  - `sortRows<T>(rows: readonly T[], accessor: (row: T) => unknown, dir: SortDir): T[]` — copia ordinata; stringhe con `localeCompare('it', { numeric: true, sensitivity: 'base' })`, numeri numericamente, `null`/`undefined` **sempre in fondo** (in entrambe le direzioni).
  - `paginate<T>(rows: readonly T[], page: number, pageSize: number): T[]` — finestra 1-based.
  - `pageCount(total: number, pageSize: number): number` — minimo 1.
  - `countLabel(total: number, window?: { page: number; pageSize: number }): string` — senza finestra `«87 righe»`/`«1 riga»`; con finestra `«1–20 di 87»`; `total === 0` → `«0 righe»` anche con finestra.

- [ ] **Step 1: Scrivi lo spec (deve fallire)**

```ts
// packages/ui-kit/src/tableData.spec.ts
import { describe, it, expect } from 'vitest';
import { sortRows, paginate, pageCount, countLabel } from './tableData';

const byNome = (r: { nome: string | null }) => r.nome;

describe('sortRows', () => {
  const rows = [{ nome: 'mario' }, { nome: 'Anna' }, { nome: 'Luca' }];
  it('ordina stringhe case-insensitive con localeCompare', () => {
    expect(sortRows(rows, byNome, 'asc').map((r) => r.nome)).toEqual(['Anna', 'Luca', 'mario']);
    expect(sortRows(rows, byNome, 'desc').map((r) => r.nome)).toEqual(['mario', 'Luca', 'Anna']);
  });
  it('non muta l\'array di partenza', () => {
    const input = [...rows];
    sortRows(input, byNome, 'asc');
    expect(input.map((r) => r.nome)).toEqual(['mario', 'Anna', 'Luca']);
  });
  it('ordina numeri numericamente, non lessicograficamente', () => {
    const nums = [{ v: 10 }, { v: 2 }, { v: 1 }];
    expect(sortRows(nums, (r) => r.v, 'asc').map((r) => r.v)).toEqual([1, 2, 10]);
  });
  it('null/undefined finiscono in fondo in entrambe le direzioni', () => {
    const withNull = [{ nome: null }, { nome: 'Anna' }, { nome: 'Luca' }];
    expect(sortRows(withNull, byNome, 'asc').map((r) => r.nome)).toEqual(['Anna', 'Luca', null]);
    expect(sortRows(withNull, byNome, 'desc').map((r) => r.nome)).toEqual(['Luca', 'Anna', null]);
  });
  it('stringhe con numeri: ordinamento naturale (Fila 2 < Fila 10)', () => {
    const labels = [{ nome: 'Fila 10' }, { nome: 'Fila 2' }];
    expect(sortRows(labels, byNome, 'asc').map((r) => r.nome)).toEqual(['Fila 2', 'Fila 10']);
  });
});

describe('paginate / pageCount', () => {
  const rows = Array.from({ length: 87 }, (_, i) => i + 1);
  it('finestra 1-based', () => {
    expect(paginate(rows, 1, 20)).toEqual(rows.slice(0, 20));
    expect(paginate(rows, 5, 20)).toEqual([81, 82, 83, 84, 85, 86, 87]);
  });
  it('pagina oltre la fine → vuota', () => {
    expect(paginate(rows, 6, 20)).toEqual([]);
  });
  it('pageCount arrotonda in alto, minimo 1', () => {
    expect(pageCount(87, 20)).toBe(5);
    expect(pageCount(20, 20)).toBe(1);
    expect(pageCount(0, 20)).toBe(1);
  });
});

describe('countLabel', () => {
  it('senza finestra: conteggio con plurale', () => {
    expect(countLabel(87)).toBe('87 righe');
    expect(countLabel(1)).toBe('1 riga');
    expect(countLabel(0)).toBe('0 righe');
  });
  it('con finestra: range «1–20 di 87»', () => {
    expect(countLabel(87, { page: 1, pageSize: 20 })).toBe('1–20 di 87');
    expect(countLabel(87, { page: 5, pageSize: 20 })).toBe('81–87 di 87');
  });
  it('0 righe con finestra: niente range', () => {
    expect(countLabel(0, { page: 1, pageSize: 20 })).toBe('0 righe');
  });
});
```

- [ ] **Step 2: Verifica che fallisca**

Run (da `apps/web-staff`): `npx vitest run ../../packages/ui-kit/src/tableData.spec.ts`
Expected: FAIL — "Cannot find module './tableData'".

- [ ] **Step 3: Implementa**

```ts
// packages/ui-kit/src/tableData.ts
/**
 * Logica pura del DataTable (sort, paginazione, label conteggio). Volutamente NON un
 * composable: un solo consumatore oggi (il componente). Estrarre solo al secondo uso reale.
 */
export type SortDir = 'asc' | 'desc';

export type DataTableColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right';
  numeric?: boolean;
  sortable?: boolean;
  sortValue?: (row: Record<string, unknown>) => string | number;
  wrap?: 'wrap' | 'nowrap' | 'truncate';
  maxWidth?: string;
  hideBelow?: 'sm' | 'md' | 'lg';
};

export function sortRows<T>(rows: readonly T[], accessor: (row: T) => unknown, dir: SortDir): T[] {
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((x, y) => {
    const a = accessor(x);
    const b = accessor(y);
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    const c =
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), 'it', { numeric: true, sensitivity: 'base' });
    return sign * c;
  });
}

export function paginate<T>(rows: readonly T[], page: number, pageSize: number): T[] {
  return rows.slice((page - 1) * pageSize, page * pageSize);
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function countLabel(total: number, window?: { page: number; pageSize: number }): string {
  if (!window || total === 0) return `${total} ${total === 1 ? 'riga' : 'righe'}`;
  const start = (window.page - 1) * window.pageSize + 1;
  const end = Math.min(window.page * window.pageSize, total);
  return `${start}–${end} di ${total}`;
}
```

- [ ] **Step 4: Verifica che passi**

Run: `npx vitest run ../../packages/ui-kit/src/tableData.spec.ts`
Expected: PASS (tutti i test).

- [ ] **Step 5: Suite completa + typecheck**

Run da `apps/web-staff`: `npx vitest run` → tutti verdi. Da root: `pnpm typecheck` → pulito.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/tableData.ts packages/ui-kit/src/tableData.spec.ts
git commit -m "feat(ui-kit): funzioni pure tableData (sort, paginazione, countLabel)"
```

---

### Task 2: DataTable — colonne estese e densità

**Files:**
- Modify: `packages/ui-kit/src/components/DataTable.vue` (riscrittura completa, sotto)
- Modify: `packages/ui-kit/src/index.ts` (riesporta `DataTableColumn`)
- Test: `packages/ui-kit/src/components/DataTable.spec.ts` (estensione)

**Interfaces:**
- Consumes: `DataTableColumn` dal Task 1.
- Produces: prop `density?: 'comfortable' | 'compact'` (default `'comfortable'`); colonne con `wrap`/`maxWidth`/`hideBelow`; `numeric` ora implica `whitespace-nowrap`. Le classi cella sono generate da un builder interno che riproduce **esattamente** l'output di `TD`/`TD_FIRST`/`TD_RIGHT`/`TD_NUM` nei casi default (le costanti in `styles/table.ts` restano esportate per i chiamanti a slot, congelate fino a fine migrazione).

**Nota comportamento**: `title` (testo pieno al hover) solo sulle celle `truncate` **default** — se la cella è resa via slot il contenuto è derivato e il `title` è responsabilità del chiamante.

- [ ] **Step 1: Estendi lo spec (deve fallire)** — aggiungi in coda a `DataTable.spec.ts`:

```ts
describe('DataTable — colonne estese e densità', () => {
  const rowsX = [{ id: 'r1', nome: 'Mario', note: 'nota lunga' }];
  const rk = (r: Record<string, unknown>) => r.id as string;

  it('numeric implica whitespace-nowrap', () => {
    const w = mount(DataTable, { props: { columns: [{ key: 'nome', label: 'N', numeric: true }], rows: rowsX, rowKey: rk } });
    expect(w.find('tbody td').classes()).toEqual(expect.arrayContaining(['tabular-nums', 'whitespace-nowrap']));
  });

  it('wrap nowrap / truncate: classi, maxWidth come style, title col testo pieno', () => {
    const w = mount(DataTable, {
      props: {
        columns: [
          { key: 'nome', label: 'N', wrap: 'nowrap' },
          { key: 'note', label: 'Note', wrap: 'truncate', maxWidth: '280px' },
        ],
        rows: rowsX, rowKey: rk,
      },
    });
    const tds = w.findAll('tbody td');
    expect(tds[0].classes()).toContain('whitespace-nowrap');
    expect(tds[1].classes()).toContain('truncate');
    expect(tds[1].attributes('style')).toContain('max-width: 280px');
    expect(tds[1].attributes('title')).toBe('nota lunga');
  });

  it('cella truncate resa via slot: nessun title automatico', () => {
    const w = mount(DataTable, {
      props: { columns: [{ key: 'note', label: 'Note', wrap: 'truncate' }], rows: rowsX, rowKey: rk },
      slots: { 'cell-note': '<template #cell-note="{ row }"><i>{{ row.note }}</i></template>' },
    });
    expect(w.find('tbody td').attributes('title')).toBeUndefined();
  });

  it('hideBelow mappa su classi responsive statiche su th e td', () => {
    const w = mount(DataTable, { props: { columns: [{ key: 'nome', label: 'N', hideBelow: 'md' }], rows: rowsX, rowKey: rk } });
    expect(w.find('th').classes()).toContain('max-md:hidden');
    expect(w.find('tbody td').classes()).toContain('max-md:hidden');
  });

  it('density compact: py-2 al posto di py-3.5 nelle celle', () => {
    const w = mount(DataTable, { props: { columns: [{ key: 'nome', label: 'N' }], rows: rowsX, rowKey: rk, density: 'compact' } });
    expect(w.find('tbody td').classes()).toContain('py-2');
    expect(w.find('tbody td').classes()).not.toContain('py-3.5');
  });
});
```

- [ ] **Step 2: Verifica che fallisca** — `npx vitest run ../../packages/ui-kit/src/components/DataTable.spec.ts` → FAIL sui nuovi test (i 6 esistenti restano verdi).

- [ ] **Step 3: Implementa** — nuovo `DataTable.vue` completo:

```vue
<script setup lang="ts">
import type { DataTableColumn } from '../tableData';

type Row = Record<string, unknown>;

const props = withDefaults(
  defineProps<{
    columns: DataTableColumn[];
    rows?: Row[];
    rowKey?: (row: Row) => string;
    density?: 'comfortable' | 'compact';
  }>(),
  { density: 'comfortable' },
);

const HIDE = { sm: 'max-sm:hidden', md: 'max-md:hidden', lg: 'max-lg:hidden' } as const;

function key(row: Row, idx: number): string {
  return props.rowKey ? props.rowKey(row) : String(idx);
}
// Riproduce esattamente TD/TD_FIRST/TD_RIGHT/TD_NUM (styles/table.ts) nei casi default;
// le costanti restano per i chiamanti a slot fino a fine migrazione (ADR-0033 §3.6).
function cellClass(col: DataTableColumn, isFirst: boolean): string {
  const parts = [
    'border-b border-[var(--color-border-row)]',
    props.density === 'compact' ? 'py-2' : 'py-3.5',
    isFirst || col.align === 'right' ? 'px-[18px]' : 'px-3.5',
  ];
  if (col.align === 'right') parts.push('text-right');
  if (col.numeric) parts.push('tabular-nums', 'whitespace-nowrap');
  if (col.wrap === 'nowrap') parts.push('whitespace-nowrap');
  if (col.wrap === 'truncate') parts.push('truncate');
  if (col.hideBelow) parts.push(HIDE[col.hideBelow]);
  return parts.join(' ');
}
function cellStyle(col: DataTableColumn): Record<string, string> | undefined {
  return col.wrap === 'truncate' && col.maxWidth ? { maxWidth: col.maxWidth } : undefined;
}
function cellTitle(col: DataTableColumn, row: Row): string | undefined {
  return col.wrap === 'truncate' ? String(row[col.key] ?? '') : undefined;
}
</script>
<template>
  <div class="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] [box-shadow:var(--shadow-card)]">
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="bg-[var(--color-raised)]">
            <th
              v-for="c in columns"
              :key="c.key"
              :class="[
                'border-b border-[var(--color-border)] px-[18px] py-3 text-[10.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-text-muted)]',
                c.align === 'right' ? 'text-right' : 'text-left',
                c.hideBelow ? HIDE[c.hideBelow] : '',
              ]"
            >{{ c.label }}</th>
          </tr>
        </thead>
        <tbody v-if="rows">
          <tr v-for="(row, i) in rows" :key="key(row, i)" class="hover:bg-[var(--color-raised)]">
            <td
              v-for="(c, ci) in columns"
              :key="c.key"
              :class="cellClass(c, ci === 0)"
              :style="cellStyle(c)"
              :title="!$slots[`cell-${c.key}`] ? cellTitle(c, row) : undefined"
            >
              <slot :name="`cell-${c.key}`" :row="row">{{ row[c.key] }}</slot>
            </td>
          </tr>
        </tbody>
        <tbody v-else><slot /></tbody>
      </table>
    </div>
  </div>
</template>
```

In `packages/ui-kit/src/index.ts`, sotto l'export del componente (riga 24):

```ts
export type { DataTableColumn } from './tableData';
```

- [ ] **Step 4: Verifica che passi** — `npx vitest run ../../packages/ui-kit/src/components/DataTable.spec.ts` → PASS (vecchi + nuovi).

- [ ] **Step 5: Suite completa + typecheck** — `npx vitest run` (da `apps/web-staff`) tutti verdi; `pnpm typecheck` pulito. Le viste esistenti non cambiano markup: nessuna assertion deve rompersi.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/components/DataTable.vue packages/ui-kit/src/components/DataTable.spec.ts packages/ui-kit/src/index.ts
git commit -m "feat(ui-kit): DataTable - wrap/maxWidth/hideBelow per colonna e densita"
```

---

### Task 3: DataTable — ordinamento

**Files:**
- Modify: `packages/ui-kit/src/components/DataTable.vue`
- Test: `packages/ui-kit/src/components/DataTable.spec.ts` (estensione)

**Interfaces:**
- Consumes: `sortRows`, `SortDir` (Task 1); colonna `sortable`/`sortValue` (Task 1); componente `Icon` (`arrow-up`/`arrow-down`, già nel registry).
- Produces: colonna `sortable: true` → header `<button>`; click cicla asc → desc → nessuno; `aria-sort` sul `th` della colonna attiva; computed interno `sorted` (i Task 4–5 lo consumano al posto di `rows`).

- [ ] **Step 1: Estendi lo spec (deve fallire)**:

```ts
describe('DataTable — ordinamento', () => {
  const sortCols = [{ key: 'nome', label: 'Nome', sortable: true }, { key: 'eta', label: 'Età', numeric: true }];
  const sortRows3 = [
    { id: 'r1', nome: 'Mario', eta: 40 },
    { id: 'r2', nome: 'Anna', eta: 32 },
    { id: 'r3', nome: 'Luca', eta: 28 },
  ];
  const rk = (r: Record<string, unknown>) => r.id as string;
  const names = (w: ReturnType<typeof mount>) => w.findAll('tbody tr').map((tr) => tr.findAll('td')[0].text());

  it('click sull\'header cicla asc → desc → ordine originale, con aria-sort', async () => {
    const w = mount(DataTable, { props: { columns: sortCols, rows: sortRows3, rowKey: rk } });
    const btn = w.find('th button');
    expect(btn.exists()).toBe(true);
    await btn.trigger('click');
    expect(names(w)).toEqual(['Anna', 'Luca', 'Mario']);
    expect(w.find('th').attributes('aria-sort')).toBe('ascending');
    await btn.trigger('click');
    expect(names(w)).toEqual(['Mario', 'Luca', 'Anna']);
    expect(w.find('th').attributes('aria-sort')).toBe('descending');
    await btn.trigger('click');
    expect(names(w)).toEqual(['Mario', 'Anna', 'Luca']);
    expect(w.find('th').attributes('aria-sort')).toBeUndefined();
  });

  it('sortValue accessor usato al posto di row[key]', async () => {
    const cols = [{ key: 'nome', label: 'Nome', sortable: true, sortValue: (r: Record<string, unknown>) => r.eta as number }];
    const w = mount(DataTable, { props: { columns: cols, rows: sortRows3, rowKey: rk } });
    await w.find('th button').trigger('click');
    expect(names(w)).toEqual(['Luca', 'Anna', 'Mario']); // per età: 28, 32, 40
  });

  it('header non sortable: nessun button', () => {
    const w = mount(DataTable, { props: { columns: sortCols, rows: sortRows3, rowKey: rk } });
    expect(w.findAll('th')[1].find('button').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Verifica che fallisca** — FAIL sui 3 nuovi test.

- [ ] **Step 3: Implementa** — nello `<script setup>` sostituisci l'import del tipo e aggiungi stato/logica sort:

```ts
import { computed, ref } from 'vue';
import { sortRows, type DataTableColumn, type SortDir } from '../tableData';
import Icon from './Icon.vue';
```

```ts
// --- ordinamento (client-side, si applica prima della paginazione) ---
const sortKey = ref<string | null>(null);
const sortDir = ref<SortDir>('asc');
function toggleSort(col: DataTableColumn): void {
  if (sortKey.value !== col.key) { sortKey.value = col.key; sortDir.value = 'asc'; return; }
  if (sortDir.value === 'asc') { sortDir.value = 'desc'; return; }
  sortKey.value = null; sortDir.value = 'asc';
}
function ariaSort(col: DataTableColumn): 'ascending' | 'descending' | undefined {
  if (!col.sortable || sortKey.value !== col.key) return undefined;
  return sortDir.value === 'asc' ? 'ascending' : 'descending';
}
const sorted = computed<Row[]>(() => {
  const base = props.rows ?? [];
  const col = props.columns.find((c) => c.key === sortKey.value);
  if (!col) return base;
  const accessor = col.sortValue ?? ((r: Row) => r[col.key] as string | number);
  return sortRows(base, accessor, sortDir.value);
});
```

Nel template: aggiungi `:aria-sort="ariaSort(c)"` al `th`; il contenuto del `th` diventa:

```vue
<button
  v-if="c.sortable"
  type="button"
  class="group inline-flex items-center gap-1 rounded uppercase transition-colors [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
  @click="toggleSort(c)"
>
  {{ c.label }}
  <Icon
    :name="sortKey === c.key && sortDir === 'desc' ? 'arrow-down' : 'arrow-up'"
    :size="14"
    :class="sortKey === c.key ? 'text-[var(--color-accent)]' : 'opacity-0 transition-opacity group-hover:opacity-40'"
  />
</button>
<template v-else>{{ c.label }}</template>
```

e il `v-for` delle righe itera su `sorted` invece che su `rows` (`<tr v-for="(row, i) in sorted" …>`; il `v-if="rows"` del tbody resta su `rows`).

Nota Tailwind preflight: il `button` azzera `text-transform` → serve `uppercase` esplicito sul button; size/peso/colore/tracking si ereditano dal `th`.

- [ ] **Step 4: Verifica che passi** — PASS tutti.

- [ ] **Step 5: Suite completa + typecheck** — tutti verdi, pulito.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/components/DataTable.vue packages/ui-kit/src/components/DataTable.spec.ts
git commit -m "feat(ui-kit): DataTable - ordinamento client-side con aria-sort"
```

---

### Task 4: DataTable — paginazione e footer

**Files:**
- Modify: `packages/ui-kit/src/components/DataTable.vue`
- Test: `packages/ui-kit/src/components/DataTable.spec.ts` (estensione)

**Interfaces:**
- Consumes: `paginate`, `pageCount`, `countLabel` (Task 1); `sorted` (Task 3); `IconButton` (`chevron-left`/`chevron-right`, già nel registry).
- Produces: prop `pageSize?: number` (opt-in), `showCount?: boolean` (default false), `v-model:page` opzionale via `defineModel` (default interno 1); computed `visible` (il tbody itera su questo); footer `data-test="table-footer"` con `data-test="table-count"`, `page-prev`, `page-next`, `page-indicator`. Reset a pagina 1 quando cambia l'identità di `rows`. Footer solo con `rows` definite e almeno 1 riga.

- [ ] **Step 1: Estendi lo spec (deve fallire)**:

```ts
describe('DataTable — paginazione e footer', () => {
  const cols1 = [{ key: 'n', label: 'N' }];
  const rows30 = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, n: `riga-${i}` }));
  const rk = (r: Record<string, unknown>) => r.id as string;

  it('pageSize: rende solo la finestra corrente, footer con range e pager', async () => {
    const w = mount(DataTable, { props: { columns: cols1, rows: rows30, rowKey: rk, pageSize: 20 } });
    expect(w.findAll('tbody tr')).toHaveLength(20);
    expect(w.get('[data-test="table-count"]').text()).toBe('1–20 di 30');
    expect(w.get('[data-test="page-prev"]').attributes('disabled')).toBeDefined();
    await w.get('[data-test="page-next"]').trigger('click');
    expect(w.findAll('tbody tr')).toHaveLength(10);
    expect(w.get('[data-test="table-count"]').text()).toBe('21–30 di 30');
    expect(w.get('[data-test="page-next"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-test="page-indicator"]').text()).toBe('2 / 2');
  });

  it('v-model:page controllato dall\'esterno', async () => {
    const w = mount(DataTable, { props: { columns: cols1, rows: rows30, rowKey: rk, pageSize: 20, page: 2 } });
    expect(w.get('[data-test="table-count"]').text()).toBe('21–30 di 30');
    await w.get('[data-test="page-prev"]').trigger('click');
    expect(w.emitted('update:page')?.at(-1)).toEqual([1]);
  });

  it('cambio rows → reset a pagina 1', async () => {
    const w = mount(DataTable, { props: { columns: cols1, rows: rows30, rowKey: rk, pageSize: 20 } });
    await w.get('[data-test="page-next"]').trigger('click');
    await w.setProps({ rows: rows30.slice(0, 5) });
    expect(w.get('[data-test="table-count"]').text()).toBe('1–5 di 5');
  });

  it('showCount senza pageSize: solo conteggio, niente pager', () => {
    const w = mount(DataTable, { props: { columns: cols1, rows: rows30.slice(0, 3), rowKey: rk, showCount: true } });
    expect(w.get('[data-test="table-count"]').text()).toBe('3 righe');
    expect(w.find('[data-test="page-next"]').exists()).toBe(false);
  });

  it('senza pageSize né showCount (e in API a slot): nessun footer', () => {
    expect(mount(DataTable, { props: { columns: cols1, rows: rows30, rowKey: rk } }).find('[data-test="table-footer"]').exists()).toBe(false);
    expect(mount(DataTable, { props: { columns: cols1, showCount: true } }).find('[data-test="table-footer"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Verifica che fallisca.**

- [ ] **Step 3: Implementa** — script: estendi import (`watch` da vue; `paginate`, `pageCount`, `countLabel` da `../tableData`; `IconButton` da `./IconButton.vue`), aggiungi le prop `pageSize?: number; showCount?: boolean` (default `showCount: false`) e:

```ts
const page = defineModel<number>('page', { default: 1 });

// --- paginazione (client-side; v-model:page opzionale con fallback interno) ---
const totalPages = computed(() => (props.pageSize ? pageCount(sorted.value.length, props.pageSize) : 1));
const visible = computed<Row[]>(() => (props.pageSize ? paginate(sorted.value, page.value, props.pageSize) : sorted.value));
watch(() => props.rows, () => { page.value = 1; });

const footerVisible = computed(() => !!props.rows && sorted.value.length > 0 && (!!props.pageSize || props.showCount));
const footerLabel = computed(() =>
  countLabel(sorted.value.length, props.pageSize ? { page: page.value, pageSize: props.pageSize } : undefined),
);
```

Template: il `v-for` delle righe passa da `sorted` a `visible`; dopo la chiusura del div `overflow-x-auto`, prima della chiusura della card:

```vue
<div v-if="footerVisible" data-test="table-footer" class="flex items-center justify-between bg-[var(--color-raised)] px-[18px] py-2">
  <span data-test="table-count" class="text-[12.5px] tabular-nums text-[var(--color-text-muted)]">{{ footerLabel }}</span>
  <div v-if="pageSize && totalPages > 1" class="flex items-center gap-1.5">
    <IconButton icon="chevron-left" label="Pagina precedente" size="sm" :disabled="page <= 1" data-test="page-prev" @click="page = page - 1" />
    <span data-test="page-indicator" class="text-[12.5px] tabular-nums text-[var(--color-text-muted)]">{{ page }} / {{ totalPages }}</span>
    <IconButton icon="chevron-right" label="Pagina successiva" size="sm" :disabled="page >= totalPages" data-test="page-next" @click="page = page + 1" />
  </div>
</div>
```

Niente `border-t` sul footer: il `border-b` dell'ultima riga fa già da separatore (evita la doppia linea).

- [ ] **Step 4: Verifica che passi.**
- [ ] **Step 5: Suite completa + typecheck.**
- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/components/DataTable.vue packages/ui-kit/src/components/DataTable.spec.ts
git commit -m "feat(ui-kit): DataTable - paginazione client-side controlled-capable e footer conteggio"
```

---

### Task 5: DataTable — righe interattive e stati

**Files:**
- Modify: `packages/ui-kit/src/components/DataTable.vue`
- Test: `packages/ui-kit/src/components/DataTable.spec.ts` (estensione)

**Interfaces:**
- Consumes: `EmptyState` (prop `message`); `visible` (Task 4).
- Produces: emit `row-click(row)` (cursor-pointer solo se il listener esiste); prop `rowClass?: (row) => string`; prop `emptyMessage?: string` (con `rows` a lunghezza 0 rende `EmptyState` in un `td` colspan; footer resta nascosto — già garantito dal Task 4); prop `maxHeight?: string` (scroll-y interno + `thead th` sticky con bg proprio).

- [ ] **Step 1: Estendi lo spec (deve fallire)**:

```ts
describe('DataTable — righe interattive e stati', () => {
  const cols1 = [{ key: 'n', label: 'N' }];
  const rows2 = [{ id: 'r1', n: 'uno' }, { id: 'r2', n: 'due' }];
  const rk = (r: Record<string, unknown>) => r.id as string;

  it('row-click: emesso al click, cursor-pointer solo con listener', async () => {
    const w = mount(DataTable, {
      props: { columns: cols1, rows: rows2, rowKey: rk, 'onRow-click': () => {} },
    });
    expect(w.find('tbody tr').classes()).toContain('cursor-pointer');
    await w.find('tbody tr').trigger('click');
    expect(w.emitted('row-click')?.[0]).toEqual([rows2[0]]);
    const w2 = mount(DataTable, { props: { columns: cols1, rows: rows2, rowKey: rk } });
    expect(w2.find('tbody tr').classes()).not.toContain('cursor-pointer');
  });

  it('rowClass applica classi per riga', () => {
    const w = mount(DataTable, { props: { columns: cols1, rows: rows2, rowKey: rk, rowClass: (r) => (r.n === 'due' ? 'opacity-60' : '') } });
    const trs = w.findAll('tbody tr');
    expect(trs[0].classes()).not.toContain('opacity-60');
    expect(trs[1].classes()).toContain('opacity-60');
  });

  it('emptyMessage: EmptyState dentro la card con 0 righe, footer nascosto', () => {
    const w = mount(DataTable, { props: { columns: cols1, rows: [], rowKey: rk, pageSize: 20, emptyMessage: 'Nessun elemento' } });
    expect(w.get('[data-test="empty-state"]').text()).toContain('Nessun elemento');
    expect(w.find('[data-test="table-footer"]').exists()).toBe(false);
  });

  it('maxHeight: scroll interno e thead sticky', () => {
    const w = mount(DataTable, { props: { columns: cols1, rows: rows2, rowKey: rk, maxHeight: '400px' } });
    const scroller = w.find('div.overflow-x-auto');
    expect(scroller.classes()).toContain('overflow-y-auto');
    expect(scroller.attributes('style')).toContain('max-height: 400px');
    expect(w.find('th').classes()).toEqual(expect.arrayContaining(['sticky', 'top-0']));
  });
});
```

- [ ] **Step 2: Verifica che fallisca.**

- [ ] **Step 3: Implementa** — script: aggiungi `getCurrentInstance` all'import da vue, `EmptyState` da `./EmptyState.vue`, le prop `emptyMessage?: string; maxHeight?: string; rowClass?: (row: Row) => string`, e:

```ts
const emit = defineEmits<{ 'row-click': [row: Row] }>();
// Rilevato una volta al setup: con listener la riga diventa cliccabile (cursor + emit).
const hasRowClick = !!getCurrentInstance()?.vnode.props?.['onRow-click'] || !!getCurrentInstance()?.vnode.props?.onRowClick;

function rowClasses(row: Row): string {
  const parts = ['hover:bg-[var(--color-raised)]'];
  if (hasRowClick) parts.push('cursor-pointer');
  if (props.rowClass) {
    const extra = props.rowClass(row);
    if (extra) parts.push(extra);
  }
  return parts.join(' ');
}
```

Template — scroller e thead:

```vue
<div class="overflow-x-auto" :class="maxHeight ? 'overflow-y-auto' : ''" :style="maxHeight ? { maxHeight } : undefined">
```

sul `th`, in coda all'array di classi: `maxHeight ? 'sticky top-0 z-[1] bg-[var(--color-raised)]' : ''` (il bg sul `th` serve: quello della `tr` non "viaggia" con lo sticky).

Tbody — tre rami:

```vue
<tbody v-if="rows && rows.length === 0 && emptyMessage">
  <tr><td :colspan="columns.length" class="p-4"><EmptyState :message="emptyMessage" /></td></tr>
</tbody>
<tbody v-else-if="rows">
  <tr v-for="(row, i) in visible" :key="key(row, i)" :class="rowClasses(row)" @click="hasRowClick && emit('row-click', row)">
    <td
      v-for="(c, ci) in columns"
      :key="c.key"
      :class="cellClass(c, ci === 0)"
      :style="cellStyle(c)"
      :title="!$slots[`cell-${c.key}`] ? cellTitle(c, row) : undefined"
    >
      <slot :name="`cell-${c.key}`" :row="row">{{ row[c.key] }}</slot>
    </td>
  </tr>
</tbody>
<tbody v-else><slot /></tbody>
```

- [ ] **Step 4: Verifica che passi.**
- [ ] **Step 5: Suite completa + typecheck.**
- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/components/DataTable.vue packages/ui-kit/src/components/DataTable.spec.ts
git commit -m "feat(ui-kit): DataTable - row-click, rowClass, emptyMessage, sticky header con maxHeight"
```

---

### Task 6: Migrazione CustomersView alla API data-driven

**Files:**
- Modify: `apps/web-staff/src/features/customers/CustomersView.vue`
- Test: esistente `apps/web-staff/src/features/customers/CustomersView.spec.ts` (safety net; nessun nuovo test di vista — il comportamento nuovo è coperto dagli unit del componente, la config della vista è dichiarativa)

**Interfaces:**
- Consumes: tutta l'API dei Task 2–5; `DataTableColumn` da `@coralyn/ui-kit`; `CustomerDTO` da `@coralyn/contracts`.
- Produces: niente per i task successivi.

**Questo è un refactor sotto test esistenti**: la struttura `tbody tr` resta, i contenuti pure — gli spec correnti devono rimanere verdi senza modifiche.

- [ ] **Step 1: Suite verde di partenza** — `npx vitest run` → 100% verdi (baseline del refactor).

- [ ] **Step 2: Migra la vista.** Nello script: aggiungi `import type { CustomerDTO } from '@coralyn/contracts';`, aggiungi `DataTable` resta e rimuovi `EmptyState` dall'import ui-kit (non più usato); tipizza e sostituisci `cols`:

```ts
import { DataTable, /* …resto invariato senza EmptyState… */ } from '@coralyn/ui-kit';
import type { DataTableColumn } from '@coralyn/ui-kit';

const cols: DataTableColumn[] = [
  {
    key: 'customer', label: 'Cliente', sortable: true,
    sortValue: (r) => `${(r as unknown as CustomerDTO).lastName} ${(r as unknown as CustomerDTO).firstName}`.toLowerCase(),
  },
  { key: 'phone', label: 'Telefono', numeric: true },
  { key: 'email', label: 'Email', wrap: 'truncate', maxWidth: '220px', hideBelow: 'md' },
  { key: 'notes', label: 'Note', wrap: 'truncate', maxWidth: '280px', hideBelow: 'lg' },
];
```

Nel template, sostituisci il blocco `<p v-if="isLoading">` / `EmptyState` / `DataTable` a slot con:

```vue
<p v-if="isLoading" class="text-[var(--color-text-muted)]">Caricamento…</p>
<DataTable
  v-else
  :columns="cols"
  :rows="(filtered as unknown as Record<string, unknown>[])"
  :row-key="(r) => (r as unknown as CustomerDTO).id"
  :page-size="25"
  empty-message="Nessun cliente trovato"
  @row-click="(r) => router.push({ name: 'customer-detail', params: { id: (r as unknown as CustomerDTO).id } })"
>
  <template #cell-customer="{ row }">
    <div class="flex items-center gap-2.5">
      <Avatar :initials="ini(row as unknown as CustomerDTO)" size="sm" />
      <RouterLink
        :to="{ name: 'customer-detail', params: { id: (row as unknown as CustomerDTO).id } }"
        class="font-semibold text-[var(--color-text)] hover:text-[var(--color-brand-ink)]"
        @click.stop
      >{{ (row as unknown as CustomerDTO).firstName }} {{ (row as unknown as CustomerDTO).lastName }}</RouterLink>
    </div>
  </template>
  <template #cell-phone="{ row }"><span class="tabular-nums text-[var(--color-text-2nd)]">{{ (row as unknown as CustomerDTO).phone ?? '—' }}</span></template>
  <template #cell-email="{ row }"><span class="text-[var(--color-text-2nd)]">{{ (row as unknown as CustomerDTO).email ?? '—' }}</span></template>
  <template #cell-notes="{ row }"><span class="text-[var(--color-text-muted)]" :title="(row as unknown as CustomerDTO).notes ?? ''">{{ (row as unknown as CustomerDTO).notes ?? '' }}</span></template>
</DataTable>
```

Note dichiarate: (a) l'EmptyState «Nessun cliente trovato» ora appare **dentro** la card della tabella (prima era standalone) — scelta di design della spec §3.2; (b) telefono guadagna `whitespace-nowrap` via `numeric` (niente numeri spezzati); (c) il `title` delle Note vive sullo span dello slot (contenuto derivato, responsabilità del chiamante).

- [ ] **Step 3: Suite completa + typecheck** — tutti verdi (se uno spec di vista legge markup rimosso, adattalo mantenendo l'intento del test), typecheck pulito.

- [ ] **Step 4: Commit**

```bash
git add apps/web-staff/src/features/customers/CustomersView.vue
git commit -m "refactor(web-staff): CustomersView su DataTable data-driven (sort, paginazione, row-click)"
```

---

### Task 7: Migrazione RentalsView

**Files:**
- Modify: `apps/web-staff/src/features/rentals/RentalsView.vue`
- Test: esistente `RentalsView.spec.ts` (safety net, come Task 6)

**Interfaces:** Consumes: API Task 2–5; `RentalDTO` già importato nella vista.

- [ ] **Step 1: Suite verde di partenza** — `npx vitest run` → verdi.

- [ ] **Step 2: Migra.** `cols` diventa (`import type { DataTableColumn } from '@coralyn/ui-kit';`):

```ts
const cols: DataTableColumn[] = [
  { key: 'articolo', label: 'Articolo' },
  { key: 'tariffa', label: 'Tariffa' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'unita', label: 'Unità', numeric: true, align: 'right' },
  { key: 'stato', label: 'Stato' },
  { key: 'incasso', label: 'Incasso', align: 'right' },
  { key: 'azioni', label: '', align: 'right' },
];
```

Il blocco `<DataTable v-if="rentals.length">…</DataTable><EmptyState v-else …/>` diventa (rimuovi `EmptyState` dall'import se non più usato altrove nella vista):

```vue
<DataTable
  :columns="cols"
  :rows="(rentals as unknown as Record<string, unknown>[])"
  :row-key="(r) => (r as unknown as RentalDTO).id"
  empty-message="Nessun noleggio per questa data."
>
  <template #cell-articolo="{ row }"><span class="font-semibold text-[var(--color-text)]">{{ (row as unknown as RentalDTO).rentalItemName }}</span></template>
  <template #cell-tariffa="{ row }"><span class="text-[var(--color-text-2nd)]">{{ (row as unknown as RentalDTO).tariffLabel }}</span></template>
  <template #cell-cliente="{ row }"><span class="text-[var(--color-text-2nd)]">{{ (row as unknown as RentalDTO).customerName ?? '—' }}</span></template>
  <template #cell-unita="{ row }"><span class="text-[var(--color-text-2nd)]">{{ (row as unknown as RentalDTO).units }}</span></template>
  <template #cell-stato="{ row }">
    <Badge :tone="RENTAL_STATUS_TONE[(row as unknown as RentalDTO).status]">{{ RENTAL_STATUS_LABEL[(row as unknown as RentalDTO).status] }}</Badge>
  </template>
  <template #cell-incasso="{ row }">
    <button
      type="button"
      class="font-semibold tabular-nums text-[var(--color-text)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      :data-test="`settle-${(row as unknown as RentalDTO).id}`"
      :disabled="(row as unknown as RentalDTO).status === 'cancelled'"
      @click="openSettle(row as unknown as RentalDTO)"
    >{{ formatEuro((row as unknown as RentalDTO).amountCollected) }} / {{ formatEuro((row as unknown as RentalDTO).totalPrice) }}</button>
  </template>
  <template #cell-azioni="{ row }">
    <ActionBar gap="sm" align="end">
      <Button v-if="(row as unknown as RentalDTO).status === 'active'" variant="secondary" size="sm" :data-test="`return-${(row as unknown as RentalDTO).id}`" @click="returnRental.mutate((row as unknown as RentalDTO).id)">Rientro</Button>
      <Button v-if="(row as unknown as RentalDTO).status === 'active'" variant="danger" size="sm" :data-test="`cancel-${(row as unknown as RentalDTO).id}`" @click="askCancel(row as unknown as RentalDTO)">Annulla</Button>
    </ActionBar>
  </template>
</DataTable>
```

Note dichiarate: l'header «Unità» diventa allineato a destra come le sue celle (prima era incoerente: header a sinistra, celle a destra); le celle Unità/Incasso passano da `px-3.5` a `px-[18px]` (armonizzazione con `TD_RIGHT`, delta 4.5px).

- [ ] **Step 3: Suite completa + typecheck** — verdi/pulito (adatta eventuali assertion sul markup rimosso mantenendo l'intento).

- [ ] **Step 4: Commit**

```bash
git add apps/web-staff/src/features/rentals/RentalsView.vue
git commit -m "refactor(web-staff): RentalsView su DataTable data-driven"
```

---

### Task 8: Migrazione PricingView (tabella tariffe)

**Files:**
- Modify: `apps/web-staff/src/features/pricing/PricingView.vue` (righe ~384-391 `rateCols` e ~539-558 tabella)
- Test: esistente `PricingView.spec.ts` (safety net)

**Interfaces:** Consumes: API Task 2–5. L'ordinamento resta quello di dominio (`sortedRates`, per specificità) — **niente** `sortable` qui.

- [ ] **Step 1: Suite verde di partenza.**

- [ ] **Step 2: Migra.** In `rateCols` aggiungi `align: 'right'` alla colonna `actions` e tipizza `const rateCols: DataTableColumn[] = […]` (import type da `@coralyn/ui-kit`). Il blocco tabella diventa:

```vue
<DataTable :columns="rateCols" :rows="(sortedRates as unknown as Record<string, unknown>[])" :row-key="(r) => (r as unknown as { id: string }).id">
  <template #cell-position="{ row }"><span class="font-semibold text-[var(--color-text)]">{{ positionLabel(row as never) }}</span></template>
  <template #cell-package="{ row }"><span class="text-[var(--color-text-2nd)]">{{ pkgName((row as never as { packageId?: string }).packageId) }}</span></template>
  <template #cell-slot="{ row }"><span class="text-[var(--color-text-2nd)]">{{ slotName((row as never as { timeSlotId?: string }).timeSlotId) }}</span></template>
  <template #cell-type="{ row }"><span class="text-[var(--color-text-2nd)]">{{ typeLabel((row as never as { type: string }).type as never) }}</span></template>
  <template #cell-price="{ row }">
    <span class="font-bold tabular-nums text-[var(--color-text)]">{{ formatEuro((row as never as { price: number }).price) }}</span>
    <span class="ml-1 text-[11px] text-[var(--color-text-muted)]">{{ priceHint(row as never) }}</span>
  </template>
  <template #cell-actions="{ row }">
    <ActionBar gap="sm">
      <IconButton icon="edit" label="Modifica" variant="ghost" size="sm" :data-test="`edit-rate-${(row as never as { id: string }).id}`" @click="openEditRate(row as never)" />
      <IconButton icon="trash-2" label="Elimina" variant="danger" size="sm" :data-test="`del-rate-${(row as never as { id: string }).id}`" @click="askDeleteRate((row as never as { id: string }).id)" />
    </ActionBar>
  </template>
</DataTable>
```

**Nota sul casting**: usa il tipo DTO reale delle tariffe già presente nella vista (guarda il tipo di `sortedRates` nello script — probabilmente `RateDTO` o simile da contracts) al posto dei cast strutturali `never as {…}` mostrati qui come fallback: il pattern giusto è quello di BookingsView (`row as unknown as XxxDTO`). L'EmptyState esterno condizionato su `activeSeasonId` **resta fuori** (condizione diversa da «0 righe»: senza stagione selezionata il messaggio non deve apparire) — niente `emptyMessage` qui.

Nota dichiarata: la cella Prezzo passa da `px-3.5` a `px-[18px]` (armonizzazione `align: 'right'`).

- [ ] **Step 3: Suite completa + typecheck** — verdi/pulito.

- [ ] **Step 4: Commit**

```bash
git add apps/web-staff/src/features/pricing/PricingView.vue
git commit -m "refactor(web-staff): tabella tariffe PricingView su DataTable data-driven"
```

---

### Task 9: Migrazione RentalCatalogView (2 tabelle)

**Files:**
- Modify: `apps/web-staff/src/features/rentals/RentalCatalogView.vue` (righe ~105-110 `tariffCols`, ~267-281 tabella attive, ~292-306 tabella archiviate)
- Test: esistente `RentalCatalogView.spec.ts` (safety net)

**Interfaces:** Consumes: API Task 2–5, in particolare `rowClass` (Task 5).

- [ ] **Step 1: Suite verde di partenza.**

- [ ] **Step 2: Migra entrambe le tabelle.** `tariffCols` tipizzato `DataTableColumn[]` con `align: 'right'` su `actions`. Usa il tipo DTO reale delle tariffe già in uso nella vista (stesso pattern `row as unknown as XxxDTO` di BookingsView). Tabella attive:

```vue
<DataTable :columns="tariffCols" :rows="(activeTariffs as unknown as Record<string, unknown>[])" :row-key="(r) => (r as unknown as { id: string }).id">
  <template #cell-label="{ row }"><span class="font-semibold text-[var(--color-text)]">{{ (row as unknown as { label: string }).label }}</span></template>
  <template #cell-duration="{ row }"><span class="text-[var(--color-text-2nd)]">{{ durationLabel((row as unknown as { durationMinutes: number | null }).durationMinutes) }}</span></template>
  <template #cell-price="{ row }"><span class="font-bold tabular-nums text-[var(--color-text)]">{{ formatEuro((row as unknown as { price: number }).price) }}</span></template>
  <template #cell-actions="{ row }">
    <ActionBar gap="sm">
      <IconButton icon="edit" label="Modifica" variant="ghost" size="sm" :data-test="`edit-tariff-${(row as unknown as { id: string }).id}`" @click="openEditTariff(row as never)" />
      <IconButton icon="archive" label="Archivia" variant="ghost" size="sm" :data-test="`archive-tariff-${(row as unknown as { id: string }).id}`" @click="archiveTariff.mutate((row as unknown as { id: string }).id)" />
    </ActionBar>
  </template>
</DataTable>
```

Tabella archiviate: identica struttura (stessi `tariffCols`), con `:row-class="() => 'opacity-60'"` sul `DataTable` e le azioni `renew`/`trash-2` (`restore-tariff-*`/`del-tariff-*`) come nel markup attuale (righe 297-304 della vista).

Nota dichiarata: le righe archiviate acquisiscono l'hover standard della riga data-driven (prima non lo avevano) — innocuo; e la cella Prezzo passa a `px-[18px]` come nel Task 8.

- [ ] **Step 3: Suite completa + typecheck** — verdi/pulito.

- [ ] **Step 4: Commit**

```bash
git add apps/web-staff/src/features/rentals/RentalCatalogView.vue
git commit -m "refactor(web-staff): tabelle tariffe RentalCatalogView su DataTable data-driven (rowClass per archiviate)"
```

---

### Task 10: Opt-in nelle viste data-driven, design-system §10, verifica finale

**Files:**
- Modify: `apps/web-staff/src/features/bookings/BookingsView.vue` (solo `cols`)
- Modify: `apps/web-staff/src/features/customers/CustomerPaymentsCard.vue` (prop `density`)
- Modify: `docs/design/design-system.md` (§10, voce DataTable)

**Interfaces:** Consumes: API Task 2–5. RenewalsView resta invariata (colonne già adeguate, liste brevi — YAGNI).

- [ ] **Step 1: BookingsView — policy colonne.** `cols` diventa (tipizzato `DataTableColumn[]`, import type da `@coralyn/ui-kit`):

```ts
const cols: DataTableColumn[] = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'ombrellone', label: 'Ombrellone', numeric: true },
  { key: 'tipo', label: 'Tipo', hideBelow: 'md' },
  { key: 'pacchetto', label: 'Pacchetto', hideBelow: 'lg', wrap: 'truncate', maxWidth: '180px' },
  { key: 'periodo', label: 'Periodo', numeric: true },
  { key: 'stato', label: 'Stato' },
  { key: 'incasso', label: 'Incasso', align: 'right' },
];
```

(niente paginazione: lista day-scoped, decisione della spec §5).

- [ ] **Step 2: CustomerPaymentsCard — densità.** Sul `DataTable` della card aggiungi `density="compact"` (contesto denso nel dettaglio cliente, spec §5).

- [ ] **Step 3: design-system.md §10 — riscrivi la voce DataTable** sostituendo il testo attuale (righe ~358-365) con la descrizione delle due API e delle nuove capacità: colonne (`sortable`/`sortValue`, `wrap`/`maxWidth`+`title`, `hideBelow` → classi statiche, `numeric` = `tabular-nums`+`nowrap`), `pageSize` + `v-model:page` (client-side, controlled-capable), footer conteggio/pager (`--color-raised`, 12.5px muted, `tabular-nums`), `density`, `emptyMessage` (EmptyState in-card), `maxHeight` (scroll interno + sticky thead — motivare il vincolo), `row-click`/`rowClass`, ordinamento con `aria-sort` e indicatore `--color-accent`; API a slot mantenuta ma congelata (niente feature nuove), costanti `TD*` in `styles/table.ts` deprecate a fine migrazione. Cita la spec `docs/superpowers/specs/2026-07-21-datatable-qol-design.md`.

- [ ] **Step 4: Verifica finale completa** — `npx vitest run` (tutti verdi) + `pnpm typecheck` (pulito). Annota il nuovo numero di test della suite (baseline: era 451).

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/bookings/BookingsView.vue apps/web-staff/src/features/customers/CustomerPaymentsCard.vue docs/design/design-system.md
git commit -m "feat(web-staff): opt-in colonne responsive/densita e design-system aggiornato per DataTable"
```

---

## Post-piano (fuori dai task, da segnalare all'utente)

1. **Prova visiva in browser** (login gate → insieme all'utente): Clienti (sort, paginazione, truncate Note, hideBelow a 375/768), Prenotazioni (7 colonne a 375px), tariffe Pricing/Catalogo, footer e indicatori in dark. Accodabile alla prova visiva pendente della mappa.
2. **Rimozione costanti `TD*`**: a migrazione completata verificare con grep che nessun file usi più `TD`/`TD_FIRST`/`TD_RIGHT`/`TD_NUM` e, in un task separato, rimuovere costanti + `table.spec.ts` aggiornando `styles/table.ts` (sono export pubblici ui-kit).
3. **Skeleton di caricamento**: feature futura per scelta esplicita dell'utente (non in questo piano).
