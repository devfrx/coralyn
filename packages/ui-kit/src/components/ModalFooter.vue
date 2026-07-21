<script setup lang="ts">
import Button from './Button.vue';

withDefaults(
  defineProps<{
    cancelLabel?: string;
    submitLabel: string;
    submitDisabled?: boolean;
    submitVariant?: 'primary' | 'danger';
    submitLoading?: boolean;
  }>(),
  { cancelLabel: 'Annulla', submitDisabled: false, submitVariant: 'primary', submitLoading: false },
);
defineEmits<{ cancel: []; submit: [] }>();
</script>
<template>
  <div class="flex justify-end gap-2.5 pt-1">
    <slot name="extra" />
    <Button type="button" variant="secondary" @click="$emit('cancel')">{{ cancelLabel }}</Button>
    <Button type="button" :variant="submitVariant" :disabled="submitDisabled || submitLoading" :loading="submitLoading" @click="$emit('submit')">{{ submitLabel }}</Button>
  </div>
</template>
