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
