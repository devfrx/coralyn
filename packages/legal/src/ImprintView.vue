<script setup lang="ts">
import LegalDocument from './LegalDocument.vue';
import { IMPRINT_FIELDS, IMPRINT_NOT_APPLICABLE, IMPRINT_UPDATED } from './imprint.content';
</script>

<template>
  <LegalDocument title="Note legali" :updated="IMPRINT_UPDATED" :sections="[]">
    <template #before-sections>
      <p class="mb-6 text-sm leading-relaxed text-[var(--color-text-muted)]">
        Informazioni sul prestatore del servizio, rese ai sensi dell’art. 7 del D.Lgs. 70/2003.
      </p>

      <dl data-testid="imprint-fields" class="mb-6 grid grid-cols-1 gap-2">
        <div
          v-for="f in IMPRINT_FIELDS"
          :key="f.label"
          class="rounded-lg border border-[var(--color-border)] p-3 text-sm"
        >
          <dt class="font-medium text-[var(--color-text)]">{{ f.label }}</dt>
          <dd class="text-[var(--color-text-muted)]">{{ f.value }}</dd>
        </div>
      </dl>

      <h2 class="mb-1 text-sm font-semibold text-[var(--color-text)]">Voci non applicabili</h2>
      <p
        v-for="f in IMPRINT_NOT_APPLICABLE"
        :key="f.label"
        class="mb-2 text-sm leading-relaxed text-[var(--color-text-muted)]"
      >
        <span class="font-medium">{{ f.label }} ({{ f.source }}):</span> {{ f.value }}
      </p>
    </template>
  </LegalDocument>
</template>
