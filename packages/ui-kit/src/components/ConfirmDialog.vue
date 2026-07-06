<script setup lang="ts">
import { computed, watch } from 'vue';
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

// Il `confirm` viene chiuso dal chiamante; OGNI altra chiusura (Annulla, X, ESC, overlay) è un annullamento.
let confirming = false;
function onConfirm(): void {
  confirming = true;
  emit('confirm');
}
watch(open, (isOpen, was) => {
  if (was && !isOpen) {
    if (!confirming) emit('cancel');
    confirming = false;
  }
});
function onCancelButton(): void {
  open.value = false; // il watch emette `cancel`
}
</script>
<template>
  <Modal v-model:open="open" :title="title" :description="description">
    <slot />
    <template #footer>
      <ModalFooter
        :submit-label="confirmLabel"
        :cancel-label="cancelLabel"
        :submit-variant="submitVariant"
        @submit="onConfirm"
        @cancel="onCancelButton"
      />
    </template>
  </Modal>
</template>
