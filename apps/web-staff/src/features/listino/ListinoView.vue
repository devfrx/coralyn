<script setup lang="ts">
import { Button, Badge, Card, DataTable, Icon } from '@driftly/ui-kit';

type Tone = 'accent' | 'brand' | 'neutral';
const pacchetti: { nome: string; tag: string; tone: Tone; dotazione: string; prezzo: string }[] = [
  { nome: 'Base', tag: 'Essenziale', tone: 'neutral', dotazione: 'Ombrellone + 2 lettini. Posizione retro e centrale.', prezzo: '€ 22' },
  { nome: 'Comfort', tag: 'Più richiesto', tone: 'accent', dotazione: 'Ombrellone + 2 lettini + sdraio. Prime file laterali.', prezzo: '€ 28' },
  { nome: 'Prestige', tag: 'Prima fila', tone: 'brand', dotazione: 'Maxi ombrellone + 3 lettini + cassaforte. Fronte mare.', prezzo: '€ 36' },
];
const fasce = [
  { nome: 'Giornata', orario: '08:30 – 19:30' }, { nome: 'Mattina', orario: '08:30 – 13:30' }, { nome: 'Pomeriggio', orario: '13:30 – 19:30' },
];
const cols = [
  { key: 'posizione', label: 'Posizione' }, { key: 'pacchetto', label: 'Pacchetto' }, { key: 'fascia', label: 'Fascia' },
  { key: 'giorno', label: 'Giornata', align: 'right' as const }, { key: 'settimana', label: 'Settimana', align: 'right' as const }, { key: 'stagione', label: 'Stagione', align: 'right' as const },
];
const tariffe = [
  { posizione: 'Prima fila', pacchetto: 'Prestige', fascia: 'Giornata', giorno: '€ 36', settimana: '€ 210', stagione: '€ 1.650' },
  { posizione: 'Prima fila', pacchetto: 'Comfort', fascia: 'Giornata', giorno: '€ 28', settimana: '€ 165', stagione: '€ 1.200' },
  { posizione: 'File laterali', pacchetto: 'Comfort', fascia: 'Giornata', giorno: '€ 24', settimana: '€ 140', stagione: '€ 980' },
  { posizione: 'Centrale', pacchetto: 'Base', fascia: 'Giornata', giorno: '€ 22', settimana: '€ 125', stagione: '€ 860' },
  { posizione: 'Centrale', pacchetto: 'Base', fascia: 'Mattina', giorno: '€ 14', settimana: '€ 80', stagione: '€ 540' },
  { posizione: 'Retro', pacchetto: 'Base', fascia: 'Pomeriggio', giorno: '€ 14', settimana: '€ 80', stagione: '€ 520' },
];
</script>
<template>
  <section class="px-[26px] pb-[30px] pt-[22px]">
    <div class="mb-[18px] flex flex-wrap items-center gap-3">
      <button class="flex items-center gap-2.5 rounded-[11px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2">
        <span class="text-[13px] font-semibold text-[var(--color-text)]">Estate 2026</span>
        <span class="text-[11.5px] tabular-nums text-[var(--color-text-muted)]">1 giu – 15 set</span>
        <Icon name="chevron-down" :size="15" class="text-[var(--color-text-muted)]" />
      </button>
      <div class="flex-1"></div>
      <Button><Icon name="plus" :size="16" />Nuova tariffa</Button>
    </div>

    <div class="mb-3.5 grid grid-cols-3 gap-3.5">
      <Card v-for="p in pacchetti" :key="p.nome">
        <div class="p-[18px]">
          <div class="mb-2.5 flex items-center justify-between">
            <span class="text-[15px] font-bold text-[var(--color-text)]">{{ p.nome }}</span>
            <Badge :tone="p.tone">{{ p.tag }}</Badge>
          </div>
          <div class="min-h-[60px] text-[12.5px] leading-relaxed text-[var(--color-text-2nd)]">{{ p.dotazione }}</div>
          <div class="mt-3 flex items-baseline gap-1.5 border-t border-[var(--color-border-row)] pt-3">
            <span class="whitespace-nowrap text-[22px] font-bold tabular-nums text-[var(--color-text)]">{{ p.prezzo }}</span>
            <span class="text-[11.5px] text-[var(--color-text-muted)]">/ giorno · prima fila</span>
          </div>
        </div>
      </Card>
    </div>

    <div class="mb-4 flex flex-wrap gap-2.5">
      <div v-for="f in fasce" :key="f.nome" class="flex items-center gap-2.5 rounded-[11px] border border-[var(--color-border)] bg-[var(--color-raised)] px-3.5 py-2.5">
        <Icon name="clock" :size="16" class="text-[var(--color-accent)]" />
        <span class="text-[12.5px] font-semibold text-[var(--color-text)]">{{ f.nome }}</span>
        <span class="text-[11.5px] tabular-nums text-[var(--color-text-muted)]">{{ f.orario }}</span>
      </div>
    </div>

    <DataTable :columns="cols">
      <tr v-for="(t, i) in tariffe" :key="i" class="hover:bg-[var(--color-raised)]">
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5 font-semibold text-[var(--color-text)]">{{ t.posizione }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ t.pacchetto }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ t.fascia }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-right tabular-nums text-[var(--color-text)]">{{ t.giorno }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-right tabular-nums text-[var(--color-text)]">{{ t.settimana }}</td>
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5 text-right font-bold tabular-nums text-[var(--color-text)]">{{ t.stagione }}</td>
      </tr>
    </DataTable>
  </section>
</template>
