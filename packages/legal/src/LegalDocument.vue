<script setup lang="ts">
import type { LegalSection } from './types';

/**
 * Renderer condiviso dei documenti legali. Stile allineato a `PrivacyView.vue` di web-customer
 * (stessi token e stessa larghezza di colonna), così le pagine legali del prodotto si somigliano
 * anche se vivono in app diverse.
 */
defineProps<{
  title: string;
  version?: string;
  updated: string;
  sections: LegalSection[];
}>();
</script>

<template>
  <section class="mx-auto max-w-[640px] px-5 py-8">
    <h1 class="mb-1 text-[22px] font-bold tracking-[-.02em] text-[var(--color-text)]">{{ title }}</h1>
    <p data-testid="legal-version" class="mb-6 text-xs text-[var(--color-text-muted)]">
      <template v-if="version">Versione {{ version }} · </template>aggiornata il {{ updated }}
    </p>

    <slot name="before-sections" />

    <div v-for="s in sections" :key="s.id" class="mb-5">
      <h2 class="mb-1 text-sm font-semibold text-[var(--color-text)]">{{ s.heading }}</h2>
      <p
        v-for="(p, i) in s.paragraphs"
        :key="i"
        class="mb-2 text-sm leading-relaxed text-[var(--color-text-muted)]"
      >
        {{ p }}
      </p>
    </div>

    <slot />

    <p
      class="mt-8 border-t border-[var(--color-border)] pt-4 text-xs leading-relaxed text-[var(--color-text-muted)]"
    >
      Questo testo è una bozza tecnica e non costituisce un parere legale. Prima della pubblicazione
      deve essere validato da un professionista legale o dal responsabile della protezione dei dati.
    </p>
  </section>
</template>
