<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Card, Avatar, Badge, Button, Field, Input, Textarea, Icon } from '@coralyn/ui-kit';
import { useCliente, useModificaCliente } from './useClienti';

const props = defineProps<{ id: string }>();
const { data: cliente, isLoading, isError } = useCliente(props.id);
const modifica = useModificaCliente(props.id);

const telefono = ref(''); const email = ref(''); const note = ref('');
watch(cliente, (c) => { if (c) { telefono.value = c.telefono ?? ''; email.value = c.email ?? ''; note.value = c.note ?? ''; } }, { immediate: true });
function salva() { modifica.mutate({ telefono: telefono.value, email: email.value, note: note.value }); }

const ini = computed(() => (cliente.value ? ((cliente.value.nome[0] ?? '') + (cliente.value.cognome[0] ?? '')).toUpperCase() : ''));
const inArrivo = [
  { icon: 'star', titolo: 'Abbonamento e anzianità', desc: 'Stagioni consecutive, rinnovi e prelazione del posto.' },
  { icon: 'calendar', titolo: 'Storico prenotazioni', desc: 'Tutte le prenotazioni del bagnante, per stagione.' },
  { icon: 'euro', titolo: 'Pagamenti e saldo', desc: 'Incassi, metodo di pagamento e saldo aperto.' },
];
</script>
<template>
  <section class="max-w-[940px] px-[26px] pb-[30px] pt-[18px]">
    <p v-if="isLoading" class="text-[var(--color-text-muted)]">Caricamento…</p>
    <p v-else-if="isError" class="text-[var(--color-danger)]">Errore nel caricamento del cliente.</p>
    <template v-else-if="cliente">
      <RouterLink :to="{ name: 'clienti' }" class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-accent)]"><Icon name="chevron-left" :size="17" />Clienti</RouterLink>

      <Card class="mb-4">
        <div class="flex items-center gap-[18px] p-[22px]">
          <Avatar :iniziali="ini" size="lg" />
          <div class="min-w-0 flex-1">
            <h2 class="text-[23px] font-bold tracking-[-.015em] text-[var(--color-text)]">{{ cliente.nome }} {{ cliente.cognome }}</h2>
            <div class="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-[var(--color-text-2nd)]">
              <span class="inline-flex items-center gap-1.5 tabular-nums"><Icon name="phone" :size="15" class="text-[var(--color-placeholder)]" />{{ cliente.telefono ?? '—' }}</span>
              <span class="inline-flex items-center gap-1.5"><Icon name="mail" :size="15" class="text-[var(--color-placeholder)]" />{{ cliente.email ?? '—' }}</span>
            </div>
          </div>
          <Button variant="secondary"><Icon name="edit" :size="15" />Modifica</Button>
        </div>
      </Card>

      <Card class="mb-4">
        <form class="p-5" @submit.prevent="salva">
          <div class="mb-4 flex items-center justify-between">
            <span class="text-sm font-bold text-[var(--color-text)]">Anagrafica e contatti</span>
            <Button type="submit" variant="ghost"><Icon name="check" :size="14" />Salva</Button>
          </div>
          <div class="grid grid-cols-2 gap-x-7 gap-y-[18px]">
            <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Nome</div><div class="text-sm font-medium text-[var(--color-text)]">{{ cliente.nome }}</div></div>
            <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Cognome</div><div class="text-sm font-medium text-[var(--color-text)]">{{ cliente.cognome }}</div></div>
            <Field label="Telefono"><Input name="telefono" v-model="telefono" numeric /></Field>
            <Field label="Email"><Input name="email" v-model="email" type="email" /></Field>
            <div class="col-span-2"><Field label="Note"><Textarea name="note" v-model="note" /></Field></div>
          </div>
        </form>
      </Card>

      <div class="grid grid-cols-3 gap-3.5">
        <div v-for="s in inArrivo" :key="s.titolo" class="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-input)] bg-[var(--color-raised)] p-[18px]">
          <div class="mb-2.5 flex items-center justify-between">
            <span class="grid size-[34px] place-items-center rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-placeholder)]"><Icon :name="s.icon" :size="18" /></span>
            <Badge tone="soon">In arrivo</Badge>
          </div>
          <div class="mb-1 text-[13.5px] font-bold text-[var(--color-ink-600)]">{{ s.titolo }}</div>
          <div class="text-xs leading-relaxed text-[var(--color-text-muted)]">{{ s.desc }}</div>
        </div>
      </div>
    </template>
  </section>
</template>
