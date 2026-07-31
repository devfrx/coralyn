# «Sposta in…» nel pannello ombrellone (D-071) — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dare all'editor struttura un secondo canale per spostare un ombrellone, che non dipenda dal
puntatore, così che tablet e telefono smettano di essere scoperti.

**Architecture:** il pannello **non possiede la mutation**. Rende due `Select` (fila di destinazione,
posizione) e un bottone, ed **emette verso l'alto**; `InspectorPanels` riemette con la stessa firma
che la scena già usa, e la shell aggancia i due canali allo **stesso** handler. Disclosure sul
prezzo, anteprima ottimistica e invalidazioni restano in un esemplare solo. La selezione delle
destinazioni e l'aritmetica della posizione sono **funzioni pure** in un modulo che esiste già.

**Tech Stack:** Vue 3.5 `<script setup lang="ts">` · TanStack Query v5 via `@coralyn/data-layer` ·
`@coralyn/ui-kit` (reka-ui 2.10.1) · vitest + jsdom + `@vue/test-utils` + MSW.

**Spec:** [2026-07-31-sposta-in-pannello-ombrellone-d071-design.md](../specs/2026-07-31-sposta-in-pannello-ombrellone-d071-design.md)

## Global Constraints

- **Nessuna riga di API cambia.** Nessun endpoint, nessun DTO, nessuna migration, nessun e2e nuovo.
- **Nessuna dipendenza nuova.**
- **La decisione 5 di ADR-0065 non si riapre:** `:can-drag="isDesktop"` resta com'è e la maniglia
  continua a non rendersi sotto `lg`. Questa slice aggiunge un canale, non estende il trascinamento.
- **Una suite per volta.** In parallelo su questo host danno falsi rossi di massa (timeout di
  collection). Baseline di `@coralyn/web-staff`: **556 test su 64 file**.
- ⚠️ **`git add -A` è vietato**: sweepa i file di lavoro. Aggiungi i path esatti, sempre.
- ⚠️ **Molti file sono CRLF**: un replace che cerca `\n` non matcha nulla. Usa Edit/Write.
- ⚠️ **`Select` di ui-kit è reka-ui, non un `<select>` nativo**: nei test si pilota con
  `selectOption(trigger, label)` da `@/test/utils`, mai con `setValue`.
- ⚠️ **`Button.vue` lega `:disabled="loading || undefined"`**: un `disabled` in fallthrough **lo
  vince**. Ogni `:disabled` scritto su un `Button` che ha anche `:loading` deve includere la
  condizione di pending nella **propria** espressione, come fa `BeachPanel.vue:153`.
- **Messaggi di commit**: `tipo(scope): frase in italiano minuscolo (D-071)`, corpo che dice *perché*,
  e come ultima riga `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` (convenzione del repo,
  27 commit su 30).
- **Nessun merge su `main`.** Il lavoro vive su `feat/sposta-in-pannello-d071`.

---

### Task 1: le due funzioni pure

**Files:**
- Modify: `apps/web-staff/src/features/establishment/umbrellaMove.ts`
- Test: `apps/web-staff/src/features/establishment/umbrellaMove.spec.ts`

**Interfaces:**
- Consumes: `isCompatible(from: SectorKind, to: SectorKind): boolean` — già nel file.
- Produces:
  - `moveTargets(sectors: readonly StructureSectorDTO[], fromKind: SectorKind): { id: string; label: string; sectorName: string }[]`
  - `positionOptions(row: StructureRowDTO, umbrellaId: string): { position: number; beforeLabel: string | null }[]`

- [ ] **Step 1: scrivi i test che falliscono**

In coda a `apps/web-staff/src/features/establishment/umbrellaMove.spec.ts`, e aggiungi
`moveTargets, positionOptions` all'import da `./umbrellaMove` in cima al file:

```ts
describe('moveTargets', () => {
  const misto = (): StructureSectorDTO[] => [
    { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', hasDedicatedRates: false, rows: [
      { id: 'r-1', label: 'F1', sortOrder: 1, umbrellas: [] },
      { id: 'r-2', label: 'F2', sortOrder: 2, umbrellas: [] },
    ] },
    { id: 's-2', name: 'Speciali', sortOrder: 2, kind: 'special', hasDedicatedRates: false, rows: [
      { id: 'r-3', label: 'Palme', sortOrder: 1, umbrellas: [] },
    ] },
    { id: 's-3', name: 'Levante', sortOrder: 3, kind: 'grid', hasDedicatedRates: false, rows: [
      { id: 'r-4', label: 'F4', sortOrder: 1, umbrellas: [] },
    ] },
  ];

  it('offre solo le file dei settori con lo STESSO kind', () => {
    expect(moveTargets(misto(), 'grid').map((t) => t.id)).toEqual(['r-1', 'r-2', 'r-4']);
    expect(moveTargets(misto(), 'special').map((t) => t.id)).toEqual(['r-3']);
  });

  it('porta il nome del settore accanto a quello della fila, senza formattarli', () => {
    expect(moveTargets(misto(), 'special')).toEqual([{ id: 'r-3', label: 'Palme', sectorName: 'Speciali' }]);
  });

  it('un settore senza file non contribuisce nulla', () => {
    const vuoto: StructureSectorDTO[] = [
      { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', hasDedicatedRates: false, rows: [] },
    ];
    expect(moveTargets(vuoto, 'grid')).toEqual([]);
  });
});

describe('positionOptions', () => {
  const umb = (id: string) => ({ id, label: id, umbrellaTypeId: null });
  const row = (ids: string[]): StructureRowDTO => ({ id: 'r-1', label: 'F1', sortOrder: 1, umbrellas: ids.map(umb) });

  // L'esclusione dell'ombrellone che si sposta è ciò che rende il numero prodotto GIÀ il `position`
  // che l'API vuole: l'indice FINALE (ADR-0065 §3), identico dentro la stessa fila e fra file diverse.
  it('nella propria fila: l’ombrellone non compare fra i vicini e le voci sono n', () => {
    expect(positionOptions(row(['A', 'B', 'C']), 'B')).toEqual([
      { position: 0, beforeLabel: 'A' },
      { position: 1, beforeLabel: 'C' },
      { position: 2, beforeLabel: null },
    ]);
  });

  it('in una fila che non lo contiene: n+1 voci, tutti i vicini restano', () => {
    expect(positionOptions(row(['A', 'B']), 'Z')).toEqual([
      { position: 0, beforeLabel: 'A' },
      { position: 1, beforeLabel: 'B' },
      { position: 2, beforeLabel: null },
    ]);
  });

  it('la coda è l’ULTIMA voce: l’elenco legge la fila da testa a coda', () => {
    const opts = positionOptions(row(['A', 'B']), 'Z');
    expect(opts[opts.length - 1].beforeLabel).toBeNull();
  });

  it('fila vuota, e fila col solo ombrellone da spostare: resta la sola coda, position 0', () => {
    expect(positionOptions(row([]), 'Z')).toEqual([{ position: 0, beforeLabel: null }]);
    expect(positionOptions(row(['A']), 'A')).toEqual([{ position: 0, beforeLabel: null }]);
  });

  it('la posizione della coda è sempre pari al numero di vicini rimasti', () => {
    for (const ids of [[], ['A'], ['A', 'B'], ['A', 'B', 'C']]) {
      const opts = positionOptions(row(ids), 'A');
      expect(opts[opts.length - 1].position).toBe(ids.filter((i) => i !== 'A').length);
    }
  });
});
```

- [ ] **Step 2: esegui e verifica che falliscano**

```bash
pnpm --filter @coralyn/web-staff test src/features/establishment/umbrellaMove.spec.ts
```

Atteso: **FAIL** con `moveTargets is not a function` / `positionOptions is not a function` (l'import
non risolve). Se invece fallisce con un errore diverso, fermati e leggi: il file di test non compila.

- [ ] **Step 3: implementa**

In `apps/web-staff/src/features/establishment/umbrellaMove.ts`, estendi l'import della prima riga a
`import type { SectorKind, StructureRowDTO, StructureSectorDTO } from '@coralyn/contracts';` e
aggiungi in coda al file:

```ts
/**
 * Le file su cui uno spostamento è ammesso: quelle di un settore con lo STESSO `kind`
 * (ADR-0065 §4), in ordine d'albero, **compresa la fila di partenza** — senza la quale il riordino
 * dentro la propria fila non esisterebbe.
 *
 * Restituisce dati e non testo: la formattazione «Settore · Fila» resta nel template, come in
 * `BeachPanel.vue` per il ripristino.
 *
 * ⚠️ Non è il gemello di `allRows` di `BeachPanel` e **non va unificata con essa**: `restore` non ha
 * alcuna guardia sul `kind` — `umbrellas.service.ts` chiama solo `assertRow`, che verifica la sola
 * esistenza della fila — quindi quella lista è senza filtro di proposito, ed è fedele al suo server.
 */
export function moveTargets(
  sectors: readonly StructureSectorDTO[],
  fromKind: SectorKind,
): { id: string; label: string; sectorName: string }[] {
  return sectors
    .filter((s) => isCompatible(fromKind, s.kind))
    .flatMap((s) => s.rows.map((r) => ({ id: r.id, label: r.label, sectorName: s.name })));
}

/**
 * Le posizioni offribili nella fila di destinazione, calcolate sulla fila **privata**
 * dell'ombrellone che si sta spostando. Con quell'esclusione il numero prodotto è già il `position`
 * che l'API vuole — l'indice FINALE (ADR-0065 §3) — e vale identico dentro la stessa fila e fra file
 * diverse, senza un ramo che distingua i due casi.
 *
 * `beforeLabel === null` è la coda, ed è l'ULTIMA voce perché l'elenco legge la fila da testa a
 * coda. Esiste sempre: una fila vuota, o che contenga solo l'ombrellone da spostare, produce la sola
 * coda a `position` 0.
 */
export function positionOptions(
  row: StructureRowDTO,
  umbrellaId: string,
): { position: number; beforeLabel: string | null }[] {
  const without = row.umbrellas.filter((u) => u.id !== umbrellaId);
  return [
    ...without.map((u, i) => ({ position: i, beforeLabel: u.label })),
    { position: without.length, beforeLabel: null },
  ];
}
```

- [ ] **Step 4: esegui e verifica che passino**

```bash
pnpm --filter @coralyn/web-staff test src/features/establishment/umbrellaMove.spec.ts
```

Atteso: **PASS**, tutti i test del file.

- [ ] **Step 5: prova per mutazione, nei due versi**

Togli `.filter((s) => isCompatible(fromKind, s.kind))` da `moveTargets` e riesegui: devono
arrossare **2** test (`offre solo le file dei settori con lo STESSO kind` e `porta il nome del
settore accanto a quello della fila`). Rimetti il filtro. Poi cambia `without.length` in
`row.umbrellas.length` nell'ultima voce di `positionOptions` e riesegui: devono arrossare **3** test.
Rimetti.

⚠️ **Se una mutazione NON arrossa, il presidio non c'è**: non proseguire, scrivi il caso che dovrebbe
arrossare.

- [ ] **Step 6: commit**

```bash
git add apps/web-staff/src/features/establishment/umbrellaMove.ts apps/web-staff/src/features/establishment/umbrellaMove.spec.ts
```

Messaggio: `feat(web-staff): le destinazioni compatibili e le posizioni offribili, come funzioni pure (D-071)`.

---

### Task 2: il controllo nel pannello e il suo inoltro

**Files:**
- Modify: `apps/web-staff/src/features/establishment/panels/UmbrellaPanel.vue`
- Modify: `apps/web-staff/src/features/establishment/InspectorPanels.vue`
- Modify: `apps/web-staff/src/features/establishment/panels/form-sync.spec.ts:21-24`
- Create: `apps/web-staff/src/features/establishment/panels/UmbrellaPanel.move.spec.ts`

**Interfaces:**
- Consumes: `moveTargets`, `positionOptions` (Task 1).
- Produces:
  - props di `UmbrellaPanel`: `{ umbrella: StructureUmbrellaDTO; row: StructureRowDTO; sector: StructureSectorDTO; sectors: StructureSectorDTO[]; types: UmbrellaTypeDTO[]; canManage: boolean; movePending: boolean }` — `rowLabel` e `sectorName` **spariscono**.
  - emit di `UmbrellaPanel`: `move: [rowId: string, position: number]`.
  - props di `InspectorPanels`: aggiunge `movePending: boolean`.
  - emit di `InspectorPanels`: `'move-umbrella': [umbrellaId: string, rowId: string, position: number]` — **stessa firma di `StructureScene.vue:28`**.

- [ ] **Step 1: scrivi il test che fallisce**

Crea `apps/web-staff/src/features/establishment/panels/UmbrellaPanel.move.spec.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises, enableAutoUnmount } from '@vue/test-utils';
import type { StructureRowDTO, StructureSectorDTO } from '@coralyn/contracts';
import { mountApp, selectOption } from '@/test/utils';
import UmbrellaPanel from './UmbrellaPanel.vue';

enableAutoUnmount(afterEach);

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { await flushPromises(); await tick(); await flushPromises(); };
const umb = (id: string) => ({ id, label: id, umbrellaTypeId: null });

// Fixture inline, come fanno le cinque spec sorelle della struttura: STRUCTURE_FIXTURE ha una fila
// sola e due spec ne asseriscono i contatori, quindi estenderla arrosserebbe test estranei.
const SECTORS: StructureSectorDTO[] = [
  { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', hasDedicatedRates: false, rows: [
    { id: 'r-1', label: 'F1', sortOrder: 1, umbrellas: [umb('A'), umb('B'), umb('C')] },
    { id: 'r-2', label: 'F2', sortOrder: 2, umbrellas: [umb('D')] },
  ] },
  { id: 's-2', name: 'Speciali', sortOrder: 2, kind: 'special', hasDedicatedRates: false, rows: [
    { id: 'r-3', label: 'Palme', sortOrder: 1, umbrellas: [] },
  ] },
];
const row = (id: string): StructureRowDTO => SECTORS.flatMap((s) => s.rows).find((r) => r.id === id)!;

async function panel(props: Record<string, unknown> = {}) {
  const w = mountApp(UmbrellaPanel, { props: {
    umbrella: umb('B'), row: row('r-1'), sector: SECTORS[0], sectors: SECTORS,
    types: [], canManage: true, movePending: false, ...props,
  }, attachTo: document.body });
  await settle();
  return w;
}

describe('UmbrellaPanel — «Sposta in…» (D-071)', () => {
  it('offre le file compatibili, la propria compresa, e NON quelle di un kind diverso', async () => {
    const w = await panel();
    await selectOption(w.get('[data-testid="umbrella-move-row"]'), 'Centro · F2');
    // «Speciali · Palme» non è fra le opzioni: selezionarla lancia, ed è l'asserzione.
    await expect(selectOption(w.get('[data-testid="umbrella-move-row"]'), 'Speciali · Palme'))
      .rejects.toThrow('non trovata');
    w.unmount();
  });

  it('all’apertura mostra dove l’ombrellone È, e il bottone è spento', async () => {
    const w = await panel();
    expect(w.get('[data-testid="umbrella-move-row"]').text()).toContain('Centro · F1');
    expect(w.get('[data-testid="umbrella-move-position"]').text()).toContain('Prima di «C»');
    expect((w.get('[data-testid="umbrella-move-submit"]').element as HTMLButtonElement).disabled).toBe(true);
    w.unmount();
  });

  it('riordino DENTRO la propria fila: emette l’indice FINALE, senza contare sé stesso', async () => {
    const w = await panel();
    await selectOption(w.get('[data-testid="umbrella-move-position"]'), 'In coda');
    await w.get('[data-testid="umbrella-move-submit"]').trigger('click');
    // `senza` = [A, C]; la coda è 2, non 3.
    expect(w.emitted('move')).toEqual([['r-1', 2]]);
    w.unmount();
  });

  it('cambiando fila la posizione torna in coda, e l’emit porta la fila nuova', async () => {
    const w = await panel();
    await selectOption(w.get('[data-testid="umbrella-move-row"]'), 'Centro · F2');
    expect(w.get('[data-testid="umbrella-move-position"]').text()).toContain('In coda');
    await w.get('[data-testid="umbrella-move-submit"]').trigger('click');
    expect(w.emitted('move')).toEqual([['r-2', 1]]); // r-2 contiene solo D: la coda è 1
    w.unmount();
  });

  it('una posizione uscita dall’intervallo dopo una rilettura ricade sulla coda, e sulla coda NUOVA', async () => {
    const w = await panel();
    await selectOption(w.get('[data-testid="umbrella-move-position"]'), 'In coda'); // position 2, «senza» = [A, C]
    // Rilettura: la fila si è accorciata sotto i piedi. I pannelli non sono key-ati e ricevono
    // props nuove a ogni invalidazione (form-sync.spec.ts:15-18).
    const magra: StructureRowDTO = { id: 'r-1', label: 'F1', sortOrder: 1, umbrellas: [umb('B'), umb('C')] };
    await w.setProps({ row: magra, sectors: [{ ...SECTORS[0], rows: [magra, row('r-2')] }, SECTORS[1]] });
    await settle();
    await w.get('[data-testid="umbrella-move-submit"]').trigger('click');
    // ⚠️ L'asserzione è sull'EMIT e non sul testo: «In coda» si legge identico sia che il valore
    // memorizzato sia stato trovato, sia che ci si sia ricaduti sopra — un'asserzione sul testo
    // passerebbe per la ragione sbagliata. «senza» è ora [C], quindi la coda vale 1: senza il
    // ripiego partirebbe il 2 memorizzato e il server risponderebbe 422.
    expect(w.emitted('move')).toEqual([['r-1', 1]]);
    w.unmount();
  });

  it('senza permesso di gestione il controllo non si rende affatto', async () => {
    const w = await panel({ canManage: false });
    expect(w.find('[data-testid="umbrella-move"]').exists()).toBe(false);
    w.unmount();
  });

  it('mentre una scrittura è in volo il bottone resta spento, anche se la scelta è cambiata', async () => {
    const w = await panel({ movePending: true });
    await selectOption(w.get('[data-testid="umbrella-move-position"]'), 'In coda');
    expect((w.get('[data-testid="umbrella-move-submit"]').element as HTMLButtonElement).disabled).toBe(true);
    w.unmount();
  });
});
```

- [ ] **Step 2: esegui e verifica che fallisca**

```bash
pnpm --filter @coralyn/web-staff test src/features/establishment/panels/UmbrellaPanel.move.spec.ts
```

Atteso: **FAIL** — il pannello non ha `[data-testid="umbrella-move-row"]`, quindi `w.get` lancia
`Unable to get [data-testid="umbrella-move-row"]`.

- [ ] **Step 3: cambia le props e aggiungi il controllo al pannello**

In `apps/web-staff/src/features/establishment/panels/UmbrellaPanel.vue`, sostituisci il blocco
`<script setup>` con:

```ts
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
  /** `isPending` della mutation, che vive nella shell: serve solo a non far partire due scritture
   *  con un doppio clic, perché fino alla rilettura la scelta a schermo resta quella di prima. */
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
// esemplare solo — un secondo gemello divergerebbe in silenzio, come già successo nella review
// avversariale di D-038.

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
```

Nel template, sostituisci la riga dell'intestazione che legge `sectorName`/`rowLabel`:

```html
<div class="mt-0.5 text-[11.5px] font-semibold text-[var(--color-text-muted)]">Settore {{ sector.name }} · {{ row.label }}</div>
```

e inserisci il blocco nuovo **fra** il paragrafo «Maiusc+clic su altre celle per agire in blocco» e
il `<div>` della «Zona rischiosa»:

```html
<div v-if="canManage" data-testid="umbrella-move" class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-row)] p-3">
  <p class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Sposta</p>
  <Field label="Fila di destinazione">
    <Select v-model="targetRowId" data-testid="umbrella-move-row">
      <Option v-for="t in targets" :key="t.id" :value="t.id">{{ t.sectorName }} · {{ t.label }}</Option>
    </Select>
  </Field>
  <Field label="Posizione">
    <Select :model-value="position" data-testid="umbrella-move-position"
      @update:model-value="(v: string | undefined) => { if (v !== undefined) positionRef = v; }">
      <Option v-for="p in positions" :key="p.position" :value="String(p.position)">
        {{ p.beforeLabel === null ? 'In coda' : `Prima di «${p.beforeLabel}»` }}
      </Option>
    </Select>
  </Field>
  <Button size="sm" data-testid="umbrella-move-submit" :disabled="moveIsNoop || movePending"
    :loading="movePending" @click="onMove">Sposta</Button>
  <p class="text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">Solo le file dei settori dello stesso tipo: un ombrellone di griglia non va fra gli speciali.</p>
</div>
```

⚠️ `:disabled` include `movePending` di proposito: senza, il `disabled` in fallthrough vincerebbe sul
`:disabled="loading || undefined"` interno di `Button.vue` e il bottone resterebbe cliccabile durante
la scrittura. È lo stesso accorgimento di `BeachPanel.vue:153`.

- [ ] **Step 4: aggiorna i due chiamanti**

In `apps/web-staff/src/features/establishment/InspectorPanels.vue`, aggiungi `movePending: boolean;`
alle props, assegna il risultato di `defineProps` a `const props`, estendi gli emit e aggiungi il
gestore:

```ts
const props = defineProps<{
  data: EstablishmentStructureDTO;
  selection: Selection;
  canManage: boolean;
  movePending: boolean;
  selectedSector: StructureSectorDTO | null;
  selectedRow: { row: StructureRowDTO; sector: StructureSectorDTO } | null;
  selectedUmbrella: ReturnType<typeof findUmbrella>;
  createRowSector: StructureSectorDTO | null;
  createUmbrellaRow: StructureRowDTO | null;
  multiLabels: string[];
}>();
const emit = defineEmits<{
  close: [];
  created: [id: string];
  /** Stessa firma di `StructureScene.vue`, così la shell aggancia i due canali allo stesso handler. */
  'move-umbrella': [umbrellaId: string, rowId: string, position: number];
}>();

function onUmbrellaMove(rowId: string, position: number): void {
  if (props.selectedUmbrella) emit('move-umbrella', props.selectedUmbrella.umbrella.id, rowId, position);
}
```

e sostituisci la riga di `UmbrellaPanel` nel template con:

```html
<UmbrellaPanel v-else-if="selection.kind === 'umbrella' && selectedUmbrella" :umbrella="selectedUmbrella.umbrella" :row="selectedUmbrella.row" :sector="selectedUmbrella.sector" :sectors="data.sectors" :types="data.umbrellaTypes" :can-manage="canManage" :move-pending="movePending" @close="emit('close')" @move="onUmbrellaMove" />
```

In `apps/web-staff/src/features/establishment/panels/form-sync.spec.ts`, sostituisci le props del
montaggio di `UmbrellaPanel` (righe 21-24) con:

```ts
    const ROW = { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [{ id: 'u-1', label: 'A1', umbrellaTypeId: null }] };
    const SECTOR = { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid' as const, hasDedicatedRates: false, rows: [ROW] };
    const w = mountApp(UmbrellaPanel, { props: {
      umbrella: { id: 'u-1', label: 'A1', umbrellaTypeId: null },
      row: ROW, sector: SECTOR, sectors: [SECTOR], types: TYPES, canManage: true, movePending: false,
    } });
```

- [ ] **Step 5: esegui i tre file e verifica che passino**

```bash
pnpm --filter @coralyn/web-staff test src/features/establishment/panels
```

Atteso: **PASS** su `UmbrellaPanel.move.spec.ts`, `form-sync.spec.ts`, `BeachPanel.restore.spec.ts`,
`RowPanel.focus.spec.ts`.

- [ ] **Step 6: typecheck**

```bash
pnpm --filter @coralyn/web-staff typecheck
```

Atteso: nessun errore. Se `EstablishmentStructureView.vue` protesta per `movePending` mancante su
`InspectorPanels`, è **atteso** e si chiude nel Task 3 — ma allora esegui prima il Task 3 e committa
i due insieme, perché un commit che non typechecka non si consegna.

- [ ] **Step 7: commit**

```bash
git add apps/web-staff/src/features/establishment/panels/UmbrellaPanel.vue apps/web-staff/src/features/establishment/panels/UmbrellaPanel.move.spec.ts apps/web-staff/src/features/establishment/panels/form-sync.spec.ts apps/web-staff/src/features/establishment/InspectorPanels.vue
```

Messaggio: `feat(web-staff): il controllo «Sposta» nel pannello ombrellone, che emette invece di scrivere (D-071)`.

---

### Task 3: il collegamento nella shell

**Files:**
- Modify: `apps/web-staff/src/features/establishment/EstablishmentStructureView.vue`
- Test: `apps/web-staff/src/features/establishment/EstablishmentStructureView.spec.ts`

**Interfaces:**
- Consumes: l'emit `move-umbrella` di `InspectorPanels` (Task 2) e quello omonimo di `StructureScene`.
- Produces: `requestMove(umbrellaId: string, rowId: string, position: number, notify: boolean): void`
  e `submitMove(vars: { id: string } & MoveUmbrellaInput, notify: boolean): void`.

⚠️ **`InspectorPanels` è montato DUE volte** — l'`<aside>` desktop e il ramo `Drawer`. Il commento a
`InspectorPanels.vue:13-15` registra che «il ramo Drawer dimenticato» è già stato un difetto reale.
**Entrambi** vanno collegati, o il canale nuovo è morto esattamente dove serve di più.

- [ ] **Step 1: scrivi i test che falliscono**

In coda a `apps/web-staff/src/features/establishment/EstablishmentStructureView.spec.ts`, dentro un
`describe` nuovo:

```ts
describe('EstablishmentStructureView — «Sposta» dal pannello (D-071)', () => {
  // Fixture inline: STRUCTURE_FIXTURE ha una fila sola e due spec ne asseriscono i contatori.
  const umb = (id: string, label: string) => ({ id, label, umbrellaTypeId: null });
  const ALBERO = {
    sectors: [
      { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid' as const, hasDedicatedRates: true, rows: [
        { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [umb('u-1', 'A1'), umb('u-2', 'A2')] },
      ] },
      { id: 's-2', name: 'Levante', sortOrder: 2, kind: 'grid' as const, hasDedicatedRates: false, rows: [
        { id: 'r-2', label: 'Fila 2', sortOrder: 1, umbrellas: [] },
      ] },
    ],
    umbrellaTypes: [],
  };

  async function shell() {
    let posted: unknown = null;
    server.use(
      http.get('/api/establishment/structure', () => HttpResponse.json(ALBERO)),
      http.post('/api/establishment/umbrellas/:id/move', async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ id: 'u-1', label: 'A1', umbrellaTypeId: null });
      }),
    );
    const w = mountApp(EstablishmentStructureView);
    useSessionStore().user = { id: 'a-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
    await settle();
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await settle();
    return { w, posted: () => posted };
  }

  it('riordino dentro la fila: scrive senza chiedere nulla, e notifica', async () => {
    const { w, posted } = await shell();
    await selectOption(w.get('[data-testid="umbrella-move-position"]'), 'In coda');
    await w.get('[data-testid="umbrella-move-submit"]').trigger('click');
    await settle();
    expect(posted()).toEqual({ rowId: 'r-1', position: 1 });
    expect(document.body.textContent).not.toContain('Il prezzo dei rinnovi cambierà base');
    const { useToasts } = await import('@coralyn/ui-kit');
    expect(useToasts().items.some((t) => t.message.includes('Ombrellone spostato'))).toBe(true);
    w.unmount();
  });

  it('attraversando un confine di settore con tariffe dedicate riusa la disclosure, e NON scrive', async () => {
    const { w, posted } = await shell();
    await selectOption(w.get('[data-testid="umbrella-move-row"]'), 'Levante · Fila 2');
    await w.get('[data-testid="umbrella-move-submit"]').trigger('click');
    await settle();
    expect(posted()).toBeNull();
    expect(document.body.textContent).toContain('Il prezzo dei rinnovi cambierà base');
    expect(document.body.textContent).toContain('il listino generale'); // esce da Centro, che le ha
    w.unmount();
  });

  it('confermando la disclosure, la scrittura parte con la fila e la posizione scelte', async () => {
    const { w, posted } = await shell();
    await selectOption(w.get('[data-testid="umbrella-move-row"]'), 'Levante · Fila 2');
    await w.get('[data-testid="umbrella-move-submit"]').trigger('click');
    await settle();
    const confirm = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Sposta comunque'))!;
    confirm.click();
    await settle();
    expect(posted()).toEqual({ rowId: 'r-2', position: 0 });
    w.unmount();
  });

  it('il trascinamento NON notifica: la cella si è già mossa sotto gli occhi', async () => {
    const { w, posted } = await shell();
    w.findComponent(StructureScene).vm.$emit('move-umbrella', 'u-1', 'r-1', 1);
    await settle();
    expect(posted()).toEqual({ rowId: 'r-1', position: 1 });
    const { useToasts } = await import('@coralyn/ui-kit');
    expect(useToasts().items.some((t) => t.message.includes('Ombrellone spostato'))).toBe(false);
    w.unmount();
  });
});
```

La coda dei toast è **module-scope e condivisa** (`packages/ui-kit/src/toasts.ts`), quindi il test
che asserisce l'assenza del toast vedrebbe quello del test precedente — ma
`apps/web-staff/src/test/setup.ts:6` chiama già `clearToasts()` in un `beforeEach` **globale**, e la
coda arriva pulita a ogni test. **Non aggiungere una seconda pulizia**: verificato, non supposto.

- [ ] **Step 2: esegui e verifica che falliscano**

```bash
pnpm --filter @coralyn/web-staff test src/features/establishment/EstablishmentStructureView.spec.ts
```

Atteso: **FAIL** — `[data-testid="umbrella-move-position"]` non è nel DOM finché la shell non passa
`:move-pending` e non ascolta `@move-umbrella` sull'ispettore.

- [ ] **Step 3: implementa nella shell**

In `apps/web-staff/src/features/establishment/EstablishmentStructureView.vue`:

Aggiungi `pushToast` all'import da `@coralyn/ui-kit`.

Sostituisci `submitMove` con:

```ts
function submitMove(vars: { id: string } & MoveUmbrellaInput, notify: boolean): void {
  treeAtWrite.value = null;
  moveUmbrella.mutate(vars, {
    onSuccess: () => {
      treeAtWrite.value = dataUpdatedAt.value;
      // Solo il percorso del pannello notifica. Sotto `lg` la scena è dietro lo scrim del Drawer,
      // quindi l'anteprima ottimistica non si vede e senza toast non ci sarebbe riscontro; il
      // trascinamento invece la cella l'ha già mossa, e un toast per gesto sarebbe rumore.
      if (notify) pushToast('Ombrellone spostato.');
    },
  });
}
```

Aggiungi `notify: boolean` al tipo di `pendingMove`, e sostituisci `onMoveUmbrella`/`confirmMove` con:

```ts
function requestMove(umbrellaId: string, rowId: string, position: number, notify: boolean): void {
  const origin = data.value ? findUmbrella(data.value, umbrellaId) : null;
  const destination = data.value?.sectors.find((s) => s.rows.some((r) => r.id === rowId)) ?? null;
  if (origin && destination && origin.sector.id !== destination.id
    && (origin.sector.hasDedicatedRates || destination.hasDedicatedRates)) {
    pendingMove.value = {
      umbrellaId, label: origin.umbrella.label, rowId, position, notify,
      from: origin.sector.name, to: destination.name, toHasDedicatedRates: destination.hasDedicatedRates,
    };
    return;
  }
  submitMove({ id: umbrellaId, rowId, position }, notify);
}

function confirmMove(): void {
  const pending = pendingMove.value;
  if (!pending) return;
  pendingMove.value = null;
  submitMove({ id: pending.umbrellaId, rowId: pending.rowId, position: pending.position }, pending.notify);
}
```

Nel template, sulla `StructureScene` sostituisci `@move-umbrella="onMoveUmbrella"` con:

```html
@move-umbrella="(id: string, rid: string, pos: number) => requestMove(id, rid, pos, false)"
```

e su **entrambe** le `InspectorPanels` — quella dentro `<aside v-if="isDesktop">` e quella dentro
`<Drawer v-else>` — aggiungi gli stessi due attributi:

```html
:move-pending="moveUmbrella.isPending.value"
@move-umbrella="(id: string, rid: string, pos: number) => requestMove(id, rid, pos, true)"
```

- [ ] **Step 4: esegui e verifica che passino**

```bash
pnpm --filter @coralyn/web-staff test src/features/establishment/EstablishmentStructureView.spec.ts
```

Atteso: **PASS**.

- [ ] **Step 5: prova per mutazione che il ramo Drawer è davvero collegato**

Togli `@move-umbrella` **solo** dalla `InspectorPanels` dentro `<Drawer v-else>` e riesegui la suite
intera del pacchetto. ⚠️ **Se nessun test arrossa, la copertura del ramo Drawer non esiste**: scrivi
il caso che dovrebbe arrossare — un test che stubba `matchMedia` con `matches: false` (il pattern è a
`EstablishmentStructureView.spec.ts:285`), seleziona una cella, e asserisce che il click su
`[data-testid="umbrella-move-submit"]` produca il POST. Poi rimetti l'attributo.

- [ ] **Step 6: suite intera, typecheck e lint**

```bash
pnpm --filter @coralyn/web-staff test
```

Atteso: **almeno 556 test su 64+ file**, tutti verdi. I nuovi si sommano: se il totale è *sceso*,
qualcosa non viene più raccolto.

```bash
pnpm --filter @coralyn/web-staff typecheck
pnpm run lint
```

Atteso: typecheck pulito; lint **0 errori** (87 warning è la baseline, non sono un rosso).

- [ ] **Step 7: commit**

```bash
git add apps/web-staff/src/features/establishment/EstablishmentStructureView.vue apps/web-staff/src/features/establishment/EstablishmentStructureView.spec.ts
```

Messaggio: `feat(web-staff): i due canali dello spostamento nello stesso ingresso, e il toast solo dove serve (D-071)`.

---

### Task 4: i documenti

**Files:**
- Create: `docs/architecture/decisions/0066-sposta-in-pannello-ombrellone.md`
- Modify: `docs/architecture/deferred.md` (riga di riepilogo, riga d'indice di D-071, la voce)
- Modify: `docs/architecture/README.md` (indice degli ADR)

**Interfaces:** nessuna. È il gate documentale.

- [ ] **Step 1: scrivi ADR-0066**

Struttura obbligatoria, copiata da ADR-0065 (che è il modello più vicino):

```markdown
# ADR-0066: <titolo che dice la decisione, non l'argomento>

- **Status:** Accepted
- **Data:** 2026-07-31
- **Decisori:** Team di progetto
- **Non supera nulla:** [ADR-0065](0065-riordino-ombrellone-per-trascinamento.md) resta valido
- **ADR correlati:** [ADR-0052](0052-editor-struttura-cantiere.md), [ADR-0063](0063-permessi-staff-configurabili-per-operatore.md)
- **Chiude:** [D-071](../deferred.md#d-071)

## Context
## Decision
## Consequences
### Positive
### Negative / Trade-off
### Neutre / Note
## Alternatives considered
## Rubric check
```

⚠️ **Verifica che ognuno di quei path esista prima di scriverlo** (`ls docs/architecture/decisions/`):
nella sessione 15 il gate ha preso un link a un ADR **inventato**, dentro il documento che
raccontava come si estirpano i testi falsi.

Il corpo deve contenere, come minimo: la causa radice
riverificata alla sorgente (§3 della spec, comprese le tre coordinate `reka-ui`), le due decisioni
prese con l'utente (resa a ogni larghezza; fila **e** posizione), il riuso dell'ingresso unico, la
misura per cui `moveTargets` non unifica `allRows` (`restore` non ha guardia sul `kind`), i due
vincoli del `Select` (solo stringhe; props nuove a ogni rilettura), e in `Consequences` il costo
dichiarato del secondo `Select` su una fila lunga.

⚠️ **Deve dichiarare esplicitamente che la decisione 5 di ADR-0065 non è riaperta.**

⚠️ In `Alternatives considered` va registrato **«solo la fila, coda implicita»** — scartata perché
chiuderebbe D-071 a metà — e **«il controllo solo sotto `lg`»**, scartata perché lascerebbe `lg+`
senza equivalente da tastiera e sarebbe la terza cosa agganciata alla soglia dei 1024 px.

- [ ] **Step 2: chiudi D-071 nel registro**

Tre modifiche in `docs/architecture/deferred.md`, tutte necessarie — il parser le verifica:

1. Riga 25: `**Aperte: 45** · **Chiuse: 28** · totale 73.` → `**Aperte: 44** · **Chiuse: 29** · totale 73.`
2. Riga 98 (indice): `| [D-071](#d-071) | Sotto \`lg\` il riordino non esiste: tablet e telefono restano scoperti | 🔓 aperta |` → stessa riga con `| ✅ chiusa |`. ⚠️ **Il tema deve restare identico**: il parser confronta indice e voci, e un titolo cambiato in un posto solo è un rosso.
3. Sposta l'intera riga della voce `<a id="d-071"></a>D-071` dalla tabella sotto `## Aperte` alla
   tabella sotto `## Chiuse` (stesse cinque colonne), e aggiungi in coda alla cella «Perché
   rimandata» una frase di chiusura che contenga la parola **`CHIUSA`** in maiuscolo — `CLOSURE_MARKERS`
   è **case-sensitive** — con il riferimento all'ADR, per esempio:
   «**Aggiornamento 2026-07-31: CHIUSA da [ADR-0066](decisions/0066-sposta-in-pannello-ombrellone.md)**
   — il controllo «Sposta» nel pannello ombrellone dà un secondo canale che non dipende dal puntatore,
   reso a ogni larghezza; il trascinamento resta `lg+` e non è stato esteso.»

- [ ] **Step 3: aggiungi ADR-0066 all'indice**

In `docs/architecture/README.md`, aggiungi la riga `- [ADR-0066]…` dopo quella di ADR-0065.
⚠️ **Quell'indice non ha alcun presidio ed è già andato indietro quattro volte** ([D-069](../../architecture/deferred.md#d-069)):
va fatto a mano e verificato a occhio.

- [ ] **Step 4: aggiungi i file nuovi PRIMA di eseguire il gate**

```bash
git add docs/architecture/decisions/0066-sposta-in-pannello-ombrellone.md docs/architecture/deferred.md docs/architecture/README.md
```

⚠️ Il gate dei link giudica su `git ls-files`: un ADR non ancora aggiunto risulta **inesistente** a
chi lo linka, e il gate diventa rosso sul documento che lo cita. E **verifica ogni path prima di
scriverlo**: nella sessione 15 il gate ha preso un link a un ADR inventato.

- [ ] **Step 5: esegui il gate**

```bash
pnpm --filter @coralyn/docs-lint test
```

Atteso: **68 test su 5 file**, verdi. Se arrossa `i totali dichiarati in testa coincidono con
l'indice`, hai saltato la modifica 1 dello Step 2; se arrossa `l'indice e le voci coincidono, ID per
ID e stato per stato`, hai spostato la voce senza cambiare l'indice (o viceversa).

- [ ] **Step 6: commit**

Messaggio: `docs: ADR-0066, e D-071 chiusa — tablet e telefono non sono più scoperti (D-071)`.

---

## Verifica finale, prima di proporre il merge

- [ ] `pnpm --filter @coralyn/web-staff test` → ≥ 556, verde
- [ ] `pnpm --filter @coralyn/docs-lint test` → 68 (5)
- [ ] `pnpm run typecheck` → 9 progetti
- [ ] `pnpm run lint` → 0 errori
- [ ] `git diff --numstat` su `packages/contracts/dist` → **vuoto**. Se compare modificato con diff
      vuoto è rumore CRLF: `git checkout -- packages/contracts/dist`. Questa slice **non** tocca
      `contracts/src`, quindi un diff reale lì dentro è un errore da capire, non da scartare.
- [ ] `git status --short` → nessun file di lavoro non voluto fra quelli aggiunti
- [ ] **Review avversariale** — tre passaggi distinti (API, frontend, documenti), ognuno con quattro
      lenti e un confutatore ostile per finding, verdetto a **tre** valori, più una **review finale
      d'insieme**. ⏱️ ~20 minuti a passaggio: **chiedere il via all'utente**, costa token.
- [ ] **Prova visiva sotto 1024 px**, chiesta all'utente: l'agente non può autenticarsi in `web-staff`.
      È l'unica prova che il canale nuovo funzioni davvero dove esiste per funzionare — `jsdom` non
      monta alcun Drawer reale né calcola alcuna cascata.

## Fuori scope, da riportare all'utente a lavoro finito

- **L'asimmetria `move`/`restore` sul `kind`**: `move` risponde 422 al salto di `kind`, `restore` lo
  consente in silenzio (`umbrellas.service.ts`, `assertRow` verifica la sola esistenza della fila).
  Preesistente, non causata da questa slice. Merita una voce propria, non una correzione di straforo.
