<script setup lang="ts">
import { computed } from 'vue';
import { SelectItem, SelectItemText, SelectItemIndicator } from 'reka-ui';
import Icon from './Icon.vue';
import { SELECT_EMPTY } from './select-internal';

const props = withDefaults(defineProps<{ value: string; disabled?: boolean }>(), { disabled: false });
// reka-ui vieta value="": la mappatura alla sentinella resta interna a ui-kit (vedi select-internal.ts).
const mapped = computed(() => (props.value === '' ? SELECT_EMPTY : props.value));
</script>
<template>
  <SelectItem
    :value="mapped"
    :disabled="disabled"
    class="relative flex cursor-default select-none items-center gap-2 rounded-[9px] px-2.5 py-2 text-[13.5px] text-[var(--color-text)] outline-none data-[highlighted]:bg-[var(--color-warm-050)] data-[disabled]:opacity-50"
  >
    <SelectItemText><slot /></SelectItemText>
    <SelectItemIndicator class="ml-auto flex-none"><Icon name="check" :size="14" class="text-[var(--color-brand)]" /></SelectItemIndicator>
  </SelectItem>
</template>
