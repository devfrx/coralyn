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
  <Modal v-model:open="open" :title="title" :aria-description="description">
    <!-- La descrizione vive nel BODY (convenzione delle altre modali: header = titolo, body =
         contenuto). Passarla come `description` di Modal la metteva nell'header e lasciava lo slot
         body vuoto → una banda di padding vuota tra header e footer. `aria-description` la tiene
         come DialogDescription sr-only, così l'aria-describedby resta il testo reale. -->
    <p v-if="description" class="text-[13px] leading-relaxed text-[var(--color-text-2nd)]">{{ description }}</p>
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
