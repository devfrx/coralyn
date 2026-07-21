<script setup lang="ts">
import { computed, ref, watch, getCurrentInstance } from 'vue';
import { sortRows, type DataTableColumn, type SortDir, paginate, pageCount, countLabel } from '../tableData';
import Icon from './Icon.vue';
import IconButton from './IconButton.vue';
import EmptyState from './EmptyState.vue';
import Skeleton from './Skeleton.vue';
import { useDelayedLoading } from '../useDelayedLoading';

type Row = Record<string, unknown>;

const props = withDefaults(
  defineProps<{
    columns: DataTableColumn[];
    rows?: Row[];
    rowKey?: (row: Row) => string;
    density?: 'comfortable' | 'compact';
    pageSize?: number;
    showCount?: boolean;
    emptyMessage?: string;
    maxHeight?: string;
    rowClass?: (row: Row) => string;
    loading?: boolean;
    skeletonRows?: number;
  }>(),
  { density: 'comfortable', showCount: false, loading: false, skeletonRows: 5 },
);

const page = defineModel<number>('page', { default: 1 });

const emit = defineEmits<{ 'row-click': [row: Row] }>();

// Rilevato una volta al setup: con listener la riga diventa cliccabile (cursor + emit).
const hasRowClick = !!getCurrentInstance()?.vnode.props?.['onRow-click'] || !!getCurrentInstance()?.vnode.props?.onRowClick;

// --- ordinamento (client-side, si applica prima della paginazione) ---
const sortKey = ref<string | null>(null);
const sortDir = ref<SortDir>('asc');
function toggleSort(col: DataTableColumn): void {
  page.value = 1;
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

// --- paginazione (client-side; v-model:page opzionale con fallback interno) ---
const totalPages = computed(() => (props.pageSize ? pageCount(sorted.value.length, props.pageSize) : 1));
const visible = computed<Row[]>(() => (props.pageSize ? paginate(sorted.value, page.value, props.pageSize) : sorted.value));
watch(() => props.rows, () => { page.value = 1; });

const footerLabel = computed(() =>
  countLabel(sorted.value.length, props.pageSize ? { page: page.value, pageSize: props.pageSize } : undefined),
);

// --- skeleton di caricamento (spec 2026-07-21-loading-states §4.1) ---
// Gate interno: il chiamante passa isLoading grezzo. Input del gate = loading E 0 righe:
// un refetch con dati stantii visibili non attiva mai lo skeleton (mai sopra dati reali).
const skeletonBusy = useDelayedLoading(() => !!props.loading && (props.rows?.length ?? 0) === 0);
const SKELETON_WIDTHS = ['70%', '85%', '60%', '75%', '90%'] as const;
function skeletonWidth(r: number, c: number): string {
  return SKELETON_WIDTHS[(r + c) % SKELETON_WIDTHS.length];
}

const footerVisible = computed(() => !skeletonBusy.value && !!props.rows && sorted.value.length > 0 && (!!props.pageSize || props.showCount));

const HIDE = { sm: 'max-sm:hidden', md: 'max-md:hidden', lg: 'max-lg:hidden' } as const;

function key(row: Row, idx: number): string {
  return props.rowKey ? props.rowKey(row) : String(idx);
}
// Unica fonte delle classi cella standard (ex costanti TD* di ADR-0033 §3.6, rimosse
// a migrazione completata); numeric aggiunge whitespace-nowrap (spec §3.1).
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

function rowClasses(row: Row): string {
  const parts = ['hover:bg-[var(--color-raised)]'];
  if (hasRowClick) parts.push('cursor-pointer');
  if (props.rowClass) {
    const extra = props.rowClass(row);
    if (extra) parts.push(extra);
  }
  return parts.join(' ');
}
</script>
<template>
  <div
    class="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] [box-shadow:var(--shadow-card)]"
    :aria-busy="skeletonBusy ? 'true' : undefined"
  >
    <div class="overflow-x-auto" :class="maxHeight ? 'overflow-y-auto' : ''" :style="maxHeight ? { maxHeight } : undefined">
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="bg-[var(--color-raised)]">
            <th
              v-for="c in columns"
              :key="c.key"
              :aria-sort="ariaSort(c)"
              :class="[
                'border-b border-[var(--color-border)] px-[18px] py-3 text-[10.5px] font-semibold uppercase tracking-caps text-[var(--color-text-muted)]',
                c.align === 'right' ? 'text-right' : 'text-left',
                c.hideBelow ? HIDE[c.hideBelow] : '',
                maxHeight ? 'sticky top-0 z-[1] bg-[var(--color-raised)]' : '',
              ]"
            >
              <button
                v-if="c.sortable"
                type="button"
                :class="[
                  'group flex w-full items-center gap-1 rounded uppercase transition-colors [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]',
                  c.align === 'right' ? 'justify-end' : 'justify-start',
                ]"
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
            </th>
          </tr>
        </thead>
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
      </table>
    </div>
    <div v-if="footerVisible" data-test="table-footer" class="flex items-center justify-between bg-[var(--color-raised)] px-[18px] py-2">
      <span data-test="table-count" class="text-[12.5px] tabular-nums text-[var(--color-text-muted)]">{{ footerLabel }}</span>
      <div v-if="pageSize && totalPages > 1" class="flex items-center gap-1.5">
        <IconButton icon="chevron-left" label="Pagina precedente" size="sm" :disabled="page <= 1" data-test="page-prev" @click="page = page - 1" />
        <span data-test="page-indicator" class="text-[12.5px] tabular-nums text-[var(--color-text-muted)]">{{ page }} / {{ totalPages }}</span>
        <IconButton icon="chevron-right" label="Pagina successiva" size="sm" :disabled="page >= totalPages" data-test="page-next" @click="page = page + 1" />
      </div>
    </div>
  </div>
</template>
