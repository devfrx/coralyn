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
  /**
   * `isPending` della mutation, che vive nella shell.
   *
   * ⚠️ Il doppio clic sullo STESSO invio lo chiude già `onMove`, che consuma l'intenzione: quello
   * che resta a `movePending` è il caso in cui l'operatore, mentre la scrittura è ancora in volo,
   * sceglie una destinazione **nuova** — lì `moveIsNoop` è falso e a tenere spento il bottone c'è
   * solo questa prop. ⚠️ Questo commento diceva la prima cosa e non la seconda: era la ragione
   * valida prima che l'intenzione si consumasse, ed è rimasto indietro. Corretto dalla review
   * finale d'insieme del 2026-07-31.
   */
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

/**
 * L'INTENZIONE dell'operatore, `null` finché non ne esprime una. Il controllo non memorizza uno
 * stato da tenere sincronizzato: mostra **dove sta l'ombrellone** finché nessuno lo tocca, e la
 * scelta esplicita ha la precedenza solo finché resta praticabile.
 *
 * ⚠️ **Questa forma viene dalla review avversariale del 2026-07-31**, e la prima correzione era
 * sbagliata. Con lo stato memorizzato e un `watch` che lo risincronizzava, l'ombrellone spostato da
 * fuori — trascinato qui a `lg+`, o mosso da un collega — lasciava il controllo puntato sulla fila
 * vecchia, col bottone acceso su un gesto che lo **riportava indietro**. Ma risincronizzare sulla
 * coppia fila-indice trattava la **cancellazione di un vicino** come uno spostamento, e buttava via
 * la scelta in corso dell'operatore: un difetto scambiato con un altro. Derivare invece di
 * memorizzare li chiude entrambi, e non ha alcun `watch` da ordinare.
 */
const chosenRowId = ref<string | null>(null);
const chosenPosition = ref<string | null>(null);

/**
 * L'intenzione vale **come un blocco**: se la fila scelta esce dall'albero — eliminata da un'altra
 * postazione — cade tutta, posizione compresa.
 *
 * ⚠️ Trovato dalla review finale d'insieme del 2026-07-31, e riprodotto prima di correggerlo: far
 * cadere la sola fila non basta. Una posizione scelta **per un'altra fila** non significa nulla in
 * questa, ma verrebbe riletta sui suoi vicini — «prima di D» diventa «prima di A» — e il bottone si
 * armerebbe su uno spostamento che l'operatore non ha mai chiesto.
 */
const intentValid = computed(() => chosenRowId.value === null
  || targets.value.some((t) => t.id === chosenRowId.value));

/** La fila di destinazione effettiva: quella scelta finché l'intenzione regge, altrimenti la
 *  corrente — mai un `rowId` morto, che il server rifiuterebbe con 404. */
const effectiveRowId = computed(() => (intentValid.value && chosenRowId.value !== null
  ? chosenRowId.value
  : props.row.id));

const targetRow = computed(() =>
  props.sectors.flatMap((s) => s.rows).find((r) => r.id === effectiveRowId.value) ?? props.row);
const positions = computed(() => positionOptions(targetRow.value, props.umbrella.id));

/** Dove il controllo si posa quando l'operatore non ha scelto: la posizione attuale se la
 *  destinazione è la propria fila, la coda altrimenti — là l'ombrellone non ha una posizione. */
const defaultPosition = computed(() => (effectiveRowId.value === props.row.id
  ? String(currentPosition.value)
  : String(positions.value[positions.value.length - 1].position)));

/**
 * Il valore MOSTRATO, non quello memorizzato. I pannelli non sono key-ati e ricevono props nuove a
 * ogni rilettura (`form-sync.spec.ts`): se la fila di destinazione si accorcia sotto i piedi, la
 * posizione scelta esce dall'intervallo e il server risponderebbe 422. La coda esiste sempre, ed è
 * il ripiego. Ciò che si invia è ciò che si vede.
 */
const position = computed(() => {
  const wanted = intentValid.value ? (chosenPosition.value ?? defaultPosition.value) : defaultPosition.value;
  const chosen = positions.value.find((p) => String(p.position) === wanted);
  return String((chosen ?? positions.value[positions.value.length - 1]).position);
});

/** Cambiare fila azzera la scelta sulla posizione: nella fila nuova l'ombrellone non ha una
 *  posizione attuale da conservare, e `defaultPosition` la porta in coda. */
const targetRowId = computed({
  get: () => effectiveRowId.value,
  set: (id: string) => { chosenRowId.value = id; chosenPosition.value = null; },
});

function onPositionChange(v: string | undefined): void {
  if (v !== undefined) chosenPosition.value = v;
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

/** Stessa ragione del doc-comment qui sopra, per il `Select` della fila: le sue etichette vengono da
 *  `targets`, che cambia quando un settore o una fila viene rinominata, e senza chiave il controllo
 *  continuerebbe a mostrare il nome vecchio di dove sta l'ombrellone. Misurato con lo stesso metodo:
 *  il presidio è in `UmbrellaPanel.move.spec.ts`. */
const targetsKey = computed(() => JSON.stringify(targets.value.map((t) => `${t.sectorName} · ${t.label}`)));

const moveIsNoop = computed(() =>
  effectiveRowId.value === props.row.id && Number(position.value) === currentPosition.value);

/**
 * L'intenzione si **consuma** con l'invio, e non resta appesa.
 *
 * ⚠️ Trovato dalla review avversariale del 2026-07-31: `movePending` cade quando risponde il POST,
 * non quando atterra la rilettura. Nella finestra fra le due l'albero dice ancora che l'ombrellone
 * è nella fila di partenza, quindi con l'intenzione ancora impostata `moveIsNoop` resta falso, il
 * bottone torna cliccabile e un secondo clic rispedisce lo stesso spostamento — riaprendo la
 * disclosure sul prezzo appena confermata. Azzerandola, il controllo torna a mostrare dove
 * l'ombrellone sta e il bottone si spegne da sé, senza dipendere da quando la rilettura atterra.
 *
 * Il costo, dichiarato: se l'operatore annulla la disclosure deve riscegliere la destinazione. È il
 * verso giusto in cui sbagliare — dopo un «no» è meglio un controllo a riposo che un bottone armato.
 */
function onMove(): void {
  if (moveIsNoop.value || props.movePending) return;
  const rowId = effectiveRowId.value;
  const to = Number(position.value);
  chosenRowId.value = null;
  chosenPosition.value = null;
  emit('move', rowId, to);
}

/**
 * Cambiare ombrellone azzera la bozza dell'etichetta **e** l'intenzione sullo spostamento: sono due
 * entità diverse, e ciò che si stava per fare all'una non riguarda l'altra.
 *
 * ⚠️ La sorgente è il solo `id`, ed è deliberato: allargarla a `props.row` azzererebbe la bozza
 * dell'etichetta ogni volta che un collega sposta l'ombrellone, cioè proprio ciò che
 * `form-sync.spec.ts` esiste per impedire. Che il **controllo** segua lo spostamento non ha bisogno
 * di alcun watch: è derivato, e senza intenzione espressa mostra dove l'ombrellone sta adesso.
 */
watch(() => props.umbrella.id, () => {
  label.value = props.umbrella.label;
  umbrellaTypeId.value = props.umbrella.umbrellaTypeId ?? '';
  chosenRowId.value = null;
  chosenPosition.value = null;
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
          <Select :key="targetsKey" v-model="targetRowId" data-testid="umbrella-move-row">
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
