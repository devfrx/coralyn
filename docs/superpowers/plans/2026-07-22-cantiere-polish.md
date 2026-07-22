# Cantiere polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere i minor triati dalla review finale dell'editor Cantiere (chip task_60fa4a39): count reale nel bulk-delete, dedup aside/Drawer via `InspectorPanels`, MultiPanel admin-gated + test sentinel, form sincronizzati per id, copy cap interpolata, pattern tastiera APG sui tab settori.

**Architecture:** Nessuna scelta nuova: sono correzioni puntuali dentro l'architettura di ADR-0052 (shell + scena + ispettore a pannelli). L'unico refactor è l'estrazione del ramo v-if dei pannelli in un componente `InspectorPanels.vue` montato sia nell'aside desktop che nel Drawer mobile — elimina alla radice la classe di bug «ramo Drawer dimenticato» (già morso due volte).

**Tech Stack:** NestJS + Prisma (api, jest), Vue 3 + vue-query + reka-ui (web-staff, vitest + vue-test-utils + msw).

**Fuori scope (già risolto):** il nit doc §14.4 del chip è stato chiuso dal commit `6687f55` (design-system §14.4 ora distingue i toast RowPanel/MultiPanel). Verificato sul file: nessuna azione.

## Global Constraints

- **Suite SEMPRE in sequenza, mai in parallelo** (falsi rossi massicci su questo host). Dopo ogni task: l'INTERA suite del pacchetto toccato, mai il solo spec (`npx vitest run` da `apps/web-staff` include ui-kit; `npx jest` da `apps/api`).
- **e2e**: girano contro il DB `coralyn-db` su `127.0.0.1:5433` — se falliscono TUTTE in connessione, Docker Desktop è giù. Le 3 suite rosse bookings/customer-bookings/subscription-cession sono un time-bomb di date PRE-esistente (chip separato): NON toccarle, NON contarle come regressione.
- **Styling**: solo token semantici e primitivi ui-kit — niente hex fuori da `theme.css`, niente estetica nuova. Non esiste tema dark.
- `:disabled` esterno su `Button` sempre in OR col pending (`:disabled="cond || m.isPending.value"`).
- Spec che montano viste con listener su `window`: `enableAutoUnmount(afterEach)` obbligatorio.
- Copy UI in italiano, coerente con l'esistente.
- Commit: messaggi in italiano stile repo (`fix(web-staff): …`), trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- File scratch di sessione in `.superpowers/sdd/` prefissati `task-sd-N-*`; ledger `.superpowers/sdd/progress.md` da APPENDERE, mai sovrascrivere.

---

### Task 1: API — `bulkDelete` riporta il count reale di `deleteMany`

La review finale (Minor #3) ha rilevato che `bulkDelete` risponde `deleted: deletable.length`, cioè il conteggio *pianificato*, non quello *eseguito*: se un id viene eliminato da una richiesta concorrente tra la `findMany` e la `deleteMany` (read-committed: il commit altrui è visibile a metà transazione), il client riceve una sovrastima. `deleteMany` di Prisma restituisce `{ count }` — va usato quello (come già fa `bulkAssignType` con `updateMany`).

**Files:**
- Modify: `apps/api/src/establishment/umbrellas.service.ts` (metodo `bulkDelete`, ~righe 111-122)
- Test: `apps/api/src/establishment/umbrellas.service.spec.ts` (describe `bulkDelete`, ~riga 128)

**Interfaces:**
- Consumes: nulla dagli altri task.
- Produces: `bulkDelete(input): Promise<BulkDeleteUmbrellasResultDTO>` — contratto `{ deleted, skipped }` invariato, cambia solo la fonte di `deleted`. Nessun altro task dipende da questo.

- [ ] **Step 1: Scrivi il test che fallisce**

Nel describe `bulkDelete` di `umbrellas.service.spec.ts`, dopo il test «nessun eliminabile», aggiungi:

```ts
it('deleted riflette il count reale di deleteMany: id spariti sotto race → saltati, non sovrastimati', async () => {
  const { service, tx } = makeService();
  tx.umbrella.findMany.mockResolvedValue([{ id: 'u-1' }, { id: 'u-2' }]);
  tx.booking.groupBy.mockResolvedValue([]);
  // u-2 eliminato da una richiesta concorrente tra findMany e deleteMany: il DB ne cancella 1 solo.
  tx.umbrella.deleteMany.mockResolvedValue({ count: 1 });
  const res = await service.bulkDelete({ ids: ['u-1', 'u-2'] });
  expect(res).toEqual({ deleted: 1, skipped: 1 });
});
```

- [ ] **Step 2: Verifica che fallisca**

Da `apps/api`: `npx jest umbrellas.service`
Atteso: FAIL — il nuovo test riceve `{ deleted: 2, skipped: 0 }`.

- [ ] **Step 3: Implementa**

In `umbrellas.service.ts`, sostituisci le due righe finali di `bulkDelete`:

```ts
// prima:
      if (deletable.length > 0) await tx.umbrella.deleteMany({ where: { id: { in: deletable } } });
      return { deleted: deletable.length, skipped: input.ids.length - deletable.length };
// dopo:
      let deleted = 0;
      if (deletable.length > 0) {
        const res = await tx.umbrella.deleteMany({ where: { id: { in: deletable } } });
        deleted = res.count;
      }
      return { deleted, skipped: input.ids.length - deleted };
```

Nota: la guardia `deletable.length > 0` resta (il test esistente asserisce che `deleteMany` NON venga chiamata a lista vuota).

- [ ] **Step 4: Verifica che passi + suite intera**

Da `apps/api`, in sequenza: `npx jest umbrellas.service` (verde, 3 test bulkDelete) poi `npx jest`.
Atteso: 255/255 (254 esistenti + 1 nuovo), zero regressioni.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/establishment/umbrellas.service.ts apps/api/src/establishment/umbrellas.service.spec.ts
git commit -m "fix(api): bulk-delete riporta il count reale di deleteMany, non il pianificato"
```

---

### Task 2: web-staff — estrazione `InspectorPanels` (dedup aside/Drawer)

Il ramo v-if degli 8 pannelli è duplicato riga-per-riga tra aside desktop e Drawer mobile in `EstablishmentStructureView.vue` — il «ramo Drawer dimenticato» è già stato un Important in review. L'estrazione in un componente unico elimina la classe di bug. Refactor puro: **nessun nuovo test** — la guardia sono i test esistenti, inclusi i 3 regression mobile (fila/ombrellone/multi) che verificano proprio il ramo Drawer.

La risoluzione per-id (selectedSector/Row/Umbrella, multiLabels, createRowSector/createUmbrellaRow) RESTA nella shell: serve anche ai watch di fallback-a-Spiaggia. `InspectorPanels` riceve i valori già risolti come props.

**Files:**
- Create: `apps/web-staff/src/features/establishment/InspectorPanels.vue`
- Modify: `apps/web-staff/src/features/establishment/EstablishmentStructureView.vue` (import, rami aside+Drawer)
- Modify: `docs/design/design-system.md` (§14.6, elenco scomposizione FE)

**Interfaces:**
- Consumes: `Selection` e `findUmbrella` da `./structureSelection`; gli 8 pannelli da `./panels/`.
- Produces: componente `InspectorPanels` con props `{ data: EstablishmentStructureDTO; selection: Selection; isAdmin: boolean; selectedSector: StructureSectorDTO | null; selectedRow: { row: StructureRowDTO; sector: StructureSectorDTO } | null; selectedUmbrella: ReturnType<typeof findUmbrella>; createRowSector: StructureSectorDTO | null; createUmbrellaRow: StructureRowDTO | null; multiLabels: string[] }` ed emits `{ close: []; created: [id: string] }`. Il Task 3 aggiunge `:is-admin` alla riga `MultiPanel` DENTRO questo componente.

- [ ] **Step 1: Crea `InspectorPanels.vue`**

```vue
<script setup lang="ts">
import type { EstablishmentStructureDTO, StructureRowDTO, StructureSectorDTO } from '@coralyn/contracts';
import BeachPanel from './panels/BeachPanel.vue';
import SectorPanel from './panels/SectorPanel.vue';
import SectorCreatePanel from './panels/SectorCreatePanel.vue';
import RowPanel from './panels/RowPanel.vue';
import RowCreatePanel from './panels/RowCreatePanel.vue';
import UmbrellaPanel from './panels/UmbrellaPanel.vue';
import UmbrellaCreatePanel from './panels/UmbrellaCreatePanel.vue';
import MultiPanel from './panels/MultiPanel.vue';
import type { findUmbrella, Selection } from './structureSelection';

// Il ramo unico dei pannelli dell'ispettore: montato DUE volte dalla shell (aside desktop e
// Drawer mobile) — la duplicazione del v-if nei due rami è stata la causa del bug «ramo Drawer
// dimenticato». La risoluzione per-id resta nella shell (serve anche ai watch di fallback).
defineProps<{
  data: EstablishmentStructureDTO;
  selection: Selection;
  isAdmin: boolean;
  selectedSector: StructureSectorDTO | null;
  selectedRow: { row: StructureRowDTO; sector: StructureSectorDTO } | null;
  selectedUmbrella: ReturnType<typeof findUmbrella>;
  createRowSector: StructureSectorDTO | null;
  createUmbrellaRow: StructureRowDTO | null;
  multiLabels: string[];
}>();
const emit = defineEmits<{ close: []; created: [id: string] }>();
</script>

<template>
  <BeachPanel v-if="selection.kind === 'beach'" :data="data" :is-admin="isAdmin" />
  <SectorPanel v-else-if="selection.kind === 'sector' && selectedSector" :sector="selectedSector" :is-admin="isAdmin" @close="emit('close')" />
  <SectorCreatePanel v-else-if="selection.kind === 'create-sector'" @created="(id) => emit('created', id)" @close="emit('close')" />
  <RowPanel v-else-if="selection.kind === 'row' && selectedRow" :row="selectedRow.row" :sector-name="selectedRow.sector.name" :types="data.umbrellaTypes" :is-admin="isAdmin" @close="emit('close')" />
  <RowCreatePanel v-else-if="selection.kind === 'create-row' && createRowSector" :sector-id="createRowSector.id" :sector-name="createRowSector.name" :types="data.umbrellaTypes" @close="emit('close')" />
  <UmbrellaPanel v-else-if="selection.kind === 'umbrella' && selectedUmbrella" :umbrella="selectedUmbrella.umbrella" :row-label="selectedUmbrella.row.label" :sector-name="selectedUmbrella.sector.name" :types="data.umbrellaTypes" :is-admin="isAdmin" @close="emit('close')" />
  <UmbrellaCreatePanel v-else-if="selection.kind === 'create-umbrella' && createUmbrellaRow" :row-id="createUmbrellaRow.id" :row-label="createUmbrellaRow.label" :types="data.umbrellaTypes" @close="emit('close')" />
  <MultiPanel v-else-if="selection.kind === 'multi'" :ids="selection.ids" :labels="multiLabels" :types="data.umbrellaTypes" @close="emit('close')" />
</template>
```

Nota: `import type { findUmbrella }` importa la firma solo per `ReturnType` — resta un type-only import (nessun costo runtime). Il template è multi-root: Vue 3 lo consente e qui non servono attributi ereditati.

- [ ] **Step 2: Sostituisci ENTRAMBI i rami nella shell**

In `EstablishmentStructureView.vue`: rimuovi gli 8 import dei pannelli (restano in `InspectorPanels`), importa `InspectorPanels from './InspectorPanels.vue'`, e sostituisci il contenuto di aside e Drawer con la STESSA riga:

```html
      <aside v-if="isDesktop" data-testid="inspector" class="min-w-0 overflow-auto border-l border-[var(--color-border)] bg-[var(--color-raised)]" aria-label="Ispettore">
        <InspectorPanels :data="data" :selection="selection" :is-admin="isAdmin"
          :selected-sector="selectedSector" :selected-row="selectedRow" :selected-umbrella="selectedUmbrella"
          :create-row-sector="createRowSector" :create-umbrella-row="createUmbrellaRow" :multi-labels="multiLabels"
          @close="reset" @created="(id) => selectedSectorId = id" />
      </aside>
      <Drawer v-else v-model:open="drawerOpen" title="Ispettore">
        <div data-testid="inspector">
          <InspectorPanels :data="data" :selection="selection" :is-admin="isAdmin"
            :selected-sector="selectedSector" :selected-row="selectedRow" :selected-umbrella="selectedUmbrella"
            :create-row-sector="createRowSector" :create-umbrella-row="createUmbrellaRow" :multi-labels="multiLabels"
            @close="reset" @created="(id) => selectedSectorId = id" />
        </div>
      </Drawer>
```

I `data-testid="inspector"` restano dove sono (aside e div interno al Drawer): i selettori dei test non cambiano.

- [ ] **Step 3: Suite intera + typecheck**

Da `apps/web-staff`, in sequenza: `npx vitest run` poi `npx vue-tsc --noEmit` (o l'equivalente script typecheck del package).
Atteso: 516/516 (refactor puro, zero test nuovi), typecheck pulito. Attenzione particolare ai 3 test mobile (Drawer) — sono la guardia di equivalenza dei due rami.

- [ ] **Step 4: Aggiorna design-system §14.6**

In `docs/design/design-system.md` §14.6, aggiungi `InspectorPanels.vue` all'elenco della scomposizione, tra la shell e la scena:

```markdown
`EstablishmentStructureView.vue` (shell: query, stato `selection: {kind, id[]} | null`, layout due
colonne/`Drawer`) · `InspectorPanels.vue` (ramo unico dei pannelli, montato sia nell'aside desktop
che nel `Drawer` mobile — un solo punto da cablare) · `StructureScene.vue` (scena, tab settori,
modalità Seleziona) · …
```

(adatta la prosa esistente senza riscrivere la sezione).

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/establishment/InspectorPanels.vue apps/web-staff/src/features/establishment/EstablishmentStructureView.vue docs/design/design-system.md
git commit -m "refactor(web-staff): estrae InspectorPanels - pannelli cablati una volta per aside e Drawer"
```

---

### Task 3: web-staff — MultiPanel admin-gated + test diretti dei sentinel

**Dipende dal Task 2** (la prop si passa in `InspectorPanels.vue`, punto unico). Due finding: (a) `MultiPanel` è l'unico pannello con azioni ma senza prop `isAdmin` (la rotta è admin-gated, ma gli altri pannelli applicano comunque la difesa in profondità — e la selezione multi è raggiungibile da Staff via Maiusc+clic); (b) i sentinel del select tipologia (`''` = nessuna scelta → bottone disabilitato; `'__none__'` = «Normale» → `umbrellaTypeId: null`) non hanno test diretto.

**Files:**
- Modify: `apps/web-staff/src/features/establishment/panels/MultiPanel.vue`
- Modify: `apps/web-staff/src/features/establishment/InspectorPanels.vue` (riga `MultiPanel`)
- Test: `apps/web-staff/src/features/establishment/EstablishmentStructureView.spec.ts`

**Interfaces:**
- Consumes: `InspectorPanels.vue` dal Task 2 (la riga `<MultiPanel v-else-if=… />`).
- Produces: `MultiPanel` con prop aggiuntiva obbligatoria `isAdmin: boolean`. Nessun altro task la usa.

- [ ] **Step 1: Scrivi il test admin-gating che fallisce**

In `EstablishmentStructureView.spec.ts`, dopo il test «mobile: shift+clic … pannello Multi»:

```ts
it('staff (non admin): pannello Multi raggiungibile via shift+clic ma senza azioni (difesa in profondità)', async () => {
  useFixture();
  const w = mountApp(EstablishmentStructureView);
  await settle(); // nessuna sessione → ruolo Staff di default
  await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
  await w.findAll('[data-testid="scene-cell"] button')[1].trigger('click', { shiftKey: true });
  const insp = w.find('[data-testid="inspector"]');
  expect(insp.text()).toContain('2 ombrelloni');
  expect(insp.find('[data-testid="multi-assign"]').exists()).toBe(false);
  expect(insp.find('[data-testid="multi-delete"]').exists()).toBe(false);
});
```

- [ ] **Step 2: Verifica che fallisca**

Da `apps/web-staff`: `npx vitest run src/features/establishment/EstablishmentStructureView.spec.ts`
Atteso: FAIL sul nuovo test (le azioni oggi si rendono anche per Staff). Gli altri verdi.

- [ ] **Step 3: Implementa il gating**

In `MultiPanel.vue`: aggiungi `isAdmin` alle props e avvolgi le azioni (Field tipologia + bottone Applica + zona rischiosa) in un template condizionale — header e chip etichette restano visibili a tutti:

```ts
const props = defineProps<{ ids: string[]; labels: string[]; types: UmbrellaTypeDTO[]; isAdmin: boolean }>();
```

```html
      <div class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-brand-tint)] p-2.5 text-[11.5px] font-semibold text-[var(--color-brand-ink)]">
        {{ labels.join(' · ') }}
      </div>
      <template v-if="isAdmin">
        <Field label="Tipologia">…(invariato)…</Field>
        <Button data-testid="multi-assign" …>…</Button>
        <div class="rounded-[var(--radius-md)] border border-[var(--color-danger-border)] …">…(invariato)…</div>
      </template>
```

(il `ConfirmDialog` in coda può restare fuori dal gate: senza bottone non è mai apribile).

In `InspectorPanels.vue`, riga MultiPanel:

```html
  <MultiPanel v-else-if="selection.kind === 'multi'" :ids="selection.ids" :labels="multiLabels" :types="data.umbrellaTypes" :is-admin="isAdmin" @close="emit('close')" />
```

- [ ] **Step 4: Aggiungi i test sentinel (documentano comportamento esistente)**

Sempre in `EstablishmentStructureView.spec.ts`. Questi due NON seguono red→green: il comportamento esiste già, la review chiedeva il test diretto. Dichiaralo nel report del task.

```ts
it('multi: «Normale» (sentinel __none__) → bulk-assign-type con umbrellaTypeId null', async () => {
  useFixture();
  let assigned: unknown = null;
  server.use(http.post('/api/establishment/umbrellas/bulk-assign-type', async ({ request }) => {
    assigned = await request.json();
    return HttpResponse.json({ updated: 2 });
  }));
  const w = mountApp(EstablishmentStructureView);
  const session = useSessionStore();
  session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
  await settle();
  await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
  await w.findAll('[data-testid="scene-cell"] button')[1].trigger('click', { shiftKey: true });
  const insp = w.find('[data-testid="inspector"]');
  await insp.find('[data-testid="multi-type"]').setValue('__none__');
  await insp.find('[data-testid="multi-assign"]').trigger('click');
  await settle();
  expect(assigned).toEqual({ ids: ['u-1', 'u-2'], umbrellaTypeId: null });
});

it('multi: senza scelta (sentinel «») il bottone Applica è disabilitato', async () => {
  useFixture();
  const w = mountApp(EstablishmentStructureView);
  const session = useSessionStore();
  session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
  await settle();
  await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
  await w.findAll('[data-testid="scene-cell"] button')[1].trigger('click', { shiftKey: true });
  expect(w.find('[data-testid="inspector"] [data-testid="multi-assign"]').attributes('disabled')).toBeDefined();
});
```

- [ ] **Step 5: Suite intera + typecheck**

Da `apps/web-staff`, in sequenza: `npx vitest run` poi typecheck.
Atteso: 519/519 (516 + 3 nuovi), typecheck pulito (la prop obbligatoria nuova: l'unico call site è `InspectorPanels.vue`, aggiornato allo Step 3).

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/establishment/panels/MultiPanel.vue apps/web-staff/src/features/establishment/InspectorPanels.vue apps/web-staff/src/features/establishment/EstablishmentStructureView.spec.ts
git commit -m "fix(web-staff): MultiPanel admin-gated come gli altri pannelli + test diretti dei sentinel tipologia"
```

---

### Task 4: web-staff — form dei pannelli sincronizzati per id + copy cap interpolata

Due finding sui pannelli form. (a) `SectorPanel`/`RowPanel`/`UmbrellaPanel` fanno `watch(() => props.sector, …)` sull'**identità oggetto**: ogni refetch della struttura (che produce oggetti nuovi con gli stessi id — e TUTTE le mutation invalidano la query) azzera le bozze che l'utente sta scrivendo. Il sync serve solo quando l'istanza (non key-ata) riceve un'**entità diversa** → watch sull'`id`. Trade-off dichiarato: un rename arrivato da un'altra scheda non aggiorna più il form aperto finché non si cambia selezione — accettato in review (le bozze dell'utente vincono). (b) La copy «Massimo 500 per volta» è hardcoded in 2 punti nonostante `GENERATE_MAX` esista apposta.

**Files:**
- Modify: `apps/web-staff/src/features/establishment/panels/SectorPanel.vue` (watch ~riga 15)
- Modify: `apps/web-staff/src/features/establishment/panels/RowPanel.vue` (watch ~riga 17, copy ~riga 77)
- Modify: `apps/web-staff/src/features/establishment/panels/UmbrellaPanel.vue` (watch ~riga 15)
- Modify: `apps/web-staff/src/features/establishment/panels/RowCreatePanel.vue` (copy ~riga 64)
- Create (test): `apps/web-staff/src/features/establishment/panels/form-sync.spec.ts`

**Interfaces:**
- Consumes: `GENERATE_MAX` da `../structureSelection` (già importato in entrambi i pannelli generatore).
- Produces: nulla per gli altri task.

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `apps/web-staff/src/features/establishment/panels/form-sync.spec.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import type { UmbrellaTypeDTO } from '@coralyn/contracts';
import { mountApp } from '@/test/utils';
import SectorPanel from './SectorPanel.vue';
import RowPanel from './RowPanel.vue';
import UmbrellaPanel from './UmbrellaPanel.vue';

enableAutoUnmount(afterEach);

const TYPES: UmbrellaTypeDTO[] = [{ id: 'typ-1', name: 'Gazebo', sortOrder: 1, icon: 'palmtree' }];
const input = (w: ReturnType<typeof mountApp>, testid: string) =>
  (w.find(`[data-testid="${testid}"]`).element as HTMLInputElement).value;

// I pannelli dell'ispettore non sono key-ati: la stessa istanza riceve via props sia i refetch
// (oggetti NUOVI con lo STESSO id — ogni mutation invalida la query struttura) sia i cambi di
// selezione (id diverso). Il sync del form deve scattare solo nel secondo caso: un watch
// sull'identità oggetto azzererebbe le bozze dell'utente a ogni refetch.
describe('pannelli form — sync per id, non per identità oggetto', () => {
  it('UmbrellaPanel: refetch stesso id → bozza preservata; id diverso → form resettato', async () => {
    const w = mountApp(UmbrellaPanel, { props: {
      umbrella: { id: 'u-1', label: 'A1', umbrellaTypeId: null },
      rowLabel: 'Fila 1', sectorName: 'Centro', types: TYPES, isAdmin: true,
    } });
    await w.find('[data-testid="umbrella-label"]').setValue('A1-bozza');
    await w.setProps({ umbrella: { id: 'u-1', label: 'A1', umbrellaTypeId: null } }); // refetch: oggetto nuovo, stesso id
    expect(input(w, 'umbrella-label')).toBe('A1-bozza');
    await w.setProps({ umbrella: { id: 'u-2', label: 'A2', umbrellaTypeId: 'typ-1' } }); // entità diversa
    expect(input(w, 'umbrella-label')).toBe('A2');
    expect((w.find('[data-testid="umbrella-type"]').element as HTMLSelectElement).value).toBe('typ-1');
  });

  it('RowPanel: refetch stesso id → bozza preservata; id diverso → form resettato', async () => {
    const w = mountApp(RowPanel, { props: {
      row: { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [] },
      sectorName: 'Centro', types: TYPES, isAdmin: true,
    } });
    await w.find('[data-testid="row-label"]').setValue('Fila 1-bozza');
    await w.setProps({ row: { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [] } });
    expect(input(w, 'row-label')).toBe('Fila 1-bozza');
    await w.setProps({ row: { id: 'r-2', label: 'Fila 2', sortOrder: 2, umbrellas: [] } });
    expect(input(w, 'row-label')).toBe('Fila 2');
  });

  it('SectorPanel: refetch stesso id → bozza preservata; id diverso → form resettato', async () => {
    const w = mountApp(SectorPanel, { props: {
      sector: { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] }, isAdmin: true,
    } });
    await w.find('[data-testid="sector-name"]').setValue('Centro-bozza');
    await w.setProps({ sector: { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] } });
    expect(input(w, 'sector-name')).toBe('Centro-bozza');
    await w.setProps({ sector: { id: 's-2', name: 'Speciali', sortOrder: 2, kind: 'special', rows: [] } });
    expect(input(w, 'sector-name')).toBe('Speciali');
    expect((w.find('[data-testid="sector-kind"]').element as HTMLSelectElement).value).toBe('special');
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Da `apps/web-staff`: `npx vitest run src/features/establishment/panels/form-sync.spec.ts`
Atteso: 3 FAIL, tutti sull'asserzione «bozza preservata» (il watch su identità oggetto resetta al refetch).

- [ ] **Step 3: Implementa i watch per id**

In `SectorPanel.vue` (il commento spiega il vincolo, una volta sola qui — nei gemelli basta il watch):

```ts
// Sync per id, non per identità oggetto: i refetch (ogni mutation invalida la query struttura)
// producono oggetti nuovi con lo stesso id e non devono azzerare le bozze in corso; il cambio di
// entità (istanza non key-ata) sì. Contropartita accettata: un rename arrivato da un'altra scheda
// non aggiorna il form finché la selezione non cambia.
watch(() => props.sector.id, () => { name.value = props.sector.name; kind.value = props.sector.kind; });
```

In `RowPanel.vue`:

```ts
watch(() => props.row.id, () => { label.value = props.row.label; });
```

In `UmbrellaPanel.vue`:

```ts
watch(() => props.umbrella.id, () => { label.value = props.umbrella.label; umbrellaTypeId.value = props.umbrella.umbrellaTypeId ?? ''; });
```

- [ ] **Step 4: Verifica che passino**

`npx vitest run src/features/establishment/panels/form-sync.spec.ts` → 3 PASS.

- [ ] **Step 5: Interpola la copy del cap**

In `RowPanel.vue` E `RowCreatePanel.vue`, la Field Quantità:

```html
          <Field label="Quantità" :error="genCountOverMax ? `Massimo ${GENERATE_MAX} per volta` : undefined">
```

I test esistenti asseriscono il testo letterale «Massimo 500 per volta»: restano verdi (e restano la spec della copy — non interpolarli).

- [ ] **Step 6: Suite intera + typecheck**

Da `apps/web-staff`, in sequenza: `npx vitest run` poi typecheck.
Atteso: 522/522 (519 + 3 nuovi), typecheck pulito.

- [ ] **Step 7: Commit**

```bash
git add apps/web-staff/src/features/establishment/panels/SectorPanel.vue apps/web-staff/src/features/establishment/panels/RowPanel.vue apps/web-staff/src/features/establishment/panels/UmbrellaPanel.vue apps/web-staff/src/features/establishment/panels/RowCreatePanel.vue apps/web-staff/src/features/establishment/panels/form-sync.spec.ts
git commit -m "fix(web-staff): form dei pannelli sincronizzati per id (i refetch non azzerano le bozze) e copy cap da GENERATE_MAX"
```

---

### Task 5: web-staff — tab settori col pattern tastiera APG

La review finale (Minor #4) ha rilevato `role="tablist"`/`role="tab"` senza il pattern tastiera APG. Due difetti: (a) il contenitore `role="tablist"` contiene anche bottoni NON-tab («+ Settore», «Seleziona») — violazione strutturale; (b) niente roving tabindex né navigazione con frecce. Fix: wrapper interno `role="tablist"` con i soli tab, `tabindex` 0/-1 sul selezionato/altri, frecce Sinistra/Destra (con wrap) + Home/End che spostano fuoco e selezione (attivazione automatica — coerente col click che già attiva).

**Files:**
- Modify: `apps/web-staff/src/features/establishment/StructureScene.vue` (toolbar ~righe 56-70, script)
- Test: `apps/web-staff/src/features/establishment/StructureScene.spec.ts`

**Interfaces:**
- Consumes: nulla dagli altri task (indipendente — tocca solo la scena).
- Produces: nulla. I selettori `[role="tab"]` usati da `EstablishmentStructureView.spec.ts` restano validi.

- [ ] **Step 1: Scrivi i test che falliscono**

In `StructureScene.spec.ts`:

```ts
  it('tablist APG: contiene solo i tab; roving tabindex sul selezionato', () => {
    const w = mount(StructureScene, { props: base });
    const tablist = w.find('[role="tablist"]');
    expect(tablist.findAll('button')).toHaveLength(2); // solo i 2 settori: ghost e Seleziona fuori
    const tabs = w.findAll('[role="tab"]');
    expect(tabs[0].attributes('tabindex')).toBe('0');  // s-1 selezionato
    expect(tabs[1].attributes('tabindex')).toBe('-1');
  });

  it('tablist APG: frecce con wrap e Home/End spostano selezione e fuoco', async () => {
    const w = mount(StructureScene, { props: base, attachTo: document.body });
    const tabs = w.findAll('[role="tab"]');
    await tabs[0].trigger('keydown', { key: 'ArrowRight' });
    expect(w.emitted('select-sector')![0]).toEqual(['s-2']);
    expect(document.activeElement).toBe(tabs[1].element);
    await tabs[1].trigger('keydown', { key: 'ArrowRight' }); // wrap → primo
    expect(w.emitted('select-sector')![1]).toEqual(['s-1']);
    await tabs[0].trigger('keydown', { key: 'End' });
    expect(w.emitted('select-sector')![2]).toEqual(['s-2']);
    expect(document.activeElement).toBe(tabs[1].element);
    w.unmount();
  });
```

- [ ] **Step 2: Verifica che falliscano**

Da `apps/web-staff`: `npx vitest run src/features/establishment/StructureScene.spec.ts`
Atteso: 2 FAIL (tablist con 4 bottoni; nessun tabindex/keydown). Gli esistenti verdi.

- [ ] **Step 3: Implementa**

In `StructureScene.vue`, script (aggiungi `ref`, `onBeforeUpdate` all'import da `vue`):

```ts
// Roving tabindex APG per i tab settore: un solo tab nel tab-order (il selezionato), frecce con
// wrap + Home/End spostano fuoco e selezione (attivazione automatica, coerente col click).
const tabRefs = ref<(HTMLButtonElement | null)[]>([]);
onBeforeUpdate(() => { tabRefs.value = []; }); // niente ref stantii se i settori cambiano
function onTabKeydown(e: KeyboardEvent, i: number) {
  const n = props.sectors.length;
  let next: number;
  if (e.key === 'ArrowRight') next = (i + 1) % n;
  else if (e.key === 'ArrowLeft') next = (i - 1 + n) % n;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = n - 1;
  else return;
  e.preventDefault();
  emit('select-sector', props.sectors[next].id);
  tabRefs.value[next]?.focus();
}
```

Template — la toolbar perde `role`/`aria-label` (passano al wrapper interno che contiene SOLO i tab); ghost «+ Settore» e «Seleziona» restano figli diretti della toolbar (layout invariato: flex + gap sulla toolbar, `ml-auto` su Seleziona):

```html
    <div class="map-toolbar flex items-center gap-2 px-4 py-2.5">
      <div class="flex items-center gap-2" role="tablist" aria-label="Settori">
        <button v-for="(s, i) in sectors" :key="s.id" type="button" role="tab" :aria-selected="current?.id === s.id"
          :tabindex="current?.id === s.id ? 0 : -1" :ref="(el) => { tabRefs[i] = el as HTMLButtonElement | null }"
          class="rounded-full border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-bold focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          :class="current?.id === s.id ? 'border-[var(--color-border-input)] bg-[var(--color-surface)] text-[var(--color-text)] [box-shadow:var(--shadow-soft)]' : 'border-transparent text-[var(--color-text-2nd)]'"
          @click="emit('select-sector', s.id)" @keydown="onTabKeydown($event, i)">
          {{ s.name }} <span class="ml-1 text-[11.5px] font-semibold text-[var(--color-text-muted)] [font-variant-numeric:tabular-nums]">{{ seats(s) }} posti</span>
        </button>
      </div>
      <button v-if="isAdmin" type="button" data-testid="ghost-sector" …(invariato)…>+ Settore</button>
      <button v-if="isAdmin" type="button" data-testid="select-mode" …(invariato)…>Seleziona</button>
    </div>
```

(nel template Vue i ref-callback su `tabRefs` funzionano perché `ref()` è unwrappato nel contesto del template; se il typecheck si lamenta del cast, usa una funzione `setTabRef(el: unknown, i: number)` nello script).

- [ ] **Step 4: Verifica che passino + suite intera + typecheck**

In sequenza: `npx vitest run src/features/establishment/StructureScene.spec.ts` (verde), poi `npx vitest run` intero, poi typecheck.
Atteso: 524/524 (522 + 2 nuovi), typecheck pulito. In particolare i test della view che usano `[role="tab"]` restano verdi.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/establishment/StructureScene.vue apps/web-staff/src/features/establishment/StructureScene.spec.ts
git commit -m "fix(web-staff): tab settori col pattern tastiera APG - tablist puro, roving tabindex, frecce/Home/End"
```

---

## Verifica finale (controller, fuori dai task)

In SEQUENZA, mai in parallelo:
1. `apps/web-staff`: `npx vitest run` → 524/524.
2. `apps/api`: `npx jest` → 255/255.
3. `pnpm -r typecheck` (o per-workspace in sequenza) → pulito sui 4 workspace.
4. e2e bulk (tocca `bulkDelete`): da `apps/api`, suite `establishment-umbrellas-bulk` — richiede Docker Desktop su e `coralyn-db` attivo. Le 3 suite time-bomb restano rosse: NON sono regressioni.
5. `apps/web-platform` e `apps/web-customer` non sono toccati: basta il typecheck (già al punto 3).

## Self-review del piano (fatta)

- Copertura chip: 8 item → 7 attivi (nit doc §14.4 già chiuso da `6687f55`, dichiarato in testa) mappati sui task 1-5. ✓
- Conteggi test: 516 → +3 (task 3) → +3 (task 4) → +2 (task 5) = 524 web-staff; 254 → 255 api. I conteggi assumono partenza 516/254: se divergono, fidarsi della suite, non del piano.
- Tipi coerenti: `InspectorPanels` props/emits (task 2) = quanto consumato in task 3; `GENERATE_MAX` già esportato da `structureSelection.ts`. ✓
- Nessun placeholder: ogni step ha codice o comando concreto; gli «(invariato)» indicano blocchi esistenti da non toccare, non codice da inventare. ✓
