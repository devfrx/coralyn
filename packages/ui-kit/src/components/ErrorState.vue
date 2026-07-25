<script setup lang="ts">
import { getCurrentInstance } from 'vue';
import Icon from './Icon.vue';
import Button from './Button.vue';

/**
 * Gemello di EmptyState per il caso «il caricamento è FALLITO» (AUD-012). Sono due cose diverse e
 * l'utente deve poterle distinguere: «non ci sono prenotazioni oggi» è un fatto, «non sono riuscito
 * a chiedertelo» è un guasto. Prima di questo componente il repo aveva solo il primo dei due, e le
 * viste rendevano il secondo come il primo — una spiaggia che risulta libera perché la rete è caduta
 * è un posto che l'operatore rivende due volte.
 *
 * `role="alert"` e non `status`: è un errore, e va annunciato dagli screen reader appena compare.
 */
withDefaults(
  defineProps<{
    /** Dettaglio tecnico (tipicamente `error.message`). Omesso = solo il titolo. */
    message?: string;
    title?: string;
    retryLabel?: string;
  }>(),
  { title: 'Caricamento non riuscito', retryLabel: 'Riprova' },
);

defineEmits<{ retry: [] }>();

// Stesso idioma di DataTable: il pulsante compare solo se qualcuno ascolta, così un ErrorState
// senza `@retry` non mostra un bottone che non fa niente.
const hasRetry = !!getCurrentInstance()?.vnode.props?.onRetry;
</script>
<template>
  <div
    data-test="error-state"
    role="alert"
    class="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-6 py-10 text-center"
  >
    <span class="mb-1 grid size-11 place-items-center rounded-full bg-[var(--color-surface)] text-[var(--color-danger)]">
      <Icon name="alert-triangle" :size="20" />
    </span>
    <p class="text-sm font-semibold text-[var(--color-text)]">{{ title }}</p>
    <p v-if="message || $slots.default" data-test="error-detail" class="text-sm text-[var(--color-text-2nd)]">
      <slot>{{ message }}</slot>
    </p>
    <div v-if="hasRetry" class="mt-2">
      <Button size="sm" variant="secondary" data-test="error-retry" @click="$emit('retry')">
        <Icon name="renew" :size="15" />{{ retryLabel }}
      </Button>
    </div>
    <div v-if="$slots.action" class="mt-2"><slot name="action" /></div>
  </div>
</template>
