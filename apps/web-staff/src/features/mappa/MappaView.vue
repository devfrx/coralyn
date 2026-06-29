<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { OmbrelloneCell, SegmentedControl, Badge, Button, Modal, Icon } from '@driftly/ui-kit';
import type { OmbrelloneDTO, StatoSlot } from '@driftly/contracts';
import { useMappaGiorno } from './useMappaGiorno';

const { data: mappa, isLoading } = useMappaGiorno();

const STATO_COLOR: Record<StatoSlot, string> = {
  libero: 'var(--color-state-libero)', abbonato: 'var(--color-state-abbonato)',
  giornaliero: 'var(--color-state-giornaliero)', prenotato: 'var(--color-state-prenotato)',
};
const STATO_LABEL: Record<StatoSlot, string> = {
  libero: 'Libero', abbonato: 'Abbonato', giornaliero: 'Giornaliero', prenotato: 'Prenotato',
};

const fasce = computed(() => mappa.value?.fasce ?? []);
const tipologie = computed(() => new Map((mappa.value?.tipologie ?? []).map((t) => [t.id, t])));
const settori = computed(() => mappa.value?.settori ?? []);
// Convenzione: il settore "Speciali" è reso come blocco palme dedicato in coda, non come tab.
const settoriNormali = computed(() => settori.value.filter((s) => s.nome.toLowerCase() !== 'speciali'));
const speciali = computed(() => settori.value.find((s) => s.nome.toLowerCase() === 'speciali') ?? null);

const settoreAttivo = ref('');
watch(settoriNormali, (list) => { if (!settoreAttivo.value && list.length) settoreAttivo.value = list[0].id; }, { immediate: true });
const settoreCorrente = computed(() => settoriNormali.value.find((s) => s.id === settoreAttivo.value) ?? settoriNormali.value[0] ?? null);
const settoreOptions = computed(() => settoriNormali.value.map((s) => ({ value: s.id, label: s.nome })));
const countPostazioni = computed(() => settoreCorrente.value?.file.reduce((n, f) => n + f.ombrelloni.length, 0) ?? 0);

function statoFascia(o: OmbrelloneDTO, idx: number): StatoSlot {
  const f = fasce.value[idx] ?? fasce.value[0];
  return (o.statoPerFascia[f?.id] ?? 'libero') as StatoSlot;
}
function iconaTip(o: OmbrelloneDTO): string | null {
  return o.tipologiaId ? (tipologie.value.get(o.tipologiaId)?.icona ?? 'umbrella') : null;
}
function nomeTip(o: OmbrelloneDTO): string {
  return o.tipologiaId ? (tipologie.value.get(o.tipologiaId)?.nome ?? 'Tipologia') : 'Normale';
}
function ariaLabel(o: OmbrelloneDTO, settore: string, fila: string): string {
  return `Ombrellone ${o.etichetta}, Settore ${settore} ${fila}, tipologia ${nomeTip(o)}, mattina ${statoFascia(o, 0)}, pomeriggio ${statoFascia(o, 1)}`;
}

const sel = ref<{ o: OmbrelloneDTO; settore: string; fila: string } | null>(null);
function apri(o: OmbrelloneDTO, settore: string, fila: string) { sel.value = { o, settore, fila }; }
function chiudi() { sel.value = null; }

const mattina = computed<StatoSlot>(() => (sel.value ? statoFascia(sel.value.o, 0) : 'libero'));
const pomeriggio = computed<StatoSlot>(() => (sel.value ? statoFascia(sel.value.o, 1) : 'libero'));
const isLibero = computed(() => mattina.value === 'libero' && pomeriggio.value === 'libero');
function tintBg(s: StatoSlot) { return `color-mix(in srgb, ${STATO_COLOR[s]} 18%, var(--color-surface))`; }
function tintBorder(s: StatoSlot) { return `color-mix(in srgb, ${STATO_COLOR[s]} 40%, var(--color-surface))`; }

// Mock seam: dettaglio prenotazione/pagamento non ancora esposto dal backend per slot.
const booking = computed(() =>
  !sel.value || isLibero.value ? null
    : { cliente: 'Mario Rossi', pacchetto: 'Comfort', periodo: '27 giu – 4 lug 2026', pay: 'Saldato', importo: '€ 240,00' },
);

const modalPren = ref(false);
const packSel = ref('Comfort');
const fasciaSel = ref('Giornata');
const packOpts = [{ value: 'Base', label: 'Base' }, { value: 'Comfort', label: 'Comfort' }, { value: 'Prestige', label: 'Prestige' }];
const fasciaOpts = [{ value: 'Giornata', label: 'Giornata' }, { value: 'Mattina', label: 'Mattina' }, { value: 'Pomeriggio', label: 'Pomeriggio' }];
</script>

<template>
  <section class="flex min-h-[560px] flex-col">
    <div class="flex flex-wrap items-center gap-3 px-[26px] pt-4">
      <SegmentedControl v-if="settoreOptions.length" v-model="settoreAttivo" :options="settoreOptions" />
      <div class="flex-1"></div>
      <div class="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <Icon name="clock" :size="15" class="text-[var(--color-accent)]" />Stato per fascia · mattina / pomeriggio
      </div>
    </div>

    <p v-if="isLoading" class="px-[26px] py-10 text-[var(--color-text-muted)]">Caricamento…</p>

    <div v-else class="flex flex-1 items-stretch gap-[18px] px-[26px] pb-[26px] pt-4">
      <div class="relative min-w-0 flex-1 overflow-auto rounded-[var(--radius-xl)] border border-[var(--color-warm-border-stage)] p-5 [box-shadow:var(--shadow-card)]"
        style="background:linear-gradient(168deg,var(--color-warm-075) 0%,var(--color-warm-150) 100%);">
        <div class="mb-3 flex items-baseline justify-between">
          <span class="text-[13.5px] font-semibold text-[var(--color-stage-1)]">Spiaggia · Settore {{ settoreCorrente?.nome }}</span>
          <span class="text-[10px] font-semibold uppercase tracking-[.09em] text-[var(--color-stage-2)]">{{ countPostazioni }} postazioni</span>
        </div>
        <div class="relative mb-[18px] flex h-9 items-center justify-center gap-2.5 overflow-hidden rounded-[13px]"
          style="background:linear-gradient(180deg,var(--color-sea-1) 0%,var(--color-sea-2) 55%,var(--color-sea-3) 100%);box-shadow:inset 0 -8px 16px -5px rgba(47,110,132,.24);">
          <Icon name="waves" :size="16" class="text-[var(--color-sea-ink)] opacity-80" />
          <span class="text-[10px] font-semibold uppercase tracking-[.26em] text-[var(--color-sea-ink)]">Mare</span>
        </div>
        <div v-for="f in settoreCorrente?.file ?? []" :key="f.id" class="my-3 flex items-center gap-2.5">
          <span class="w-[46px] flex-none text-right text-[10px] font-semibold text-[var(--color-stage-2)]">{{ f.etichetta }}</span>
          <div class="flex flex-wrap gap-2.5">
            <OmbrelloneCell v-for="o in f.ombrelloni" :key="o.id" :etichetta="o.etichetta"
              :ariaLabel="ariaLabel(o, settoreCorrente!.nome, f.etichetta)" :stato-mattina="statoFascia(o, 0)"
              :stato-pomeriggio="statoFascia(o, 1)" :icona-tipologia="iconaTip(o)" :selezionato="sel?.o.id === o.id"
              @select="apri(o, settoreCorrente!.nome, f.etichetta)" />
          </div>
        </div>
        <div v-if="speciali" class="mt-[18px] border-t border-dashed border-[var(--color-warm-border-stage)] pt-3.5">
          <div class="mb-2.5 text-[10px] font-semibold uppercase tracking-[.09em] text-[var(--color-stage-1)]">Settore Speciali · Palme</div>
          <div v-for="f in speciali.file" :key="f.id" class="flex flex-wrap gap-3.5">
            <OmbrelloneCell v-for="o in f.ombrelloni" :key="o.id" :etichetta="o.etichetta"
              :ariaLabel="ariaLabel(o, 'Speciali', f.etichetta)" :stato-mattina="statoFascia(o, 0)"
              :stato-pomeriggio="statoFascia(o, 1)" :icona-tipologia="iconaTip(o)" :selezionato="sel?.o.id === o.id"
              @select="apri(o, 'Speciali', f.etichetta)" />
          </div>
        </div>
        <div class="mt-[22px] flex flex-wrap gap-7 border-t border-[var(--color-warm-border-stage)] pt-4">
          <div>
            <div class="mb-2 text-[10px] font-semibold uppercase tracking-[.09em] text-[var(--color-stage-3)]">Stato</div>
            <div class="flex flex-wrap gap-3.5 text-[11.5px] text-[var(--color-text-2nd)]">
              <span class="inline-flex items-center gap-1.5"><i class="size-[13px] rounded-full" style="background:var(--color-state-libero)"></i>Libero</span>
              <span class="inline-flex items-center gap-1.5"><i class="size-[13px] rounded-full" style="background:var(--color-state-abbonato)"></i>Abbonato</span>
              <span class="inline-flex items-center gap-1.5"><i class="size-[13px] rounded-full" style="background:var(--color-state-giornaliero)"></i>Giornaliero</span>
              <span class="inline-flex items-center gap-1.5"><i class="size-[13px] rounded-full" style="background:var(--color-state-prenotato)"></i>Prenotato</span>
              <span class="inline-flex items-center gap-1.5"><i class="size-[13px] rounded-full" style="background:linear-gradient(90deg,var(--color-state-prenotato) 0 50%,var(--color-state-libero) 50% 100%)"></i>Mezza giornata</span>
            </div>
          </div>
          <div>
            <div class="mb-2 text-[10px] font-semibold uppercase tracking-[.09em] text-[var(--color-stage-3)]">Tipologia</div>
            <div class="flex flex-wrap gap-3.5 text-[11.5px] text-[var(--color-text-2nd)]">
              <span class="inline-flex items-center gap-1.5"><i class="size-[13px] rounded-full" style="background:var(--color-state-normale-mark)"></i>Normale</span>
              <span class="inline-flex items-center gap-1.5"><Icon name="leaf" :size="14" class="text-[var(--color-accent)]" />Mini-palma</span>
              <span class="inline-flex items-center gap-1.5"><Icon name="palmtree" :size="14" class="text-[var(--color-accent)]" />Palma</span>
            </div>
          </div>
        </div>
      </div>

      <aside v-if="sel" class="flex w-[340px] flex-none flex-col rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 [box-shadow:var(--shadow-drawer)]">
        <div class="flex items-start justify-between">
          <div>
            <div class="mb-1 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--color-text-muted)]">Ombrellone</div>
            <h3 class="text-2xl font-bold tracking-[-.02em] tabular-nums text-[var(--color-text)]">{{ sel.o.etichetta }}</h3>
          </div>
          <button @click="chiudi" aria-label="Chiudi" class="grid size-8 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-raised)] text-[var(--color-text-muted)]"><Icon name="x" :size="16" /></button>
        </div>
        <div class="my-2.5 flex items-center gap-2">
          <Badge tone="accent"><Icon :name="iconaTip(sel.o) ?? 'umbrella'" :size="12" />{{ nomeTip(sel.o) }}</Badge>
          <span class="text-xs text-[var(--color-text-muted)]">Settore {{ sel.settore }} · {{ sel.fila }}</span>
        </div>
        <div class="mt-3 flex gap-2.5">
          <div class="flex-1 rounded-[11px] p-3" :style="{ background: tintBg(mattina), border: `1px solid ${tintBorder(mattina)}` }">
            <span class="mb-1 block text-[9.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-ink-600)]">Mattina</span>
            <span class="text-[13px] font-semibold" :style="{ color: STATO_COLOR[mattina] }">{{ STATO_LABEL[mattina] }}</span>
          </div>
          <div class="flex-1 rounded-[11px] p-3" :style="{ background: tintBg(pomeriggio), border: `1px solid ${tintBorder(pomeriggio)}` }">
            <span class="mb-1 block text-[9.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-ink-600)]">Pomeriggio</span>
            <span class="text-[13px] font-semibold" :style="{ color: STATO_COLOR[pomeriggio] }">{{ STATO_LABEL[pomeriggio] }}</span>
          </div>
        </div>
        <template v-if="booking">
          <div class="mt-3 text-[12.5px]">
            <div class="flex justify-between border-b border-dashed border-[var(--color-border-row)] py-2"><span class="text-[var(--color-text-muted)]">Cliente</span><span class="font-semibold text-[var(--color-text)]">{{ booking.cliente }}</span></div>
            <div class="flex justify-between border-b border-dashed border-[var(--color-border-row)] py-2"><span class="text-[var(--color-text-muted)]">Pacchetto</span><span class="font-semibold text-[var(--color-text)]">{{ booking.pacchetto }}</span></div>
            <div class="flex justify-between py-2"><span class="text-[var(--color-text-muted)]">Periodo</span><span class="font-semibold tabular-nums text-[var(--color-text)]">{{ booking.periodo }}</span></div>
          </div>
          <div class="mt-3 flex items-center gap-2 rounded-[11px] bg-[var(--color-success-bg)] p-3">
            <span class="size-2.5 rounded-full bg-[var(--color-success)]"></span>
            <span class="text-[12.5px] font-semibold text-[var(--color-success-ink)]">{{ booking.pay }}</span>
            <span class="flex-1"></span>
            <span class="text-[12.5px] font-bold tabular-nums text-[var(--color-success-ink)]">{{ booking.importo }}</span>
          </div>
          <button class="mt-2.5 self-start p-0.5 text-xs font-semibold text-[var(--color-danger)]">Annulla prenotazione</button>
        </template>
        <div v-else class="mt-3.5 rounded-xl border border-dashed border-[var(--color-warm-border-seg)] bg-[var(--color-warm-075)] p-4 text-center text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
          Postazione disponibile<br />per l'intera giornata.
        </div>
        <div class="mt-auto flex flex-col gap-2 pt-4">
          <Button @click="modalPren = true"><Icon name="plus" :size="17" />Nuova prenotazione</Button>
          <div class="flex gap-2">
            <Button variant="secondary" class="flex-1"><Icon name="star" :size="15" />Abbonamento</Button>
            <Button variant="secondary" class="flex-1"><Icon name="check" :size="15" />Presenza</Button>
          </div>
        </div>
      </aside>
    </div>

    <Modal v-model:open="modalPren" title="Nuova prenotazione" :eyebrow="`Settore ${sel?.settore ?? ''} · Ombrellone ${sel?.o.etichetta ?? ''}`">
      <div class="flex flex-col gap-[18px]">
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Cliente</label>
          <div class="flex items-center gap-2.5 rounded-[11px] border-[1.5px] border-[var(--color-border-input)] px-3.5 py-3 text-[var(--color-placeholder)]"><Icon name="search" :size="16" /><span class="text-[13.5px]">Cerca un cliente…</span></div>
        </div>
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Pacchetto</label>
          <SegmentedControl v-model="packSel" :options="packOpts" />
        </div>
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Fascia</label>
          <SegmentedControl v-model="fasciaSel" :options="fasciaOpts" />
        </div>
        <div class="flex justify-end gap-2.5 pt-2">
          <Button variant="secondary" @click="modalPren = false">Annulla</Button>
          <Button @click="modalPren = false">Conferma prenotazione</Button>
        </div>
      </div>
    </Modal>
  </section>
</template>
