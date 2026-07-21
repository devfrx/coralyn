<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { sortRows, type DataTableColumn, type SortDir, paginate, pageCount, countLabel } from '../tableData';
import Icon from './Icon.vue';
import IconButton from './IconButton.vue';

type Row = Record<string, unknown>;

const props = withDefaults(
  defineProps<{
    columns: DataTableColumn[];
    rows?: Row[];
    rowKey?: (row: Row) => string;
    density?: 'comfortable' | 'compact';
    pageSize?: number;
    showCount?: boolean;
  }>(),
  { density: 'comfortable', showCount: false },
);

const page = defineModel<number>('page', { default: 1 });

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

// --- paginazione (client-side; v-model:page opzionale con fallback interno) ---
const totalPages = computed(() => (props.pageSize ? pageCount(sorted.value.length, props.pageSize) : 1));
const visible = computed<Row[]>(() => (props.pageSize ? paginate(sorted.value, page.value, props.pageSize) : sorted.value));
watch(() => props.rows, () => { page.value = 1; });

const footerVisible = computed(() => !!props.rows && sorted.value.length > 0 && (!!props.pageSize || props.showCount));
const footerLabel = computed(() =>
  countLabel(sorted.value.length, props.pageSize ? { page: page.value, pageSize: props.pageSize } : undefined),
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
              :aria-sort="ariaSort(c)"
              :class="[
                'border-b border-[var(--color-border)] px-[18px] py-3 text-[10.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-text-muted)]',
                c.align === 'right' ? 'text-right' : 'text-left',
                c.hideBelow ? HIDE[c.hideBelow] : '',
              ]"
            >
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
            </th>
          </tr>
        </thead>
        <tbody v-if="rows">
          <tr v-for="(row, i) in visible" :key="key(row, i)" class="hover:bg-[var(--color-raised)]">
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
