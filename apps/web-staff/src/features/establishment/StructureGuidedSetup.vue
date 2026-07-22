<script setup lang="ts">
defineProps<{ step: 1 | 2 | 3 }>();
const emit = defineEmits<{ advance: [] }>();

const STEPS = [
  { n: 1, title: 'Crea un settore', desc: 'La zona della spiaggia: «Centro», «Zona nord»… Griglia per le file regolari, Speciali per i posti fuori schema.' },
  { n: 2, title: 'Aggiungi una fila', desc: 'Ogni settore è fatto di file, dalla più vicina al mare in giù.' },
  { n: 3, title: 'Genera gli ombrelloni', desc: 'Prefisso + numerazione automatica: 20 ombrelloni in un click.' },
] as const;
</script>

<template>
  <div class="flex flex-col items-center gap-[18px] px-[30px] py-[52px] text-center">
    <h3 class="m-0 text-[17px] font-extrabold text-[var(--color-text)]">Costruiamo la tua spiaggia</h3>
    <p class="m-0 max-w-[44ch] text-[13px] leading-[1.55] text-[var(--color-text-2nd)]">Tre passi e la struttura è pronta: si riflette subito sulla Mappa. Potrai sempre modificare tutto da qui.</p>
    <div class="grid grid-cols-3 gap-3">
      <div v-for="s in STEPS" :key="s.n" data-testid="guided-step"
        class="w-[180px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] text-left [box-shadow:var(--shadow-card)]">
        <button v-if="s.n === step" type="button" data-testid="guided-step-active"
          class="block w-full px-3.5 py-4 text-left focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          @click="emit('advance')">
          <span class="mb-2.5 grid size-[26px] place-items-center rounded-full bg-[var(--color-brand-tint)] text-[12.5px] font-extrabold text-[var(--color-brand-ink)]">{{ s.n }}</span>
          <b class="mb-[3px] block text-[12.5px] text-[var(--color-text)]">{{ s.title }}</b>
          <span class="block text-[11.5px] leading-[1.45] text-[var(--color-text-muted)]">{{ s.desc }}</span>
        </button>
        <div v-else class="px-3.5 py-4 opacity-55">
          <span class="mb-2.5 grid size-[26px] place-items-center rounded-full bg-[var(--color-brand-tint)] text-[12.5px] font-extrabold text-[var(--color-brand-ink)]">{{ s.n }}</span>
          <b class="mb-[3px] block text-[12.5px] text-[var(--color-text)]">{{ s.title }}</b>
          <span class="block text-[11.5px] leading-[1.45] text-[var(--color-text-muted)]">{{ s.desc }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
