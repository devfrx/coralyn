<script setup lang="ts">
import { TD, TD_FIRST, TD_RIGHT, TD_NUM } from '../styles/table';

type Column = { key: string; label: string; align?: 'left' | 'right'; numeric?: boolean };

const props = defineProps<{
  columns: Column[];
  rows?: Record<string, unknown>[];
  rowKey?: (row: Record<string, unknown>) => string;
}>();

function cellClass(col: Column, isFirst: boolean): string {
  if (isFirst) return col.numeric ? `${TD_FIRST} ${TD_NUM}` : TD_FIRST;
  if (col.align === 'right') return col.numeric ? `${TD_RIGHT} ${TD_NUM}` : TD_RIGHT;
  return col.numeric ? `${TD} ${TD_NUM}` : TD;
}
function key(row: Record<string, unknown>, idx: number): string {
  return props.rowKey ? props.rowKey(row) : String(idx);
}
</script>
<template>
  <div class="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] [box-shadow:var(--shadow-card)]">
    <table class="w-full border-collapse text-[13px]">
      <thead>
        <tr class="bg-[var(--color-raised)]">
          <th v-for="c in columns" :key="c.key" :class="['border-b border-[var(--color-border)] px-[18px] py-3 text-[10.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-text-muted)]', c.align === 'right' ? 'text-right' : 'text-left']">{{ c.label }}</th>
        </tr>
      </thead>
      <tbody v-if="rows">
        <tr v-for="(row, i) in rows" :key="key(row, i)" class="hover:bg-[var(--color-raised)]">
          <td v-for="(c, ci) in columns" :key="c.key" :class="cellClass(c, ci === 0)">
            <slot :name="`cell-${c.key}`" :row="row">{{ row[c.key] }}</slot>
          </td>
        </tr>
      </tbody>
      <tbody v-else><slot /></tbody>
    </table>
  </div>
</template>
