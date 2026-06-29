<script setup lang="ts">
import { ref, watch } from 'vue';
import { Card, Badge, Button, Field, Input } from '@driftly/ui-kit';
import { useCliente, useModificaCliente } from './useClienti';

const props = defineProps<{ id: string }>();
const { data: cliente, isLoading, isError } = useCliente(props.id);
const modifica = useModificaCliente(props.id);

const telefono = ref('');
const email = ref('');
const note = ref('');
watch(cliente, (c) => {
  if (c) { telefono.value = c.telefono ?? ''; email.value = c.email ?? ''; note.value = c.note ?? ''; }
}, { immediate: true });

function salva() {
  modifica.mutate({ telefono: telefono.value, email: email.value, note: note.value });
}

const inArrivo = ['Abbonamento e anzianità', 'Storico prenotazioni', 'Pagamenti e saldo'];
</script>

<template>
  <section class="p-6">
    <p v-if="isLoading" class="text-[var(--color-text-muted)]">Caricamento…</p>
    <p v-else-if="isError" class="text-[var(--color-text-danger)]">Errore nel caricamento del cliente.</p>
    <template v-else-if="cliente">
      <header class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold">{{ cliente.nome }} {{ cliente.cognome }}</h2>
          <p class="text-sm text-[var(--color-text-muted)]">scheda cliente</p>
        </div>
        <div class="flex gap-2">
          <Badge>stato oggi · in arrivo</Badge>
          <Badge>saldo · in arrivo</Badge>
        </div>
      </header>

      <Card class="mb-4 p-4">
        <h3 class="mb-2 text-sm font-medium">Anagrafica e contatti</h3>
        <form class="flex flex-col gap-3" @submit.prevent="salva">
          <Field label="Telefono"><Input name="telefono" v-model="telefono" /></Field>
          <Field label="Email"><Input name="email" v-model="email" /></Field>
          <Field label="Note"><Input name="note" v-model="note" /></Field>
          <div><Button type="submit">Salva</Button></div>
        </form>
      </Card>

      <Card v-for="s in inArrivo" :key="s" class="mb-2 p-4 text-sm text-[var(--color-text-muted)]">
        {{ s }} · in arrivo
      </Card>
    </template>
  </section>
</template>
