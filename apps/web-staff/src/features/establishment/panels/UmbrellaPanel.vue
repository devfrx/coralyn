<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Field, Input, Select, Option, ConfirmDialog, pushToast } from '@coralyn/ui-kit';
import type { StructureRowDTO, StructureSectorDTO, StructureUmbrellaDTO, UmbrellaTypeDTO } from '@coralyn/contracts';
import { useUpdateUmbrella, useDeleteUmbrella, useRetireUmbrella } from '../useEstablishmentStructure';
import { moveTargets, positionOptions } from '../umbrellaMove';

const props = defineProps<{
  umbrella: StructureUmbrellaDTO;
  row: StructureRowDTO;
  sector: StructureSectorDTO;
  sectors: StructureSectorDTO[];
  types: UmbrellaTypeDTO[];
  canManage: boolean;
  /** `isPending` della mutation, che vive nella shell: serve a non far partire due scritture con un
   *  doppio clic, perché fino alla rilettura la scelta a schermo resta quella di prima. */
  movePending: boolean;
}>();
const emit = defineEmits<{ close: []; move: [rowId: string, position: number] }>();
const update = useUpdateUmbrella();
const removeUmbrella = useDeleteUmbrella();
const retire = useRetireUmbrella();

const label = ref(props.umbrella.label);
const umbrellaTypeId = ref(props.umbrella.umbrellaTypeId ?? '');

// --- Sposta in… (D-071) ------------------------------------------------------
//
// Il pannello NON possiede la mutation: emette, e la shell riusa lo stesso ingresso del
// trascinamento. Disclosure sul prezzo, anteprima ottimistica e invalidazioni restano in un
// esemplare solo — un secondo gemello divergerebbe in silenzio, come già successo fra i due dialoghi
// nella review avversariale di D-038.
//
// Il controllo si rende a OGNI larghezza, non solo sotto `lg`: a `lg+` è l'equivalente da tastiera
// che ADR-0065 §8 dichiara mancante, e agganciarlo alla soglia dei 1024px sarebbe la terza cosa da
// tenere allineata dopo `drawerOpen` e `canDrag`. ⚠️ Non estende il trascinamento, che resta `lg+`.

const targets = computed(() => moveTargets(props.sectors, props.sector.kind));
/** Indice attuale nella propria fila: è l'unica posizione che, inviata sulla propria fila,
 *  lascerebbe l'albero invariato — e quindi quella su cui il bottone resta spento. */
const currentPosition = computed(() => props.row.umbrellas.findIndex((u) => u.id === props.umbrella.id));

const targetRowIdRef = ref(props.row.id);
const positionRef = ref(String(currentPosition.value));

const targetRow = computed(() =>
  props.sectors.flatMap((s) => s.rows).find((r) => r.id === targetRowIdRef.value) ?? props.row);
const positions = computed(() => positionOptions(targetRow.value, props.umbrella.id));

/**
 * Il valore MOSTRATO, non quello memorizzato. I pannelli non sono key-ati e ricevono props nuove a
 * ogni rilettura (`form-sync.spec.ts`): se la fila di destinazione si accorcia sotto i piedi, la
 * posizione scelta esce dall'intervallo e il server risponderebbe 422. La coda esiste sempre, ed è
 * il ripiego. Ciò che si invia è ciò che si vede.
 */
const position = computed(() => {
  const chosen = positions.value.find((p) => String(p.position) === positionRef.value);
  return String((chosen ?? positions.value[positions.value.length - 1]).position);
});

/**
 * Cambiare fila riporta la posizione in coda: nella fila nuova l'ombrellone non ha una posizione
 * attuale da conservare. Scritto come setter e non come `watch`, perché il `watch` su `umbrella.id`
 * qui sotto scrive entrambi i ref e l'ordine fra due watch sarebbe una dipendenza da non avere.
 */
const targetRowId = computed({
  get: () => targetRowIdRef.value,
  set: (id: string) => {
    targetRowIdRef.value = id;
    positionRef.value = String(positions.value[positions.value.length - 1].position);
  },
});

function onPositionChange(v: string | undefined): void {
  if (v !== undefined) positionRef.value = v;
}

/**
 * Identità del `Select` della posizione: il **contenuto dell'elenco**, non la sua identità d'oggetto.
 *
 * ⚠️ Misurato, non estetico. `SelectValue` di reka-ui non rende lo slot dell'item selezionato: rende
 * il testo preso da un registro valore→testo costruito dagli item **montati**. Qui l'elenco cambia
 * sotto — con la fila di destinazione, con l'ombrellone selezionato, e a ogni rilettura — e quel
 * registro resta indietro: il controllo finisce per **nominare un ombrellone che nella destinazione
 * non esiste**. Valore giusto, etichetta che mente.
 *
 * Due inneschi osservati davvero, entrambi ora in presidio: la coda della fila nuova che ha per caso
 * lo STESSO numero della scelta corrente (il `modelValue` non cambia, quindi non si rilegge nulla), e
 * il cambio di ombrellone a fila ferma (il `modelValue` cambia, ma il registro porta ancora il testo
 * del vecchio elenco).
 *
 * Legare la chiave alle etichette rese fa rimontare il controllo **esattamente** quando quell'elenco
 * cambia, e mai per una rilettura che non cambia nulla — è una stringa derivata dal contenuto.
 */
const positionKey = computed(() => JSON.stringify(positions.value.map((p) => p.beforeLabel)));

const moveIsNoop = computed(() =>
  targetRowIdRef.value === props.row.id && Number(position.value) === currentPosition.value);

function onMove(): void {
  if (moveIsNoop.value || props.movePending) return;
  emit('move', targetRowIdRef.value, Number(position.value));
}

watch(() => props.umbrella.id, () => {
  label.value = props.umbrella.label;
  umbrellaTypeId.value = props.umbrella.umbrellaTypeId ?? '';
  targetRowIdRef.value = props.row.id;
  positionRef.value = String(currentPosition.value);
});

function submit() {
  const l = label.value.trim();
  if (!l) return;
  update.mutate({ id: props.umbrella.id, label: l, umbrellaTypeId: umbrellaTypeId.value === '' ? null : umbrellaTypeId.value },
    { onSuccess: () => pushToast('Ombrellone aggiornato.') });
}

const confirmOpen = ref(false);
function onDelete() {
  removeUmbrella.mutate(props.umbrella.id, { onSuccess: () => { pushToast('Ombrellone eliminato.'); emit('close'); } });
  confirmOpen.value = false;
}

const retireOpen = ref(false);
function onRetire() {
  retire.mutate(props.umbrella.id, { onSuccess: () => { pushToast('Ombrellone ritirato.'); emit('close'); } });
  retireOpen.value = false;
}
</script>

<template>
  <div>
    <div class="border-b border-[var(--color-border-row)] px-[18px] pb-3 pt-3.5">
      <div class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Ombrellone</div>
      <div class="mt-0.5 text-[15.5px] font-extrabold tracking-[-.01em]">{{ umbrella.label }}</div>
      <div class="mt-0.5 text-[11.5px] font-semibold text-[var(--color-text-muted)]">Settore {{ sector.name }} · {{ row.label }}</div>
    </div>
    <div class="flex flex-col gap-3.5 p-[18px]">
      <form v-if="canManage" data-testid="umbrella-form" class="flex flex-col gap-3" @submit.prevent="submit">
        <Field label="Etichetta">
          <Input name="umbrella-label" data-testid="umbrella-label" v-model="label" />
        </Field>
        <p class="-mt-2 text-[11.5px] text-[var(--color-text-muted)]">Numero fisico reale, unico in tutta la spiaggia</p>
        <Field label="Tipologia">
          <Select v-model="umbrellaTypeId" data-testid="umbrella-type">
            <Option value="">Normale</Option>
            <Option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</Option>
          </Select>
        </Field>
        <Button type="submit" data-testid="umbrella-save" :loading="update.isPending.value">Salva</Button>
      </form>
      <p class="text-[11.5px] text-[var(--color-text-muted)]">Maiusc+clic su altre celle per agire in blocco</p>
      <!-- D-071: il secondo canale, che non dipende dal puntatore. Sotto `lg` il Drawer rende la
           scena pointer-morta e la copre con lo scrim, quindi è l'unico modo di riordinare; a `lg+`
           affianca il trascinamento senza sostituirlo. -->
      <div v-if="canManage" data-testid="umbrella-move" class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-row)] p-3">
        <p class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Sposta</p>
        <Field label="Fila di destinazione">
          <Select v-model="targetRowId" data-testid="umbrella-move-row">
            <Option v-for="t in targets" :key="t.id" :value="t.id">{{ t.sectorName }} · {{ t.label }}</Option>
          </Select>
        </Field>
        <!-- Il `:key` non è decorazione: vedi il doc-comment di `positionKey`. -->
        <Field label="Posizione">
          <Select :key="positionKey" :model-value="position" data-testid="umbrella-move-position" @update:model-value="onPositionChange">
            <Option v-for="p in positions" :key="p.position" :value="String(p.position)">
              {{ p.beforeLabel === null ? 'In coda' : `Prima di «${p.beforeLabel}»` }}
            </Option>
          </Select>
        </Field>
        <!-- ⚠️ `movePending` sta anche nel :disabled, non solo nel :loading: `Button.vue` lega
             `:disabled="loading || undefined"` e un `disabled` in fallthrough lo VINCE. Stesso
             accorgimento di BeachPanel per il ripristino. -->
        <Button size="sm" data-testid="umbrella-move-submit" :disabled="moveIsNoop || movePending"
          :loading="movePending" @click="onMove">Sposta</Button>
        <p class="text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">Solo le file dei settori dello stesso tipo: un ombrellone di griglia non va fra gli speciali.</p>
      </div>
      <div v-if="canManage" class="rounded-[var(--radius-md)] border border-[var(--color-danger-border)] bg-[color-mix(in_srgb,var(--color-danger-bg)_45%,transparent)] p-3">
        <p class="mb-1.5 text-[11.5px] font-extrabold text-[var(--color-danger-ink)]">Zona rischiosa</p>
        <p class="mb-2 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">Se ha prenotazioni non sarà eliminato.</p>
        <Button variant="danger" data-testid="umbrella-delete" class="w-full" :loading="removeUmbrella.isPending.value" @click="confirmOpen = true">Elimina ombrellone</Button>
        <p class="mb-2 mt-3 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">Ha storico? Ritiralo: sparisce dalla spiaggia, lo storico resta e puoi ripristinarlo.</p>
        <Button variant="secondary" data-testid="umbrella-retire" class="w-full" :loading="retire.isPending.value" @click="retireOpen = true">Ritira ombrellone</Button>
      </div>
    </div>
    <ConfirmDialog v-model:open="confirmOpen" title="Eliminare l'ombrellone?"
      description="Se ha prenotazioni non sarà eliminato." confirm-label="Elimina" tone="danger" @confirm="onDelete" />
    <ConfirmDialog v-model:open="retireOpen" title="Ritirare l'ombrellone?"
      description="Sparisce da struttura e mappa; lo storico contabile resta e potrai ripristinarlo dai «Ritirati» del pannello Spiaggia." confirm-label="Ritira" tone="danger" @confirm="onRetire" />
  </div>
</template>
