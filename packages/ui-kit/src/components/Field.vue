<script setup lang="ts">
import { provide, useId } from 'vue';
import { FIELD_LABEL_ID } from './field-context';

defineProps<{ label: string; error?: string }>();

// L'id serve ai controlli che il `<label>` non riesce a etichettare da solo — oggi `Select`, che
// rende un `<button role="combobox">` (AUD-013). Per input e textarea l'associazione nativa del
// `<label>` che li avvolge basta già, e questo id resta semplicemente inutilizzato.
const labelId = useId();
provide(FIELD_LABEL_ID, labelId);
</script>
<template>
  <label class="block">
    <span :id="labelId" class="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-2nd)]">{{ label }}</span>
    <slot />
    <span v-if="error" class="mt-1 block text-xs text-[var(--color-danger)]">{{ error }}</span>
  </label>
</template>
