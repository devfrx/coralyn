<script setup lang="ts">
import { computed } from 'vue';
import Modal from './Modal.vue';
import ModalFooter from './ModalFooter.vue';

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    confirmLabel: string;
    cancelLabel?: string;
    tone?: 'danger' | 'default';
  }>(),
  { cancelLabel: 'Annulla', tone: 'default' },
);
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ confirm: []; cancel: [] }>();

const submitVariant = computed<'primary' | 'danger'>(() => (props.tone === 'danger' ? 'danger' : 'primary'));

function onCancel(): void {
  open.value = false;
  emit('cancel');
}
</script>
<template>
  <Modal v-model:open="open" :title="title" :description="description">
    <slot />
    <ModalFooter
      :submit-label="confirmLabel"
      :cancel-label="cancelLabel"
      :submit-variant="submitVariant"
      @submit="emit('confirm')"
      @cancel="onCancel"
    />
  </Modal>
</template>
