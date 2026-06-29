<script setup lang="ts">
import { Card, Badge } from '@driftly/ui-kit';
import { useCliente } from './useClienti';

const props = defineProps<{ id: string }>();
const { data: cliente, isLoading, isError } = useCliente(props.id);

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
        <dl class="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <dt class="text-[var(--color-text-muted)]">Telefono</dt><dd>{{ cliente.telefono || '—' }}</dd>
          <dt class="text-[var(--color-text-muted)]">Email</dt><dd>{{ cliente.email || '—' }}</dd>
          <dt class="text-[var(--color-text-muted)]">Note</dt><dd>{{ cliente.note || '—' }}</dd>
        </dl>
      </Card>

      <Card v-for="s in inArrivo" :key="s" class="mb-2 p-4 text-sm text-[var(--color-text-muted)]">
        {{ s }} · in arrivo
      </Card>
    </template>
  </section>
</template>
