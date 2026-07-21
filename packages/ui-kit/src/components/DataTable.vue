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
