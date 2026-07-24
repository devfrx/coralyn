<script setup lang="ts">
import LegalDocument from './LegalDocument.vue';
import {
  PRIVACY_OPERATORI_SECTIONS,
  PRIVACY_OPERATORI_UPDATED,
  PRIVACY_OPERATORI_VERSION,
} from './privacy.content';
</script>

<template>
  <LegalDocument
    title="Informativa privacy"
    :version="PRIVACY_OPERATORI_VERSION"
    :updated="PRIVACY_OPERATORI_UPDATED"
    :sections="PRIVACY_OPERATORI_SECTIONS"
  >
    <template #before-sections>
      <p
        data-testid="privacy-scope"
        class="mb-6 rounded-lg border border-[var(--color-border)] p-4 text-sm leading-relaxed text-[var(--color-text-muted)]"
      >
        Questa informativa riguarda i dati di chi <strong>usa</strong> il gestionale come operatore.
        I dati dei bagnanti sono trattati dallo stabilimento, che ne è titolare.
      </p>
    </template>
  </LegalDocument>
</template>
