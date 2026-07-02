# Slice "Conferme coerenti & Rinnovi leggibili" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Ogni implementer FA IL LAVORO CON I PROPRI TOOL. NON deve delegare/spawnare subagent** (gotcha handoff §5).

**Goal:** Rendere coerenti le conferme distruttive (un `ConfirmDialog` unico) e leggibili i rinnovi (season-native, niente traduzione data↔stagione), come base pulita per Slice B/C.

**Architecture:** Quattro layer coesi, **un commit per layer, in ordine**. (1) nuovo componente presentazionale `ConfirmDialog` in `ui-kit` costruito su `Modal`+`ModalFooter`, che sostituisce i `window.confirm` in `PricingView`; (2) `MapView` passa da `mutateAsync`/`await` a `.mutate()` con callback (niente unhandled rejection); (3) contratti+backend+FE dei rinnovi passano da date a `seasonId`, con nuovo helper `CatalogService.resolveSeasonById`; (4) microcopy/affordance in `RenewalsView` + conferma "Chiudi campagna" via `ConfirmDialog`.

**Tech Stack:** Vue 3 `<script setup>` + reka-ui (ui-kit), Vitest + @vue/test-utils (ui-kit/web-staff), MSW (web-staff), NestJS + class-validator (api), Jest + supertest (api e2e), Prisma, pnpm workspaces.

## Global Constraints

- **Codice/DB in inglese; UI/documentazione in italiano** (convenzione di progetto).
- **Baseline test da NON regredire** (verificata live post-Slice A): **api unit 83 · api e2e 112 · web-staff 119 · ui-kit standalone 49.** La suite `web-staff` globa gli spec di `ui-kit` (`web-staff 119` = ~70 web-staff-only + 49 ui-kit). Ogni layer **aggiunge** test; nessun test rimosso. e2e riscritti restano ≥ conteggio attuale.
- **Date `@db.Date`/`@db.Time` in round-trip UTC** (ADR-0031); vietati i metodi locali. Questo slice non tocca la logica date, ma non deve introdurne di locale.
- **`UUID_SHAPE`** (`apps/api/src/common/uuid.ts`) è il validatore forma-UUID; usalo per i nuovi campi id nei DTO (NON `@IsUUID()`).
- **Nessuna migrazione** in questo slice (`RenewalCampaign.originSeasonId`/`destinationSeasonId` esistono già a schema; nessun nuovo campo DB).
- **Nessun nuovo ADR** (incremento su ADR-0031/0033/0034). Prossimo ADR libero resta 0035.
- **Dopo aver toccato `@coralyn/contracts`**: `corepack pnpm --filter @coralyn/contracts build` **e** `rm -rf apps/web-staff/node_modules/.vite` prima di far girare i test web-staff (gotcha §5).
- **Comandi test:** api unit `corepack pnpm --filter @coralyn/api test` · api e2e `corepack pnpm --filter @coralyn/api test:e2e` · web-staff `corepack pnpm --filter @coralyn/web-staff test` · ui-kit `corepack pnpm --filter @coralyn/ui-kit test`.

## File Structure

**Layer 1 (ui-kit + PricingView):**
- Create `packages/ui-kit/src/components/ConfirmDialog.vue` — dialog di conferma presentazionale su `Modal`+`ModalFooter`.
- Create `packages/ui-kit/src/components/ConfirmDialog.spec.ts` — spec del componente.
- Modify `packages/ui-kit/src/index.ts` — export `ConfirmDialog`.
- Modify `apps/web-staff/src/features/pricing/PricingView.vue` — sostituire i 2 `window.confirm` con `ConfirmDialog`; aggiungere conferma delete-tariffa.
- Modify `apps/web-staff/src/features/pricing/PricingView.spec.ts` — riscrivere i test che mockano `window.confirm` per interagire col dialog.

**Layer 2 (MapView):**
- Modify `apps/web-staff/src/features/map/MapView.vue` — `confirmBooking`/`onCancel` a `.mutate()` con callback.
- Modify `apps/web-staff/src/features/map/MapView.spec.ts` — test 409 su create: toast + modale resta aperto + niente unhandled rejection.

**Layer 3 (contratti + backend + FE rinnovi):**
- Modify `packages/contracts/src/index.ts` — `OpenRenewalCampaignInput` (`originSeasonId`/`destinationSeasonId`), `RenewBookingInput` (`destinationSeasonId`).
- Modify `apps/api/src/catalog/catalog.service.ts` — nuovo `resolveSeasonById`.
- Modify `apps/api/src/bookings/dto/open-renewal-campaign.dto.ts` — id + `@Matches(UUID_SHAPE)`.
- Modify `apps/api/src/bookings/dto/renewal-campaign-query.dto.ts` — `destinationSeasonId`.
- Modify `apps/api/src/bookings/dto/renew-booking.dto.ts` — `destinationSeasonId`.
- Create `apps/api/src/bookings/dto/subscriptions-query.dto.ts` — DTO dedicato con `seasonId` obbligatorio.
- Modify `apps/api/src/bookings/renewal-campaigns.controller.ts` / `.service.ts` — risoluzione per id.
- Modify `apps/api/src/bookings/bookings.controller.ts` / `bookings.service.ts` — subscriptions + renew per id.
- Modify `apps/api/test/helpers/seed-pricing.ts` — esporre `season2027Id`.
- Modify `apps/api/test/renewal-campaigns.e2e-spec.ts`, `apps/api/test/bookings.e2e-spec.ts` — passare `seasonId`.
- Modify `apps/web-staff/src/features/renewals/RenewalsView.vue` + `useRenewals.ts` — `<Select>` stagioni, invii per id.
- Modify `apps/web-staff/src/lib/queryKeys.ts` — chiavi per `seasonId`.
- Modify `apps/web-staff/src/mocks/server.ts` — SEASON_2 + handler per id.
- Modify `apps/web-staff/src/features/renewals/RenewalsView.spec.ts` — pilotare i `<Select>`.

**Layer 4 (microcopy):**
- Modify `apps/web-staff/src/features/renewals/RenewalsView.vue` — intestazione, legenda, empty state, conferma "Chiudi campagna" via `ConfirmDialog`.
- Modify `apps/web-staff/src/features/renewals/RenewalsView.spec.ts` — testi chiave + conferma-chiudi.

---

## Task 1 (Layer 1): `ConfirmDialog` (ui-kit) + conferme distruttive in PricingView

**Files:**
- Create: `packages/ui-kit/src/components/ConfirmDialog.vue`
- Create: `packages/ui-kit/src/components/ConfirmDialog.spec.ts`
- Modify: `packages/ui-kit/src/index.ts`
- Modify: `apps/web-staff/src/features/pricing/PricingView.vue`
- Modify: `apps/web-staff/src/features/pricing/PricingView.spec.ts`

**Interfaces:**
- Produces: componente `ConfirmDialog` con props `{ title: string; description?: string; confirmLabel: string; cancelLabel?: string; tone?: 'danger' | 'default' }`, model `open` (`v-model:open`), emit `confirm` e `cancel`. Riusa `Modal` (titolo/descrizione/a11y) e `ModalFooter` (bottoni; `submit-variant='danger'` quando `tone==='danger'`).

- [ ] **Step 1: Scrivi lo spec del componente (RED)** — `packages/ui-kit/src/components/ConfirmDialog.spec.ts`

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';

// Come Modal.spec: reka-ui monta il contenuto del dialog nel document.body dopo un tick.
const mountDialog = async (props: Record<string, unknown>) => {
  const w = mount(ConfirmDialog, {
    props: { open: true, title: 'Eliminare?', confirmLabel: 'Elimina', ...props },
    attachTo: document.body,
  });
  await nextTick();
  return w;
};

const confirmBtn = () =>
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Elimina');
const cancelBtn = () =>
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Annulla');

afterEach(() => { document.body.innerHTML = ''; });

describe('ConfirmDialog', () => {
  it('rende title e description dentro il dialog', async () => {
    await mountDialog({ description: 'Operazione irreversibile.' });
    expect(document.body.textContent).toContain('Eliminare?');
    expect(document.body.textContent).toContain('Operazione irreversibile.');
  });

  it('emette "confirm" al click sul bottone di conferma', async () => {
    const w = await mountDialog({});
    confirmBtn()!.click();
    await nextTick();
    expect(w.emitted('confirm')).toHaveLength(1);
  });

  it('emette "cancel" al click su Annulla e chiude (update:open false)', async () => {
    const w = await mountDialog({});
    cancelBtn()!.click();
    await nextTick();
    expect(w.emitted('cancel')).toHaveLength(1);
    expect(w.emitted('update:open')!.at(-1)).toEqual([false]);
  });

  it('tone="danger" colora il bottone di conferma col token danger', async () => {
    await mountDialog({ tone: 'danger' });
    expect(confirmBtn()!.className).toContain('bg-[var(--color-danger-bg)]');
  });

  it('cancelLabel personalizzabile', async () => {
    await mountDialog({ cancelLabel: 'Torna indietro' });
    const btn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Torna indietro');
    expect(btn).toBeTruthy();
  });
});
```

- [ ] **Step 2: Esegui lo spec e verifica che fallisca (RED)**

Run: `corepack pnpm --filter @coralyn/ui-kit test ConfirmDialog`
Expected: FAIL — `Failed to resolve import "./ConfirmDialog.vue"`.

- [ ] **Step 3: Implementa `ConfirmDialog.vue` (GREEN)** — `packages/ui-kit/src/components/ConfirmDialog.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue';
import Modal from './Modal.vue';
import ModalFooter from './ModalFooter.vue';

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    confirmLabel: string;
    cancelLabel?: string;
    tone?: 'danger' | 'default';
  }>(),
  { cancelLabel: 'Annulla', tone: 'default' },
);
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ confirm: []; cancel: [] }>();

const submitVariant = computed<'primary' | 'danger'>(() => (props.tone === 'danger' ? 'danger' : 'primary'));

function onCancel(): void {
  open.value = false;
  emit('cancel');
}
</script>
<template>
  <Modal v-model:open="open" :title="title" :description="description">
    <slot />
    <ModalFooter
      :submit-label="confirmLabel"
      :cancel-label="cancelLabel"
      :submit-variant="submitVariant"
      @submit="emit('confirm')"
      @cancel="onCancel"
    />
  </Modal>
</template>
```

- [ ] **Step 4: Esporta il componente** — in `packages/ui-kit/src/index.ts`, dopo la riga `export { default as Modal } ...`:

```ts
export { default as ConfirmDialog } from './components/ConfirmDialog.vue';
```

- [ ] **Step 5: Esegui lo spec e verifica GREEN**

Run: `corepack pnpm --filter @coralyn/ui-kit test ConfirmDialog`
Expected: PASS (5 test). Poi l'intera suite ui-kit: `corepack pnpm --filter @coralyn/ui-kit test` → **54 pass** (49 + 5).

- [ ] **Step 6: Cabla `ConfirmDialog` in `PricingView.vue`** — sostituisci i due `window.confirm` e aggiungi la conferma delete-tariffa.

Nel `<script setup>`: importa `ConfirmDialog` dalla lista `@coralyn/ui-kit` (aggiungi `ConfirmDialog` all'import esistente riga 3). Sostituisci `confirmDeleteSeason` (righe 35-40) e `confirmDeletePackage` (righe 48-52) con un unico stato di conferma e handler; aggiungi lo stato per la tariffa:

```ts
// --- Conferme distruttive (ConfirmDialog) ---
type PendingDelete =
  | { kind: 'season'; id: string; name: string }
  | { kind: 'package'; id: string; name: string }
  | { kind: 'rate'; id: string };
const pendingDelete = ref<PendingDelete | null>(null);
const confirmOpen = ref(false);

function askDeleteSeason() {
  const name = seasons.value?.find((s) => s.id === activeSeasonId.value)?.name ?? '';
  pendingDelete.value = { kind: 'season', id: activeSeasonId.value, name };
  confirmOpen.value = true;
}
function askDeletePackage(p: { id: string; name: string }) {
  pendingDelete.value = { kind: 'package', id: p.id, name: p.name };
  confirmOpen.value = true;
}
function askDeleteRate(id: string) {
  pendingDelete.value = { kind: 'rate', id };
  confirmOpen.value = true;
}
const confirmCopy = computed(() => {
  const p = pendingDelete.value;
  if (p?.kind === 'season')
    return { title: 'Eliminare la stagione?', description: `«${p.name}» e tutte le sue tariffe. L'operazione è irreversibile.` };
  if (p?.kind === 'package')
    return { title: 'Eliminare il pacchetto?', description: `«${p.name}». Se è referenziato da tariffe o prenotazioni non sarà eliminato.` };
  if (p?.kind === 'rate')
    return { title: 'Eliminare la tariffa?', description: 'La regola di prezzo verrà rimossa dal listino.' };
  return { title: '', description: '' };
});
function onConfirmDelete() {
  const p = pendingDelete.value;
  if (!p) return;
  if (p.kind === 'season') deleteSeason.mutate(p.id, { onSuccess: () => (activeSeasonId.value = '') });
  else if (p.kind === 'package') deletePackage.mutate(p.id);
  else deleteRate.mutate(p.id);
  confirmOpen.value = false;
  pendingDelete.value = null;
}
```

Nel `<template>`:
- Bottone delete-stagione (riga 238): `@click="confirmDeleteSeason"` → `@click="askDeleteSeason"`.
- Bottone delete-pacchetto (riga 256): `@click="confirmDeletePackage(p)"` → `@click="askDeletePackage(p)"`.
- Bottone delete-tariffa (riga 293): `@click="deleteRate.mutate(r.id)"` → `@click="askDeleteRate(r.id)"`.
- Prima della chiusura `</section>` (dopo la modale tariffa), aggiungi:

```vue
    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="confirmCopy.title"
      :description="confirmCopy.description"
      confirm-label="Elimina"
      tone="danger"
      @confirm="onConfirmDelete"
    />
```

Assicurati che `computed` e `ref` siano già importati da `vue` (lo sono: riga 1).

- [ ] **Step 7: Riscrivi i test `window.confirm` in `PricingView.spec.ts` (righe 129-192)** — sostituisci i due blocchi `describe` che usano `vi.spyOn(window, 'confirm')` con interazione sul `ConfirmDialog`. Il dialog è portato nel `document.body`; il bottone conferma ha testo `Elimina`, l'annulla `Annulla`.

```ts
  // Helper: trova il bottone del ConfirmDialog per testo, nel document.body.
  const dialogBtn = (label: string) =>
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);

  describe('elimina stagione: conferma via ConfirmDialog (cascata su tutte le tariffe)', () => {
    it('annullando la conferma NON elimina la stagione', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="delete-season"]').trigger('click');
      await settle();
      expect(document.body.textContent).toContain('Eliminare la stagione?');
      dialogBtn('Annulla')!.click();
      await settle();
      expect(w.text()).toContain('Estate 2026'); // la stagione resta
    });

    it('confermando elimina la stagione (e le sue tariffe)', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      expect(w.text()).toContain('Estate 2026');
      await w.get('[data-test="delete-season"]').trigger('click');
      await settle();
      dialogBtn('Elimina')!.click();
      await settle();
      expect(w.text()).not.toContain('Estate 2026');
    });
  });

  describe('elimina pacchetto: conferma + errore server visibile (Slice A)', () => {
    it('annullando la conferma NON elimina il pacchetto', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="del-pkg-pkg-1"]').trigger('click');
      await settle();
      expect(document.body.textContent).toContain('Eliminare il pacchetto?');
      dialogBtn('Annulla')!.click();
      await settle();
      expect(w.text()).toContain('Standard'); // il pacchetto resta
    });

    it('409 dal server (pacchetto in uso) → il messaggio del server diventa un toast', async () => {
      server.use(
        http.delete('/api/packages/:id', () =>
          HttpResponse.json(
            { statusCode: 409, message: 'Pacchetto in uso da tariffe o prenotazioni: non eliminabile.', error: 'Conflict' },
            { status: 409 },
          ),
        ),
      );
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="del-pkg-pkg-1"]').trigger('click');
      await settle();
      dialogBtn('Elimina')!.click();
      await settle();
      expect(useToasts().items.map((t) => t.message)).toEqual(['Pacchetto in uso da tariffe o prenotazioni: non eliminabile.']);
      expect(w.text()).toContain('Standard'); // niente rimozione ottimistica
    });
  });

  it('elimina tariffa: richiede conferma via ConfirmDialog', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    expect(w.text()).toContain('28'); // tariffa ra-1
    await w.get('[data-test="del-rate-ra-1"]').trigger('click');
    await settle();
    expect(document.body.textContent).toContain('Eliminare la tariffa?');
    dialogBtn('Elimina')!.click();
    await settle();
    expect(w.text()).not.toContain('28');
  });
```

Rimuovi gli import ora inutilizzati se il linter li segnala (`vi`, `afterEach` restano usati altrove? verifica: se non più usati, toglili dall'import riga 1). Mantieni `import { server }`, `http`, `HttpResponse`, `useToasts` (usati sopra).

- [ ] **Step 8: Esegui i test web-staff e ui-kit (GREEN)**

Run: `corepack pnpm --filter @coralyn/ui-kit test` → **54 pass**.
Run: `corepack pnpm --filter @coralyn/web-staff test` → verde, **totale ≥ 124** (119 + 5 ui-kit nuovi; i test PricingView riscritti restano stabili, +1 nuovo test delete-tariffa).
Se il conteggio non torna, leggi l'output: nessun test deve essere sparito rispetto alla baseline.

- [ ] **Step 9: Typecheck**

Run: `corepack pnpm --filter @coralyn/ui-kit typecheck` e `corepack pnpm --filter @coralyn/web-staff typecheck`
Expected: nessun errore.

- [ ] **Step 10: Commit (Layer 1)**

```bash
git add packages/ui-kit/src/components/ConfirmDialog.vue packages/ui-kit/src/components/ConfirmDialog.spec.ts packages/ui-kit/src/index.ts apps/web-staff/src/features/pricing/PricingView.vue apps/web-staff/src/features/pricing/PricingView.spec.ts
git commit -m "feat(ui-kit): ConfirmDialog + conferme distruttive coerenti in PricingView (catalog Conferme&Rinnovi L1)"
```

---

## Task 2 (Layer 2): `MapView` error-handling coerente (niente unhandled rejection)

**Files:**
- Modify: `apps/web-staff/src/features/map/MapView.vue:125-140`
- Modify: `apps/web-staff/src/features/map/MapView.spec.ts`

**Interfaces:**
- Consumes: `useCreateBooking()`/`useCancelBooking()` (già esistenti, `mutationResource` con `onError` globale → toast). `.mutate(input, { onSuccess })` non rigetta.

- [ ] **Step 1: Aggiungi il test 409 su create (RED)** — in `apps/web-staff/src/features/map/MapView.spec.ts`, aggiungi in cima gli import mancanti e un nuovo test. In testa al file:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useToasts } from '@/lib/toasts';
import MapView from './MapView.vue';
```

E come nuovo `it(...)` dentro il `describe('MapView', ...)`:

```ts
  it('errore 409 alla conferma: toast del server, modale resta aperto, nessun unhandled rejection', async () => {
    const rejections: unknown[] = [];
    const onRej = (e: PromiseRejectionEvent) => { rejections.push(e.reason); e.preventDefault(); };
    window.addEventListener('unhandledrejection', onRej);
    server.use(
      http.post('/api/bookings', () =>
        HttpResponse.json(
          { statusCode: 409, message: 'Ombrellone già prenotato per questa fascia', error: 'Conflict' },
          { status: 409 },
        ),
      ),
    );

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();
    await w.findAll('button').find((b) => b.text().includes('Nuova prenotazione'))!.trigger('click');
    await flushPromises();

    // Scegli un cliente (necessario perché confirmBooking esce se customerId è vuoto).
    const custSelect = Array.from(document.body.querySelectorAll('select')).find((s) =>
      s.textContent?.includes('Seleziona un cliente'),
    ) as HTMLSelectElement;
    custSelect.value = 'c-1';
    custSelect.dispatchEvent(new Event('change'));
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    const confirm = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes('Conferma prenotazione'))!;
    confirm.click();
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    expect(useToasts().items.map((t) => t.message)).toContain('Ombrellone già prenotato per questa fascia');
    expect(document.body.textContent).toContain('Conferma prenotazione'); // modale ANCORA aperto
    expect(rejections).toEqual([]); // niente unhandled promise rejection

    window.removeEventListener('unhandledrejection', onRej);
    w.unmount();
  });

  afterEach(() => { vi.restoreAllMocks(); });
```

- [ ] **Step 2: Esegui e verifica RED**

Run: `corepack pnpm --filter @coralyn/web-staff test MapView`
Expected: FAIL — o per unhandled rejection catturata, o perché il modale si chiude (con l'attuale `await mutateAsync` + `modalBooking.value=false` prima del rigetto, dipende dal timing). Il punto: il comportamento non è ancora quello atteso.

- [ ] **Step 3: Implementa `.mutate()` con callback (GREEN)** — in `apps/web-staff/src/features/map/MapView.vue`, sostituisci `confirmBooking` (righe 125-137) e `onCancel` (righe 138-140):

```ts
function confirmBooking(): void {
  if (!sel.value || !customerId.value) return;
  createBooking.mutate(
    {
      customerId: customerId.value,
      umbrellaId: sel.value.u.id,
      timeSlotId: selectedSlotId.value,
      type: bookingType.value,
      startDate: activeDate.value,
      endDate: bookingType.value === 'periodic' ? endDate.value : undefined,
      packageId: packageId.value || undefined,
    },
    { onSuccess: () => { modalBooking.value = false; } },
  );
  // Su errore: il modale resta aperto (l'operatore corregge) e il toast globale (Slice A) mostra il messaggio server.
}
function onCancel(): void {
  if (currentBooking.value) cancelBooking.mutate(currentBooking.value.id);
}
```

(Entrambe le funzioni ora sono sincrone: rimuovi `async`/`await`/`Promise<void>`.)

- [ ] **Step 4: Esegui e verifica GREEN**

Run: `corepack pnpm --filter @coralyn/web-staff test MapView`
Expected: PASS (3 test: i 2 esistenti + il nuovo). Poi l'intera suite web-staff resta verde.

- [ ] **Step 5: Typecheck**

Run: `corepack pnpm --filter @coralyn/web-staff typecheck`
Expected: nessun errore.

- [ ] **Step 6: Commit (Layer 2)**

```bash
git add apps/web-staff/src/features/map/MapView.vue apps/web-staff/src/features/map/MapView.spec.ts
git commit -m "fix(web-staff): MapView usa .mutate() con callback (niente unhandled rejection, modale resta aperto su errore) (catalog Conferme&Rinnovi L2)"
```

---

## Task 3 (Layer 3): Rinnovi season-native — contratti + backend + FE

> **Task grande e atomico (un commit).** Procedi in ordine: **Parte A contratti → Parte B backend + e2e → Parte C FE + MSW**. Committa una sola volta alla fine, dopo che api-unit, api-e2e e web-staff sono verdi. **Fallo tu con i tuoi tool, non delegare.**

**Files:** (vedi File Structure, sezione Layer 3)

**Interfaces:**
- Produces (contratti): `OpenRenewalCampaignInput { originSeasonId: string; destinationSeasonId: string; deadline: string }`, `RenewBookingInput { destinationSeasonId: string }`.
- Produces (catalog): `CatalogService.resolveSeasonById(tx: Prisma.TransactionClient, id: string): Promise<SeasonRange>` — mirror di `resolveSeasonWithin`, ritorna `{ ok: true, id, startDate, endDate } | { ok: false, reason: 'NO_SEASON' }`.
- Produces (DTO): `SubscriptionsQueryDto { seasonId: string }` con `@Matches(UUID_SHAPE)` (obbligatorio → 400).
- Produces (seed helper): `seedPricingTenant(...)` ritorna `{ seasonId, season2027Id, pricingId, packageId }`.

### Parte A — Contratti

- [ ] **Step A1: Aggiorna `packages/contracts/src/index.ts`**

`RenewBookingInput` (righe 164-168): rimpiazza `startDate` con `destinationSeasonId`:

```ts
/** Input per rinnovare un abbonamento (A4.2). L'unico input è la stagione di destinazione (per id);
 *  tutto il resto è COPIATO dalla sorgente (server-autoritativo). Prezzo ricalcolato sul nuovo listino. */
export interface RenewBookingInput {
  destinationSeasonId: string;   // id della Season di destinazione
}
```

`OpenRenewalCampaignInput` (righe 193-199): id invece di date:

```ts
/** Input per aprire una campagna di prelazione. Le stagioni sono identificate per id. Server-autoritativo. */
export interface OpenRenewalCampaignInput {
  originSeasonId: string;       // id della Season di ORIGINE (aventi-diritto)
  destinationSeasonId: string;  // id della Season di DESTINAZIONE (da riservare)
  deadline: string;             // ISO yyyy-mm-dd: scadenza della finestra (uniforme per campagna)
}
```

- [ ] **Step A2: Rebuild contratti**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build ok. (Il clear della cache vite si fa in Parte C prima dei test FE.)

### Parte B — Backend + e2e

- [ ] **Step B1: Aggiungi `resolveSeasonById` a `CatalogService` (RED via e2e più avanti; qui implementa direttamente il mirror)** — in `apps/api/src/catalog/catalog.service.ts`, dopo `resolveSeasonWithin` (riga 74):

```ts
  /** Risolve una stagione per id e ne ritorna l'intervallo (mirror per-id di resolveSeasonWithin). */
  async resolveSeasonById(tx: Prisma.TransactionClient, id: string): Promise<SeasonRange> {
    const season = await tx.season.findFirst({ where: { id } });
    if (!season) return { ok: false, reason: 'NO_SEASON' };
    return {
      ok: true,
      id: season.id,
      startDate: formatDbDate(season.startDate),
      endDate: formatDbDate(season.endDate),
    };
  }
```

- [ ] **Step B2: DTO per id** — aggiorna i tre DTO e creane uno nuovo.

`apps/api/src/bookings/dto/open-renewal-campaign.dto.ts`:

```ts
import type { OpenRenewalCampaignInput } from '@coralyn/contracts';
import { Matches } from 'class-validator';
import { IsCalendarDate } from '../../common/is-calendar-date';
import { UUID_SHAPE } from '../../common/uuid';

export class OpenRenewalCampaignDto implements OpenRenewalCampaignInput {
  @Matches(UUID_SHAPE, { message: 'originSeasonId non valido' })
  originSeasonId!: string;

  @Matches(UUID_SHAPE, { message: 'destinationSeasonId non valido' })
  destinationSeasonId!: string;

  @IsCalendarDate()
  deadline!: string;
}
```

`apps/api/src/bookings/dto/renewal-campaign-query.dto.ts`:

```ts
import { Matches } from 'class-validator';
import { UUID_SHAPE } from '../../common/uuid';

export class RenewalCampaignQueryDto {
  @Matches(UUID_SHAPE, { message: 'destinationSeasonId non valido' })
  destinationSeasonId!: string;
}
```

`apps/api/src/bookings/dto/renew-booking.dto.ts`:

```ts
import type { RenewBookingInput } from '@coralyn/contracts';
import { Matches } from 'class-validator';
import { UUID_SHAPE } from '../../common/uuid';

// Il client passa SOLO la stagione di destinazione (per id): cliente/ombrellone/pacchetto/prezzo sono
// copiati/derivati dal server. ValidationPipe({ whitelist: true }) scarta ogni altro campo.
export class RenewBookingDto implements RenewBookingInput {
  @Matches(UUID_SHAPE, { message: 'destinationSeasonId non valido' })
  destinationSeasonId!: string;
}
```

Nuovo `apps/api/src/bookings/dto/subscriptions-query.dto.ts` (dedicato, NON riusa `BookingsQueryDto`):

```ts
import { Matches } from 'class-validator';
import { UUID_SHAPE } from '../../common/uuid';

/** Query per GET /bookings/subscriptions: la stagione è obbligatoria (coerente con GET /rates di Slice A). */
export class SubscriptionsQueryDto {
  @Matches(UUID_SHAPE, { message: 'seasonId non valido' })
  seasonId!: string;
}
```

- [ ] **Step B3: `RenewalCampaignsService` risolve per id** — in `apps/api/src/bookings/renewal-campaigns.service.ts`:

`open` (righe 21-48): risolvi per id e rinomina il metodo di lettura:

```ts
  async open(input: OpenRenewalCampaignInput): Promise<RenewalCampaignDTO> {
    const tenantId = this.tenant.require();
    const row = await this.prisma.forTenant(tenantId, async (tx) => {
      const origin = await this.catalog.resolveSeasonById(tx, input.originSeasonId);
      if (!origin.ok) throw new UnprocessableEntityException('Stagione di origine non trovata');
      const dest = await this.catalog.resolveSeasonById(tx, input.destinationSeasonId);
      if (!dest.ok) throw new UnprocessableEntityException('Stagione di destinazione non trovata');
      if (origin.id === dest.id)
        throw new UnprocessableEntityException('Origine e destinazione devono differire');
      if (dest.startDate <= origin.startDate)
        throw new UnprocessableEntityException('La stagione di destinazione deve seguire quella di origine');
      try {
        return await tx.renewalCampaign.create({
          data: {
            establishmentId: tenantId,
            originSeasonId: origin.id,
            destinationSeasonId: dest.id,
            deadline: toDbDate(input.deadline),
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
          throw new ConflictException('Campagna già aperta per questa stagione');
        throw e;
      }
    });
    return { id: row.id, originSeasonId: row.originSeasonId, destinationSeasonId: row.destinationSeasonId, deadline: formatDbDate(row.deadline) };
  }
```

`getByDestinationDate` → rinomina in `getByDestinationSeasonId(seasonId: string)` e risolvi diretto (righe 50-99). Sostituisci l'header e le prime righe:

```ts
  /** Campagna per la stagione di destinazione (per id), con le finestre ordinate per anzianità. */
  async getByDestinationSeasonId(seasonId: string): Promise<RenewalCampaignDetailDTO | null> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const campaign = await tx.renewalCampaign.findFirst({ where: { destinationSeasonId: seasonId } });
      if (!campaign) return null;
      const origin = await tx.season.findFirst({ where: { id: campaign.originSeasonId } });
      if (!origin) return null;
      const dest = await tx.season.findFirst({ where: { id: campaign.destinationSeasonId } });
      if (!dest) return null;
      // ... resto invariato, ma usa `dest.startDate`/`dest.endDate` (già Date dal DB) al posto di toDbDate(dest.startDate):
```

⚠️ Nel corpo esistente, `dest` era `{ startDate: string }` da `resolveSeasonWithin`; ora `dest` è la riga Prisma (`Date`). Quindi:
- `const destStart = toDbDate(dest.startDate);` → `const destStart = dest.startDate;`
- `const destEnd = toDbDate(dest.endDate);` → `const destEnd = dest.endDate;`
Il resto (`subs`, `computeSeniority`, `windows`, `deadlineIso`, `isExpired`, `sort`, il `return`) resta identico.

- [ ] **Step B4: Controller campagne** — `apps/api/src/bookings/renewal-campaigns.controller.ts`, metodo `get` (righe 16-19):

```ts
  @Get()
  get(@Query() query: RenewalCampaignQueryDto): Promise<RenewalCampaignDetailDTO | null> {
    return this.campaigns.getByDestinationSeasonId(query.destinationSeasonId);
  }
```

- [ ] **Step B5: `BookingsService.renew` per id** — `apps/api/src/bookings/bookings.service.ts`, punto 3 (righe 273-278):

```ts
      // 3) Nuova stagione (semantica subscription), diversa da quella della sorgente.
      const season = await this.catalog.resolveSeasonById(tx, input.destinationSeasonId);
      if (!season.ok) throw new UnprocessableEntityException('Stagione di destinazione non trovata');
      if (season.startDate === formatDbDate(source.startDate))
        throw new UnprocessableEntityException('Il rinnovo deve puntare a una stagione diversa');
```

- [ ] **Step B6: `listSubscriptions` per id** — `apps/api/src/bookings/bookings.service.ts`, `listSubscriptions` (righe 296-299): cambia la firma e la risoluzione:

```ts
  /** Elenco abbonati confermati della stagione `seasonId`, con anzianità e flag rinnovato. */
  async listSubscriptions(seasonId: string): Promise<SubscriptionListItemDTO[]> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const season = await this.catalog.resolveSeasonById(tx, seasonId);
      if (!season.ok) return [];
      // ... resto invariato (usa season.startDate/season.endDate come oggi)
```

- [ ] **Step B7: Controller bookings subscriptions** — `apps/api/src/bookings/bookings.controller.ts`:
  - Aggiungi import `import { SubscriptionsQueryDto } from './dto/subscriptions-query.dto';`.
  - Metodo `subscriptions` (righe 20-23):

```ts
  @Get('subscriptions')
  subscriptions(@Query() query: SubscriptionsQueryDto): Promise<SubscriptionListItemDTO[]> {
    return this.bookings.listSubscriptions(query.seasonId);
  }
```

  - `GET /bookings` (list) resta con `BookingsQueryDto` + `resolveDate(query.date)` invariato. `resolveDate` resta importato (usato da `list`).

- [ ] **Step B8: Seed helper espone `season2027Id`** — `apps/api/test/helpers/seed-pricing.ts`:
  - Interfaccia: `export interface PricingSeedIds { seasonId: string; season2027Id: string; pricingId: string; packageId: string; }`.
  - `return { seasonId: season.id, season2027Id: season2027.id, pricingId: pricing.id, packageId: pkg.id };`.

- [ ] **Step B9: Riscrivi gli e2e per `seasonId`** — passa gli id al posto delle date. Le stagioni disponibili nel tenant `s1`: `2026` (`seedPricingTenant.seasonId`, 2026-05-01→09-30) e `2027` (`season2027Id`, 2027-05-01→09-30).

In `apps/api/test/bookings.e2e-spec.ts`:
- Cattura gli id dal seed (dove oggi si chiama `seedPricingTenant`): es. `const seed = await seedPricingTenant(prisma, s1, { afternoonSlotId: ids.slotAfternoon }); const season2026 = seed.seasonId; const season2027 = seed.season2027Id;` (adatta al nome di variabile già presente; se il valore di ritorno era ignorato, ora assegnalo).
- `GET /bookings/subscriptions?date=YYYY` → `?seasonId=<id>`:
  - riga ~280 `?date=2026-08-01` → `?seasonId=${season2026}`.
  - riga ~301 `?date=2026-08-01` → `?seasonId=${season2026}`; riga ~303 `?date=2027-08-01` → `?seasonId=${season2027}`.
  - riga ~354 `?date=2030-01-10` (nessuna stagione → []) → usa un UUID inesistente ben formato: `?seasonId=00000000-0000-0000-0000-0000000000ff` (deve dare 200 `[]`).
- `POST /bookings/:id/renew` body `{ startDate: '2027-07-01' }` → `{ destinationSeasonId: season2027 }` (righe ~288, ~309-310, ~317-318, ~324-325, ~333-334, ~338-339, ~349-350).
  - Il test "rinnovo verso stagione uguale → 422" (riga ~317-318, oggi `startDate: '2026-08-01'`) → `{ destinationSeasonId: season2026 }` (stessa stagione della sorgente → 422).
  - Il test "renew di una daily → 422" (riga ~323-325) → `{ destinationSeasonId: season2027 }`.
  - Il test cross-tenant (riga ~338-339) → `{ destinationSeasonId: season2027 }` (token2 → 404 perché la sorgente non è del tenant2; l'id stagione non serve esista nel tenant2 poiché il 404 sorgente precede la risoluzione).
- Aggiungi un test 400: `GET /bookings/subscriptions` senza `seasonId` → 400; con `seasonId` malformato → 400.

In `apps/api/test/renewal-campaigns.e2e-spec.ts`:
- Serve accesso agli id stagione. In `beforeAll`, il seed pricing è già chiamato riga 36: assegna il ritorno → `const seed = await seedPricingTenant(prisma, s1, { afternoonSlotId: ids.slotAfternoon });` e memorizza `season2026 = seed.seasonId; season2027 = seed.season2027Id;` in variabili `describe`-scope.
- Tutte le `POST /api/renewal-campaigns` `{ originDate, destinationDate, deadline }` → `{ originSeasonId, destinationSeasonId, deadline }`:
  - felice/duplicato/finestre/hold: `originDate:'2026-07-01'`→`originSeasonId: season2026`, `destinationDate:'2027-07-01'`→`destinationSeasonId: season2027`.
  - "originDate = destinationDate (stessa stagione) → 422" (righe 72-75): `{ originSeasonId: season2026, destinationSeasonId: season2026 }` (stessa → 422).
  - "destinazione precedente all'origine → 422" (righe 77-80): `{ originSeasonId: season2027, destinationSeasonId: season2026 }`.
  - "data senza stagione → 422" (righe 82-85) → rinomina in "stagione inesistente → 422": `{ originSeasonId: season2026, destinationSeasonId: '00000000-0000-0000-0000-0000000000ff' }` → 422.
- Tutte le `GET /api/renewal-campaigns?destinationDate=2027-07-01` → `?destinationSeasonId=${season2027}`; il caso "nessuna campagna per la destinazione" (riga 195, oggi `?destinationDate=2026-07-01`) → `?destinationSeasonId=${season2026}` (200 body vuoto).
- Il `renew` interno al blocco seniority (righe 122-123 `startDate: '2026-07-01'`) crea l'anzianità: la stagione 2025 è creata inline nel test, la 2026 è il seed. Quel renew punta a 2026 → `{ destinationSeasonId: season2026 }`. Il renew `srcJuniorId` verso 2027 (riga 169-170) → `{ destinationSeasonId: season2027 }`. Il renew di A (righe 276-277) → `{ destinationSeasonId: season2027 }`.
  - ⚠️ Il `src2025` (riga 120-121) è un `POST /api/bookings` con `startDate:'2025-07-01'` (crea l'abbonamento 2025): resta invariato (è una create, non un renew).

- [ ] **Step B10: Esegui api unit + e2e (GREEN)**

Run: `corepack pnpm --filter @coralyn/api test` → **≥ 83** (aggiungi almeno il conteggio invariato; nessun unit rimosso). Se aggiungi unit per `resolveSeasonById`, cresce.
Run: `corepack pnpm --filter @coralyn/api test:e2e` → **≥ 112** (i casi riscritti restano; +≥2 nuovi: subscriptions 400 senza/con seasonId malformato). Verde.
Se rosso, leggi l'errore: probabile id stagione non catturato o un `?date=`/`startDate` rimasto.

- [ ] **Step B11: (consigliato) unit per `resolveSeasonById`** — se esiste `apps/api/src/catalog/*.spec.ts` per `resolveSeasonWithin`, aggiungi il mirror: id esistente → `{ ok:true }`; id inesistente → `{ ok:false }`. Altrimenti la copertura e2e (422 stagione inesistente) è sufficiente; non creare un file nuovo solo per questo.

### Parte C — Frontend + MSW

- [ ] **Step C1: MSW — SEASON_2 + handler per id** — `apps/web-staff/src/mocks/server.ts`:
  - Dopo `SEASON_1` (riga 14) aggiungi: `const SEASON_2: SeasonDTO = { id: 'se-2', name: 'Estate 2027', startDate: '2027-05-01', endDate: '2027-09-30' };` e cambia `let seasons: SeasonDTO[] = [SEASON_1, SEASON_2];`; aggiorna `resetPricingSeed` a `seasons = [SEASON_1, SEASON_2];`.
  - `GET /api/bookings/subscriptions` (righe 133-143): filtra per `seasonId`:

```ts
  http.get('/api/bookings/subscriptions', ({ request }) => {
    const seasonId = new URL(request.url).searchParams.get('seasonId') ?? '';
    if (seasonId === 'se-2') {
      return HttpResponse.json([
        { id: 'sub-2027', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2027-05-01', endDate: '2027-09-30', totalPrice: 850, seniority: 2, renewed: false },
      ]);
    }
    return HttpResponse.json([
      { id: 'sub-1', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-05-01', endDate: '2026-09-30', totalPrice: 800, seniority: 1, renewed: false },
    ]);
  }),
```

  - `POST /api/bookings/:id/renew` (righe 144-150): il body ora è `{ destinationSeasonId }`:

```ts
  http.post('/api/bookings/:id/renew', async ({ params, request }) => {
    const b = (await request.json()) as { destinationSeasonId: string };
    return HttpResponse.json(
      { id: 'bk-renew', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2027-05-01', endDate: '2027-09-30', type: 'subscription', status: 'confirmed', totalPrice: 850, paymentStatus: 'unpaid', amountCollected: 0, previousBookingId: params.id as string },
      { status: 201 },
    );
  }),
```

  - `GET /api/renewal-campaigns` (righe 152-155): filtra per `destinationSeasonId`:

```ts
  http.get('/api/renewal-campaigns', ({ request }) => {
    const dest = new URL(request.url).searchParams.get('destinationSeasonId') ?? '';
    return HttpResponse.json(campaign && dest === 'se-2' ? campaign : null);
  }),
```

  - `POST /api/renewal-campaigns` (righe 156-165): body per id:

```ts
  http.post('/api/renewal-campaigns', async ({ request }) => {
    const b = (await request.json()) as { originSeasonId: string; destinationSeasonId: string; deadline: string };
    campaign = {
      id: 'camp-1', originSeasonId: b.originSeasonId, destinationSeasonId: b.destinationSeasonId, deadline: b.deadline,
      windows: [
        { sourceBookingId: 'sub-1', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1', seniority: 1, state: 'open' },
      ],
    };
    return HttpResponse.json({ id: campaign.id, originSeasonId: campaign.originSeasonId, destinationSeasonId: campaign.destinationSeasonId, deadline: campaign.deadline }, { status: 201 });
  }),
```

- [ ] **Step C2: queryKeys per seasonId** — `apps/web-staff/src/lib/queryKeys.ts`:

```ts
  subscriptions: (tenantId: string, seasonId: string) => ['subscriptions', tenantId, seasonId] as const,
  renewalCampaign: (tenantId: string, destinationSeasonId: string) => ['renewalCampaign', tenantId, destinationSeasonId] as const,
```

- [ ] **Step C3: `useRenewals.ts` per id** — `apps/web-staff/src/features/renewals/useRenewals.ts`:

```ts
/** Abbonati della stagione `seasonId` (campagna rinnovi). */
export function useSubscriptions(seasonId: Ref<string>) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.subscriptions(session.establishmentId, seasonId.value),
    queryFn: () => apiFetch<SubscriptionListItemDTO[]>(`/bookings/subscriptions?seasonId=${seasonId.value}`),
    enabled: () => !!seasonId.value,
  });
}

/** Rinnova un abbonamento nella stagione di destinazione (per id). */
export function useRenewBooking() {
  return mutationResource({
    mutationFn: ({ id, destinationSeasonId }: { id: string; destinationSeasonId: string }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/renew`, { method: 'POST', body: JSON.stringify({ destinationSeasonId }) }),
    invalidates: () => [['subscriptions'], ['map'], ['renewalCampaign']],
  });
}

/** Campagna di prelazione per la stagione di destinazione (per id, o null). */
export function useRenewalCampaign(destinationSeasonId: Ref<string>) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.renewalCampaign(session.establishmentId, destinationSeasonId.value),
    queryFn: () => apiFetch<RenewalCampaignDetailDTO | null>(`/renewal-campaigns?destinationSeasonId=${destinationSeasonId.value}`),
    enabled: () => !!destinationSeasonId.value,
  });
}

/** Apre una campagna (origine+destinazione per id + scadenza). */
export function useOpenCampaign() {
  return mutationResource({
    mutationFn: (input: { originSeasonId: string; destinationSeasonId: string; deadline: string }) =>
      apiFetch(`/renewal-campaigns`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [['renewalCampaign']],
  });
}
```

(`useCloseCampaign` invariato.)

- [ ] **Step C4: `RenewalsView.vue` — `<Select>` stagioni** — `apps/web-staff/src/features/renewals/RenewalsView.vue`:
  - Import: aggiungi `Select` a `@coralyn/ui-kit` e `useSeasons`:

```ts
import { Button, Badge, DataTable, Avatar, EmptyState, Select, initials } from '@coralyn/ui-kit';
import { useSeasons } from '@/features/pricing/useSeasons';
```

  - Stato: sostituisci `sourceDate`/`targetDate` con id-stagione. `deadline` resta.

```ts
const { data: seasons } = useSeasons();
const seasonOptions = computed(() => (seasons.value ?? []).map((s) => ({ value: s.id, label: s.name })));
const originSeasonId = ref('');
const destinationSeasonId = ref('');
const deadline = ref('');

// Default origine: la stagione che contiene activeDate se presente, altrimenti la prima.
watchEffect(() => {
  const list = seasons.value ?? [];
  if (!originSeasonId.value && list.length) {
    const containing = list.find((s) => s.startDate <= activeDate.value && activeDate.value <= s.endDate);
    originSeasonId.value = (containing ?? list[0]).id;
  }
});

const { data: subs } = useSubscriptions(originSeasonId);
const { data: campaign } = useRenewalCampaign(destinationSeasonId);
```

  (Aggiorna gli import Vue: `import { ref, computed, watchEffect } from 'vue';`.)

  - Handler:

```ts
function doRenew(id: string): void {
  if (!destinationSeasonId.value) return;
  renew.mutate({ id, destinationSeasonId: destinationSeasonId.value });
}
function doOpenCampaign(): void {
  if (!destinationSeasonId.value || !deadline.value) return;
  openCampaign.mutate({ originSeasonId: originSeasonId.value, destinationSeasonId: destinationSeasonId.value, deadline: deadline.value });
}
```

  - Template: le due `<label><input type="date">` (righe 58-67) diventano `<Select>`:

```vue
    <div class="mb-4 flex flex-wrap items-end gap-4">
      <label class="flex flex-col gap-1.5">
        <span class="text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Stagione di origine</span>
        <Select v-model="originSeasonId" data-test="origin-season" class="min-w-[170px]">
          <option v-for="o in seasonOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </Select>
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Stagione di destinazione</span>
        <Select v-model="destinationSeasonId" data-test="destination-season" class="min-w-[170px]">
          <option value="">Scegli…</option>
          <option v-for="o in seasonOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </Select>
      </label>
    </div>
```

  - Sostituisci ogni `targetDate` residuo con `destinationSeasonId` (pannello apri-campagna `v-if="destinationSeasonId && !campaign"`; i `:disabled="... || !targetDate"` sui bottoni Rinnova → `!destinationSeasonId`; il `deadline` input resta un date-picker).

- [ ] **Step C5: Rebuild contratti + clear cache vite + typecheck**

Run: `corepack pnpm --filter @coralyn/contracts build`
Run: `rm -rf apps/web-staff/node_modules/.vite`
Run: `corepack pnpm --filter @coralyn/web-staff typecheck` → nessun errore.

- [ ] **Step C6: Riscrivi `RenewalsView.spec.ts` per pilotare i `<Select>`** — sostituisci i `input[type="date"]` di origine/destinazione con i `<select>` `data-test`. La `deadline` resta l'unico `input[type="date"]`. Punti chiave:
  - Helper `setTargetDate` → `setDestination(w, 'se-2')`:

```ts
  async function setDestination(w: ReturnType<typeof mountApp>, seasonId: string) {
    const sel = w.get('[data-test="destination-season"]').element as HTMLSelectElement;
    sel.value = seasonId;
    sel.dispatchEvent(new Event('change'));
    await flushPromises();
    await tick();
    await flushPromises();
  }
```

  - Il test "Rinnova disabilitato senza destinazione" (righe 23-34): al posto di `setValue('2027-07-01')` sull'input date, usa `setDestination(w, 'se-2')`; l'asserzione disabled→enabled resta.
  - I test "Apri campagna", "dopo apertura", "422", "Chiudi campagna": `await setTargetDate(w, '2027-07-01')` → `await setDestination(w, 'se-2')`. La `deadline` è ora `w.findAll('input[type="date"]')[0]` (unico date input). Aggiorna gli indici.
  - Il test multi-stato (righe 125-164) monta un campaign via `server.use(http.get('/api/renewal-campaigns', () => HttpResponse.json(multiStateCampaign)))` e poi `setDestination(w,'se-2')`; invariato per il resto.
  - Il test "elenca abbonati" (righe 13-21): l'origine default è la prima stagione (se-1 → sub-1, "1 stagione"): invariato.

- [ ] **Step C7: Esegui web-staff (GREEN)**

Run: `corepack pnpm --filter @coralyn/web-staff test`
Expected: verde, totale ≥ del Layer 1. Nessun test rimosso.

- [ ] **Step C8: Commit (Layer 3)**

```bash
git add packages/contracts/src/index.ts apps/api/src/catalog/catalog.service.ts apps/api/src/bookings/ apps/api/test/ apps/web-staff/src/features/renewals/ apps/web-staff/src/lib/queryKeys.ts apps/web-staff/src/mocks/server.ts
git commit -m "feat(rinnovi): season-native end-to-end (contratti+backend seasonId, resolveSeasonById, FE Select stagioni) (catalog Conferme&Rinnovi L3)"
```

---

## Task 4 (Layer 4): Microcopy & affordance rinnovi + conferma "Chiudi campagna"

**Files:**
- Modify: `apps/web-staff/src/features/renewals/RenewalsView.vue`
- Modify: `apps/web-staff/src/features/renewals/RenewalsView.spec.ts`

**Interfaces:**
- Consumes: `ConfirmDialog` (Task 1), `RenewalsView` season-native (Task 3).

- [ ] **Step 1: Aggiungi i test di microcopy + conferma-chiudi (RED)** — in `apps/web-staff/src/features/renewals/RenewalsView.spec.ts`:

```ts
  it('mostra intestazione esplicativa e legenda badge', async () => {
    const w = mountApp(RenewalsView);
    await flushPromises();
    await tick();
    await flushPromises();
    expect(w.text()).toContain('prelazione'); // spiegazione della campagna
    expect(w.text()).toContain('diritto di precedenza'); // microcopy chiave
  });

  it('"Chiudi campagna" richiede conferma via ConfirmDialog prima della DELETE', async () => {
    const w = mountApp(RenewalsView, { attachTo: document.body });
    await flushPromises();
    await tick();
    await flushPromises();
    await setDestination(w, 'se-2');

    const deadlineInput = w.findAll('input[type="date"]')[0];
    await deadlineInput.setValue('2027-06-15');
    await w.findAll('button').find((b) => b.text().includes('Apri campagna'))?.trigger('click');
    await flushPromises(); await tick(); await flushPromises();
    expect(w.text()).toContain('Chiudi campagna');

    // Il click su "Chiudi campagna" apre la conferma, NON chiude subito.
    await w.findAll('button').find((b) => b.text().includes('Chiudi campagna'))?.trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Chiudere la campagna?');
    expect(w.text()).toContain('Chiudi campagna'); // ancora aperta finché non confermi

    // Conferma nel dialog → DELETE → torna al pannello apertura.
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Chiudi')!.click();
    await flushPromises(); await tick(); await flushPromises();
    expect(w.text()).toContain('Apri campagna di prelazione');

    w.unmount();
  });
```

⚠️ Il test esistente "Chiudi campagna invoca la DELETE e torna al pannello" (righe 100-123) va aggiornato: ora "Chiudi campagna" apre il dialog; aggiungi il click su conferma `Chiudi` nel `document.body` prima di asserire il ritorno al pannello. In alternativa rimpiazzalo con il nuovo test qui sopra (non ridurre il conteggio: se lo rimpiazzi, il nuovo lo sostituisce 1:1 e ne aggiungi un secondo → netto +1).

- [ ] **Step 2: Esegui e verifica RED**

Run: `corepack pnpm --filter @coralyn/web-staff test RenewalsView`
Expected: FAIL — manca la microcopy e la conferma-chiudi.

- [ ] **Step 3: Implementa microcopy + `ConfirmDialog` (GREEN)** — `apps/web-staff/src/features/renewals/RenewalsView.vue`:
  - Import: aggiungi `ConfirmDialog` a `@coralyn/ui-kit`.
  - Stato conferma-chiudi:

```ts
const closeConfirmOpen = ref(false);
function askCloseCampaign(): void { closeConfirmOpen.value = true; }
function onConfirmClose(): void {
  if (campaign.value) closeCampaign.mutate(campaign.value.id);
  closeConfirmOpen.value = false;
}
```

  (rimuovi la vecchia `doCloseCampaign` diretta.)
  - Template — intestazione esplicativa in testa alla `<section>` (prima della barra stagioni):

```vue
    <div class="mb-5 rounded-[14px] border border-[var(--color-border-row)] bg-[var(--color-raised)] p-4 text-[12.5px] leading-relaxed text-[var(--color-text-2nd)]">
      <p class="mb-1 font-semibold text-[var(--color-text)]">Prelazione abbonamenti</p>
      <p>
        Una <strong>campagna di prelazione</strong> riserva ogni ombrellone all'abbonato che lo aveva nella stagione
        precedente — un <strong>diritto di precedenza</strong> per anzianità — fino alla scadenza. Aprendola blocchi
        quei posti agli aventi-diritto; chiudendola (o alla scadenza) tornano liberi per tutti.
      </p>
    </div>
```

  - Legenda badge sopra la tabella campagna (dove `campaign && windowRows.length`):

```vue
    <div v-if="campaign" class="mb-2 flex flex-wrap gap-3 text-[11.5px] text-[var(--color-text-muted)]">
      <span class="inline-flex items-center gap-1.5"><Badge tone="neutral">Aperta</Badge> in attesa di rinnovo</span>
      <span class="inline-flex items-center gap-1.5"><Badge tone="success">Rinnovato</Badge> diritto esercitato</span>
      <span class="inline-flex items-center gap-1.5"><Badge tone="warning">Scaduta</Badge> finestra chiusa</span>
    </div>
```

  - CTA "Apri campagna": aggiungi un sottotesto; il bottone "Chiudi campagna" (riga 79) → `@click="askCloseCampaign"`. Migliora gli empty state: quando manca la destinazione mostra "Scegli una stagione di destinazione per gestire i rinnovi"; l'`EmptyState` abbonati resta "Nessun abbonato per questa stagione."
  - Prima di `</section>` aggiungi il dialog:

```vue
    <ConfirmDialog
      v-model:open="closeConfirmOpen"
      title="Chiudere la campagna?"
      description="Gli ombrelloni riservati per prelazione tornano liberi per tutti."
      confirm-label="Chiudi"
      tone="danger"
      @confirm="onConfirmClose"
    />
```

  - (Opzionale, coerenza) empty-state quando `!destinationSeasonId`: mostra il messaggio "Scegli una stagione di destinazione…". Verifica che il test C6 di Task 3 resti verde.

- [ ] **Step 4: Esegui e verifica GREEN**

Run: `corepack pnpm --filter @coralyn/web-staff test RenewalsView`
Expected: PASS. Poi l'intera suite web-staff: `corepack pnpm --filter @coralyn/web-staff test` → verde, conteggio ≥ Layer 3 (+≥1).

- [ ] **Step 5: Typecheck**

Run: `corepack pnpm --filter @coralyn/web-staff typecheck`
Expected: nessun errore.

- [ ] **Step 6: Commit (Layer 4)**

```bash
git add apps/web-staff/src/features/renewals/RenewalsView.vue apps/web-staff/src/features/renewals/RenewalsView.spec.ts
git commit -m "feat(rinnovi): microcopy prelazione + legenda badge + conferma Chiudi campagna via ConfirmDialog (catalog Conferme&Rinnovi L4)"
```

---

## Verifica finale (dopo i 4 commit)

- [ ] **Suite completa, tutti i pacchetti** (riverifica dal vivo, non regredire):

```
corepack pnpm --filter @coralyn/api test        # ≥ 83 unit
corepack pnpm --filter @coralyn/api test:e2e    # ≥ 112 e2e
corepack pnpm --filter @coralyn/web-staff test  # ≥ 119 + nuovi (include ui-kit)
corepack pnpm --filter @coralyn/ui-kit test     # 54 (49 + 5 ConfirmDialog)
```

- [ ] **Lint** (root): `corepack pnpm lint` → pulito sui file toccati.
- [ ] **Verifica live** (dev): `docker compose --profile full up -d --build api web`, login (`coralyn-admin-8473`), controlla: conferme delete (stagione/pacchetto/tariffa) col dialog; MapView errore prenotazione → toast + modale aperto; Rinnovi con i due `<Select>` stagione; "Chiudi campagna" col dialog; microcopy visibile.
- [ ] **Review whole-branch** (opus) prima di presentare lo stato all'utente.

## Note di rischio (dal design §8)
- **`resolveSeasonById`**: superficie piccola, mirror di `resolveSeasonWithin`; coperto da e2e (422 stagione inesistente + isolamento tenant via RLS, poiché `findFirst` fuori dal tenant non trova).
- **`BookingsQueryDto` condiviso**: NON modificato; `GET /bookings/subscriptions` usa il nuovo `SubscriptionsQueryDto`; `GET /bookings` resta invariato.
- **Cache FE**: le query key ora includono `seasonId` (niente collisione data→id).
- **e2e a cascata**: gli id stagione vengono dal seed (`season2027Id` nuovo); nessun conteggio cala.
- **ConfirmDialog e test window.confirm**: i vecchi `vi.spyOn(window,'confirm')` di `PricingView.spec` sono riscritti per cliccare il bottone del dialog.
