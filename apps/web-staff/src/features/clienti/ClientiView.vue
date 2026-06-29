<script setup lang="ts">
import { ref } from 'vue';
import { Button, Card, Field, Input } from '@driftly/ui-kit';
import { useClienti, useCreaCliente } from './useClienti';

const { data: clienti, isLoading } = useClienti();
const crea = useCreaCliente();
const nome = ref('');
const cognome = ref('');

function submit() {
  if (!nome.value || !cognome.value) return;
  crea.mutate({ nome: nome.value, cognome: cognome.value }, { onSuccess: () => { nome.value = ''; cognome.value = ''; } });
}
</script>

<template>
  <section class="p-6">
    <h2 class="mb-4 text-xl font-semibold">Clienti</h2>
    <Card class="mb-4 p-4">
      <form class="flex items-end gap-3" @submit.prevent="submit">
        <Field label="Nome" class="flex-1"><Input v-model="nome" /></Field>
        <Field label="Cognome" class="flex-1"><Input v-model="cognome" /></Field>
        <Button type="submit">Aggiungi</Button>
      </form>
    </Card>
    <Card class="p-4">
      <p v-if="isLoading" class="text-[var(--color-text-muted)]">Caricamento…</p>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <th class="py-2">Cognome</th><th class="py-2">Nome</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in clienti" :key="c.id" class="border-t border-[var(--color-cool-100)]">
            <td class="py-2 font-medium">
              <RouterLink :to="{ name: 'cliente-dettaglio', params: { id: c.id } }" class="text-[var(--color-text-accent)]">
                {{ c.cognome }}
              </RouterLink>
            </td><td class="py-2">{{ c.nome }}</td>
          </tr>
        </tbody>
      </table>
    </Card>
  </section>
</template>
