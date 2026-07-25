<script setup lang="ts">
import { computed, inject, useAttrs } from 'vue';
import { SelectRoot, SelectTrigger, SelectValue, SelectPortal, SelectContent, SelectViewport } from 'reka-ui';
import Icon from './Icon.vue';
import Option from './Option.vue';
import { SELECT_EMPTY } from './select-internal';
import { FIELD_LABEL_ID } from './field-context';

defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{
  options?: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean;
}>(), { options: () => [], disabled: false });
const model = defineModel<string>();
// Il modello dei consumatori usa '' come stato reale; dentro reka-ui viaggia la sentinella.
const inner = computed({
  get: () => (model.value === '' ? SELECT_EMPTY : model.value),
  set: (v) => { model.value = v === SELECT_EMPTY ? '' : (v as string | undefined); },
});

/**
 * Nome accessibile del trigger (AUD-013, WCAG 4.1.2). Il `<label>` di `Field` non etichetta un
 * `<button role="combobox">` — un button non è un labelable element — quindi lo screen reader
 * annunciava il VALORE selezionato e mai l'etichetta: «Mattina» invece di «Fascia oraria, Mattina».
 *
 * Un `aria-label`/`aria-labelledby` passato dal chiamante VINCE: chi ha già risolto il problema a
 * mano non se lo vede sovrascritto, e un Select fuori da un Field resta etichettabile come prima.
 */
const attrs = useAttrs();
const fieldLabelId = inject(FIELD_LABEL_ID, null);
const labelledBy = computed(() =>
  attrs['aria-label'] || attrs['aria-labelledby'] ? undefined : (fieldLabelId ?? undefined),
);
</script>
<template>
  <SelectRoot v-model="inner" :disabled="disabled">
    <SelectTrigger
      v-bind="$attrs"
      :aria-labelledby="labelledBy"
      class="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-left text-[13.5px] text-[var(--color-text)] outline-none focus:border-[var(--color-brand)] focus:[box-shadow:var(--ring-focus)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <SelectValue class="truncate" />
      <Icon name="chevron-down" :size="16" class="flex-none text-[var(--color-text-muted)]" />
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper" :side-offset="6"
        class="z-[90] max-h-[min(340px,var(--reka-select-content-available-height))] w-[var(--reka-select-trigger-width)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] [box-shadow:var(--shadow-drawer)] data-[state=open]:[animation:overlay-in_var(--motion-fast)_var(--ease-standard)]"
      >
        <SelectViewport class="p-1">
          <slot>
            <Option v-for="o in options" :key="o.value" :value="o.value" :disabled="o.disabled">{{ o.label }}</Option>
          </slot>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
