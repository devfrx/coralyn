<script setup lang="ts">
import { ref } from 'vue';
import { SegmentedControl, Button, Badge, Avatar, DataTable, Icon } from '@coralyn/ui-kit';

const filtro = ref('tutte');
const filtri = [
  { value: 'tutte', label: 'Tutte' }, { value: 'confermate', label: 'Confermate' },
  { value: 'bozze', label: 'Bozze' }, { value: 'concluse', label: 'Concluse' },
];
const cols = [
  { key: 'cliente', label: 'Cliente' }, { key: 'ombrellone', label: 'Ombrellone' },
  { key: 'pacchetto', label: 'Pacchetto' }, { key: 'tipo', label: 'Tipo' },
  { key: 'periodo', label: 'Periodo' }, { key: 'stato', label: 'Stato' },
  { key: 'incasso', label: 'Incasso', align: 'right' as const },
];
type Tone = 'success' | 'warning' | 'neutral';
// Mock seam: dati demo statici — da sostituire con useQuery quando il backend espone l'endpoint.
const prenotazioni: { ini: string; cliente: string; ombrellone: string; pacchetto: string; tipo: string; periodo: string; stato: string; tone: Tone; incasso: string }[] = [
  { ini: 'MR', cliente: 'Mario Rossi', ombrellone: 'Centro · 8', pacchetto: 'Comfort', tipo: 'Stagionale', periodo: '1 giu – 15 set', stato: 'Confermata', tone: 'success', incasso: '€ 1.200,00' },
  { ini: 'GB', cliente: 'Giulia Bianchi', ombrellone: 'Centro · 3', pacchetto: 'Prestige', tipo: 'Settimanale', periodo: '27 giu – 4 lug', stato: 'Confermata', tone: 'success', incasso: '€ 320,00' },
  { ini: 'LV', cliente: 'Luca Verdi', ombrellone: 'Centro · 12', pacchetto: 'Base', tipo: 'Giornaliero', periodo: '27 giu', stato: 'Bozza', tone: 'warning', incasso: '€ 28,00' },
  { ini: 'AC', cliente: 'Anna Conti', ombrellone: 'Palme · P1', pacchetto: 'Prestige', tipo: 'Stagionale', periodo: '1 giu – 15 set', stato: 'Confermata', tone: 'success', incasso: '€ 1.650,00' },
  { ini: 'FM', cliente: 'Franco Marini', ombrellone: 'Centro · 21', pacchetto: 'Comfort', tipo: 'Settimanale', periodo: '20 – 27 giu', stato: 'Conclusa', tone: 'neutral', incasso: '€ 290,00' },
  { ini: 'SR', cliente: 'Sara Russo', ombrellone: 'Centro · 5', pacchetto: 'Base', tipo: 'Giornaliero', periodo: '27 giu', stato: 'Confermata', tone: 'success', incasso: '€ 28,00' },
  { ini: 'DG', cliente: 'Davide Greco', ombrellone: 'Centro · 17', pacchetto: 'Comfort', tipo: 'Settimanale', periodo: '27 giu – 4 lug', stato: 'Bozza', tone: 'warning', incasso: '€ 290,00' },
  { ini: 'EL', cliente: 'Elena Lombardi', ombrellone: 'Palme · P2', pacchetto: 'Prestige', tipo: 'Stagionale', periodo: '1 giu – 15 set', stato: 'Confermata', tone: 'success', incasso: '€ 1.650,00' },
];
</script>
<template>
  <section class="px-[26px] pb-[30px] pt-[22px]">
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <SegmentedControl v-model="filtro" :options="filtri" />
      <div class="flex-1"></div>
      <Button variant="secondary"><Icon name="filter" :size="15" />Filtri</Button>
      <Button><Icon name="plus" :size="16" />Nuova prenotazione</Button>
    </div>
    <DataTable :columns="cols">
      <tr v-for="(p, i) in prenotazioni" :key="i" class="cursor-pointer hover:bg-[var(--color-raised)]">
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5"><div class="flex items-center gap-2.5"><Avatar :iniziali="p.ini" size="sm" /><span class="font-semibold text-[var(--color-text)]">{{ p.cliente }}</span></div></td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 tabular-nums text-[var(--color-text-2nd)]">{{ p.ombrellone }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ p.pacchetto }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ p.tipo }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 tabular-nums text-[var(--color-text-2nd)]">{{ p.periodo }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5"><Badge :tone="p.tone">{{ p.stato }}</Badge></td>
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5 text-right font-semibold tabular-nums text-[var(--color-text)]">{{ p.incasso }}</td>
      </tr>
    </DataTable>
  </section>
</template>
