<script setup lang="ts">
import { ref, computed } from 'vue';
import { OmbrelloneCell, Drawer, Badge } from '@driftly/ui-kit';
import type { OmbrelloneDTO } from '@driftly/contracts';
import { useMappaGiorno } from './useMappaGiorno';

const { data: mappa, isLoading } = useMappaGiorno();
const selezionato = ref<OmbrelloneDTO | null>(null);
const open = ref(false);

const fasce = computed(() => mappa.value?.fasce ?? []);
const tipologie = computed(() => new Map((mappa.value?.tipologie ?? []).map((t) => [t.id, t])));
const nomeTipologiaSel = computed(() => {
  const id = selezionato.value?.tipologiaId;
  return id ? (tipologie.value.get(id)?.nome ?? 'Tipologia') : 'Normale';
});

function statoFascia(o: OmbrelloneDTO, idx: number): OmbrelloneDTO['statoPerFascia'][string] {
  const f = fasce.value[idx] ?? fasce.value[0];
  return o.statoPerFascia[f?.id] ?? 'libero';
}
function iconaTip(o: OmbrelloneDTO): string | null {
  return o.tipologiaId ? (tipologie.value.get(o.tipologiaId)?.icona ?? 'umbrella') : null;
}
function ariaLabel(o: OmbrelloneDTO, settore: string, fila: string): string {
  const tip = o.tipologiaId ? tipologie.value.get(o.tipologiaId)?.nome ?? 'tipologia' : 'Normale';
  return `Ombrellone ${o.etichetta}, Settore ${settore} ${fila}, tipologia ${tip}, mattina ${statoFascia(o, 0)}, pomeriggio ${statoFascia(o, 1)}`;
}
function apri(o: OmbrelloneDTO) { selezionato.value = o; open.value = true; }
</script>

<template>
  <section class="p-6">
    <h2 class="mb-4 text-xl font-semibold">Mappa</h2>
    <p v-if="isLoading" class="text-[var(--color-text-muted)]">Caricamento…</p>
    <div v-else class="space-y-6">
      <div v-for="s in mappa?.settori" :key="s.id">
        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Settore {{ s.nome }}</h3>
        <div v-for="f in s.file" :key="f.id" class="mb-2 flex items-center gap-2">
          <span class="w-16 text-right text-xs text-[var(--color-text-muted)]">{{ f.etichetta }}</span>
          <OmbrelloneCell
            v-for="o in f.ombrelloni" :key="o.id"
            :etichetta="o.etichetta"
            :ariaLabel="ariaLabel(o, s.nome, f.etichetta)"
            :stato-mattina="statoFascia(o, 0)"
            :stato-pomeriggio="statoFascia(o, 1)"
            :icona-tipologia="iconaTip(o)"
            :selezionato="selezionato?.id === o.id"
            @select="apri(o)"
          />
        </div>
      </div>
    </div>

    <Drawer v-model:open="open" :title="`Ombrellone ${selezionato?.etichetta ?? ''}`">
      <Badge class="mt-2"><span>{{ nomeTipologiaSel }}</span></Badge>
      <p class="mt-3 text-sm text-[var(--color-text-muted)]">Dettaglio prenotazione e azioni: slice successivo.</p>
    </Drawer>
  </section>
</template>
