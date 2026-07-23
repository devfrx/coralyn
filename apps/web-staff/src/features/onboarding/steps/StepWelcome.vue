<script setup lang="ts">
import { Button } from '@coralyn/ui-kit';

const emit = defineEmits<{ next: [] }>();
</script>

<template>
  <div class="flex flex-col items-center gap-[18px] px-[30px] py-[52px] text-center">
    <h2 class="m-0 text-[17px] font-extrabold text-[var(--color-text)]">Prepariamo il tuo lido.</h2>
    <p class="m-0 max-w-[56ch] text-[13px] leading-[1.55] text-[var(--color-text-2nd)]">
      Per incassare la prima prenotazione servono quattro cose, in quest'ordine: la
      <strong class="text-[var(--color-text)]">struttura</strong> della spiaggia (settori, file, ombrelloni), almeno una
      <strong class="text-[var(--color-text)]">fascia oraria</strong>, una
      <strong class="text-[var(--color-text)]">stagione</strong> e un
      <strong class="text-[var(--color-text)]">listino</strong>. Questo percorso ti guida passo per passo, con una spiegazione
      per ognuno. Puoi interromperlo e riprenderlo quando vuoi: si riparte sempre dal primo passo mancante e nessun dato viene
      mai cancellato.
    </p>
    <Button data-testid="ob-start" @click="emit('next')">Iniziamo</Button>
  </div>
</template>
