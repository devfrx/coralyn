# Fase A — Modali universali (header/body/footer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Dare a `Modal` e `Drawer` una struttura universale a 3 regioni — **header fisso · body scrollabile · footer fisso** (slot `#footer` opzionale) — e migrare tutti i consumer, così header e azioni non scorrono mai via.

**Architecture:** `DialogContent` diventa un flex-column senza scroll proprio; solo il body (`flex-1 overflow-auto`) scrolla. Il footer è un nuovo slot `#footer` reso solo se presente. I modali con `<form>` usano il pattern standard `<form id="x">` nel body + `<Button type="submit" form="x">` nel footer (l'attributo `form` associa il submit anche se il bottone è fuori dal `<form>`; passa via attribute-fallthrough sul `<button>` di `Button`, come già fa `type="submit"`).

**Tech Stack:** Vue 3 `<script setup>`, reka-ui (Dialog/teleport), Tailwind v4 (token in `theme.css`), Vitest + @vue/test-utils (ui-kit specs globati anche da web-staff), pnpm (`corepack pnpm`, mai npm).

---

## Convenzioni
- pnpm mai npm. Comandi da root. Filtro spec: `... test -- <Name>.spec`.
- Baseline da non regredire: ui-kit **100** · web-staff **305** · web-platform **16** · typecheck pulito.
- Teleport nei test: `attachTo: document.body`, `await nextTick()`, `document.body.querySelector`, `afterEach(()=>document.body.innerHTML='')`.
- `web-staff/vitest.config.ts` globa gli spec ui-kit → Modal/Drawer spec contano in entrambe le suite.
- Verifica LIVE sull'istanza dell'utente/Docker (il preview interno ha mismatch di porta).
- **Presenta e attendi conferma a fine fase** prima del merge FF.

## File map
- Modify: `packages/ui-kit/src/components/Modal.vue` (+ `Modal.spec.ts`), `Drawer.vue` (+ `Drawer.spec.ts`), `ConfirmDialog.vue`.
- Migrate (consumer): `SettlePaymentModal.vue`, `MapView.vue` (ModalFooter → `#footer`); `EditCustomerModal.vue`, `CreateEstablishmentModal.vue`, `CustomersView.vue`, `EstablishmentView.vue`, `EstablishmentStructureView.vue`, `PricingView.vue` (form pattern → `#footer`).
- ConfirmDialog (7 consumer) si sistemano automaticamente aggiornando `ConfirmDialog.vue`.

---

## Task 1: `Modal.vue` — 3 regioni + slot `#footer`

**Files:** Modify `packages/ui-kit/src/components/Modal.vue`, `packages/ui-kit/src/components/Modal.spec.ts`.

- [ ] **Step 1 — failing tests.** Append inside `describe('Modal', …)` in `Modal.spec.ts`:

```ts
  it('rende lo slot #footer in una regione dedicata quando presente', async () => {
    const wrapper = mount(Modal, {
      props: { open: true, title: 'Titolo' },
      slots: { default: '<p>corpo</p>', footer: '<button data-test="cta">Salva</button>' },
      attachTo: document.body,
    });
    await nextTick();
    const footerBtn = document.body.querySelector('[data-test="cta"]');
    expect(footerBtn).not.toBeNull();
    // il footer è fuori dal body scrollabile (regione separata con bordo superiore)
    const footerRegion = document.body.querySelector('[data-test="modal-footer-region"]')!;
    expect(footerRegion).not.toBeNull();
    expect(footerRegion.contains(footerBtn)).toBe(true);
  });

  it('senza slot #footer non rende la regione footer', async () => {
    mount(Modal, { props: { open: true, title: 'Titolo' }, slots: { default: 'x' }, attachTo: document.body });
    await nextTick();
    expect(document.body.querySelector('[data-test="modal-footer-region"]')).toBeNull();
  });

  it('il body è la regione scrollabile (overflow-auto), non il content', async () => {
    mount(Modal, { props: { open: true, title: 'Titolo' }, slots: { default: 'x' }, attachTo: document.body });
    await nextTick();
    const body = document.body.querySelector('[data-test="modal-body"]')!;
    expect(body.className).toContain('overflow-auto');
    const content = document.body.querySelector('[role="dialog"]')!;
    expect(content.className).not.toContain('overflow-auto');
  });
```
(These require `afterEach(() => { document.body.innerHTML = ''; })` — already in the file.)

- [ ] **Step 2 — confirm FAIL:** `corepack pnpm --filter @coralyn/ui-kit test -- Modal.spec` → FAIL.

- [ ] **Step 3 — implement.** Rewrite `Modal.vue` template (script unchanged) to 3 regions. Key changes: remove `overflow-auto` from `DialogContent`; wrap the slot in a `flex-1 overflow-auto` body; add an optional footer region.

```vue
<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-[80] bg-[rgba(11,53,67,.46)] data-[state=open]:[animation:overlay-in_var(--motion-base)_var(--ease-standard)] data-[state=closed]:[animation:overlay-out_var(--motion-fast)_var(--ease-standard)]" />
      <DialogContent class="fixed left-1/2 top-1/2 z-[80] flex max-h-[90vh] w-full max-w-[548px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[var(--radius-xl)] bg-[var(--color-surface)] [box-shadow:var(--shadow-modal)] focus:outline-none data-[state=open]:[animation:dialog-in_var(--motion-base)_var(--ease-emphasized)] data-[state=closed]:[animation:dialog-out_var(--motion-fast)_var(--ease-standard)]">
        <div class="flex shrink-0 items-start justify-between border-b border-[var(--color-border-row)] p-5">
          <div>
            <div v-if="eyebrow" class="mb-1 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--color-text-muted)]">{{ eyebrow }}</div>
            <DialogTitle class="text-[19px] font-bold tracking-[-.01em] text-[var(--color-text)]">{{ title }}</DialogTitle>
            <DialogDescription :class="description ? 'mt-1 text-[12.5px] text-[var(--color-text-2nd)]' : 'sr-only'">
              {{ description ?? title }}
            </DialogDescription>
          </div>
          <DialogClose as-child><IconButton icon="x" label="Chiudi" variant="subtle" /></DialogClose>
        </div>
        <div data-test="modal-body" class="flex-1 overflow-auto p-5"><slot /></div>
        <div v-if="$slots.footer" data-test="modal-footer-region" class="shrink-0 border-t border-[var(--color-border-row)] p-5 pt-4">
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
```
> `-translate-x/y-1/2` (TW v4 `translate` property) resta e centra; il content non scrolla più (lo fa il body); `max-h-[90vh]` tiene header/footer sempre a schermo.

- [ ] **Step 4 — confirm PASS:** `corepack pnpm --filter @coralyn/ui-kit test -- Modal.spec` → PASS (i test esistenti + i 3 nuovi).

- [ ] **Step 5 — commit:**
```bash
git add packages/ui-kit/src/components/Modal.vue packages/ui-kit/src/components/Modal.spec.ts
git commit -m "feat(ui-kit): Modal a 3 regioni (header fisso / body scroll / footer slot) — Fase A"
```

---

## Task 2: `Drawer.vue` — header fisso + body scroll + `#footer`

**Files:** Modify `packages/ui-kit/src/components/Drawer.vue`, `packages/ui-kit/src/components/Drawer.spec.ts`.

- [ ] **Step 1 — failing tests.** Append inside `describe('Drawer', …)`:

```ts
  it('il body scrolla e il footer (se presente) è in una regione dedicata', async () => {
    const w = mount(Drawer, {
      props: { open: true, title: 'Dettaglio' },
      slots: { default: '<p>corpo</p>', footer: '<button data-test="d-cta">Azione</button>' },
      attachTo: document.body,
    });
    await nextTick();
    const body = document.body.querySelector('[data-test="drawer-body"]')!;
    expect(body.className).toContain('overflow-auto');
    const footer = document.body.querySelector('[data-test="drawer-footer-region"]')!;
    expect(footer).not.toBeNull();
    expect(footer.contains(document.body.querySelector('[data-test="d-cta"]'))).toBe(true);
  });

  it('senza slot #footer non rende la regione footer', async () => {
    mount(Drawer, { props: { open: true, title: 'X' }, slots: { default: 'x' }, attachTo: document.body });
    await nextTick();
    expect(document.body.querySelector('[data-test="drawer-footer-region"]')).toBeNull();
  });
```

- [ ] **Step 2 — confirm FAIL.**

- [ ] **Step 3 — implement.** Rewrite `Drawer.vue` template (script unchanged):

```vue
<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-[rgba(11,53,67,.3)] data-[state=open]:[animation:overlay-in_var(--motion-base)_var(--ease-standard)] data-[state=closed]:[animation:overlay-out_var(--motion-fast)_var(--ease-standard)]" />
      <DialogContent class="fixed right-3 top-3 bottom-3 z-50 flex w-[380px] flex-col rounded-[var(--radius-xl)] bg-[var(--color-surface)] [box-shadow:var(--shadow-drawer)] focus:outline-none data-[state=open]:[animation:drawer-in_var(--motion-base)_var(--ease-emphasized)] data-[state=closed]:[animation:drawer-out_var(--motion-fast)_var(--ease-standard)]">
        <div class="flex shrink-0 items-center justify-between border-b border-[var(--color-border-row)] p-4">
          <DialogTitle class="text-base font-semibold text-[var(--color-text)]">{{ title }}</DialogTitle>
          <DialogClose as-child><IconButton icon="x" label="Chiudi" variant="subtle" /></DialogClose>
        </div>
        <div data-test="drawer-body" class="flex-1 overflow-auto p-4"><slot /></div>
        <div v-if="$slots.footer" data-test="drawer-footer-region" class="shrink-0 border-t border-[var(--color-border-row)] p-4"><slot name="footer" /></div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
```
> Il Drawer prima aveva `p-4` sul content e nessuno scroll; ora header/footer fissi con padding e il body scorre. Nota: i consumer del Drawer che oggi mettono tutto nello slot default continuano a funzionare (footer opzionale). Il padding del body (`p-4`) sostituisce il vecchio `p-4` del content.

- [ ] **Step 4 — confirm PASS.**

- [ ] **Step 5 — regression consumer Drawer.** Run `corepack pnpm --filter @coralyn/web-staff test` → verde. Il Drawer è usato in `MapView` (card ombrellone) — verificare che lo spec di MapView resti verde; se asseriva padding/struttura interna del Drawer, aggiornare al nuovo body. Report.

- [ ] **Step 6 — commit:**
```bash
git add packages/ui-kit/src/components/Drawer.vue packages/ui-kit/src/components/Drawer.spec.ts
git commit -m "feat(ui-kit): Drawer con header fisso, body scroll e footer slot — Fase A"
```

---

## Task 3: `ConfirmDialog.vue` — footer via `#footer` (sistema 7 consumer)

**Files:** Modify `packages/ui-kit/src/components/ConfirmDialog.vue` (+ `ConfirmDialog.spec.ts` se esiste).

- [ ] **Step 1 — check spec.** `ls packages/ui-kit/src/components/ConfirmDialog.spec.ts`. Se esiste, leggilo per capire cosa asserisce (probabile: emette confirm/cancel). Aggiungi (o adatta) un test che il footer (i due Button) sia reso nella regione footer del Modal:
```ts
  it('monta i bottoni nella regione footer del Modal', async () => {
    mount(ConfirmDialog, { props: { open: true, title: 'T', confirmLabel: 'OK' }, attachTo: document.body });
    await nextTick();
    const footer = document.body.querySelector('[data-test="modal-footer-region"]')!;
    expect(footer).not.toBeNull();
    expect(footer.textContent).toContain('OK');
    document.body.innerHTML = '';
  });
```
(Se non esiste `ConfirmDialog.spec.ts`, crealo minimale con questo + un test confirm/cancel di base seguendo il pattern di `Modal.spec.ts`.)

- [ ] **Step 2 — confirm FAIL.**

- [ ] **Step 3 — implement.** In `ConfirmDialog.vue`, spostare `<ModalFooter>` dal default slot allo slot `#footer` del `Modal`:
```vue
  <Modal v-model:open="open" :title="title" :description="description">
    <slot />
    <template #footer>
      <ModalFooter
        :submit-label="confirmLabel"
        :cancel-label="cancelLabel"
        :submit-variant="submitVariant"
        @submit="onConfirm"
        @cancel="onCancelButton"
      />
    </template>
  </Modal>
```
(Script invariato.)

- [ ] **Step 4 — confirm PASS + regression dei 7 consumer ConfirmDialog:**
`corepack pnpm --filter @coralyn/ui-kit test -- ConfirmDialog.spec` → PASS.
`corepack pnpm --filter @coralyn/web-staff test` e `--filter @coralyn/web-platform test` → verdi (CustomerDetailView, EstablishmentStructureView, EstablishmentView, PricingView, RenewalsView, EstablishmentDetailView, EstablishmentsListView usano ConfirmDialog). Report.

- [ ] **Step 5 — commit:**
```bash
git add packages/ui-kit/src/components/ConfirmDialog.vue packages/ui-kit/src/components/ConfirmDialog.spec.ts
git commit -m "refactor(ui-kit): ConfirmDialog usa lo slot #footer del Modal — Fase A"
```

---

## Task 4: Consumer con `ModalFooter` diretto → `#footer`

**Files:** Modify `apps/web-staff/src/features/bookings/SettlePaymentModal.vue`, `apps/web-staff/src/features/map/MapView.vue`.

- [ ] **Step 1 — leggere i due file** e individuare il `<ModalFooter …>` dentro il `<Modal>`.

- [ ] **Step 2 — implement.** In ciascuno, avvolgere il `<ModalFooter>` (e eventuali azioni footer) in `<template #footer>`:
```vue
  <Modal ...>
    <!-- corpo invariato -->
    <template #footer>
      <ModalFooter ... />
    </template>
  </Modal>
```
Non cambiare props/handler del ModalFooter.

- [ ] **Step 3 — regression:** `corepack pnpm --filter @coralyn/web-staff test` → verde (SettlePaymentModal.spec, MapView.spec). Se uno spec asseriva la posizione del footer nel DOM, aggiornarlo al `data-test="modal-footer-region"`. Report.

- [ ] **Step 4 — commit:**
```bash
git add apps/web-staff/src/features/bookings/SettlePaymentModal.vue apps/web-staff/src/features/map/MapView.vue
git commit -m "refactor(web-staff): SettlePaymentModal e MapView spostano il footer nello slot #footer — Fase A"
```

---

## Task 5: Consumer con `<form>` → pattern `form=` + `#footer`

**Files:** Modify `apps/web-staff/src/features/customers/EditCustomerModal.vue`, `apps/web-platform/src/features/establishments/CreateEstablishmentModal.vue`, `apps/web-staff/src/features/customers/CustomersView.vue`, `apps/web-staff/src/features/establishment/EstablishmentView.vue`, `apps/web-staff/src/features/establishment/EstablishmentStructureView.vue`, `apps/web-staff/src/features/pricing/PricingView.vue`.

> Alcuni file hanno PIÙ modali (form + ConfirmDialog): tocca **solo** i modali con `<form>` e footer inline. Il ConfirmDialog è già gestito dal Task 3.

- [ ] **Step 1 — pattern (applicare a ogni modale form-based).** Esempio su `EditCustomerModal.vue`:
  - Dare un `id` al form e togliere i bottoni dal suo interno.
  - Mettere i bottoni in `<template #footer>` col `form="id"` sul submit.

Da:
```vue
  <Modal v-model:open="open" title="Modifica cliente">
    <form data-test="form-edit-customer" class="flex flex-col gap-4" @submit.prevent="submit">
      … campi …
      <div class="flex justify-end gap-2.5 pt-1">
        <Button variant="secondary" type="button" @click="open = false">Annulla</Button>
        <Button type="submit">Salva</Button>
      </div>
    </form>
  </Modal>
```
A:
```vue
  <Modal v-model:open="open" title="Modifica cliente">
    <form id="form-edit-customer" data-test="form-edit-customer" class="flex flex-col gap-4" @submit.prevent="submit">
      … campi …
    </form>
    <template #footer>
      <div class="flex justify-end gap-2.5">
        <Button variant="secondary" type="button" @click="open = false">Annulla</Button>
        <Button type="submit" form="form-edit-customer">Salva</Button>
      </div>
    </template>
  </Modal>
```
> `type="submit" form="form-edit-customer"` associa il submit al form anche dal footer (fuori dal `<form>`). `Button` inoltra `type`/`form` via attribute-fallthrough (come già inoltra `type="submit"`). Usare un `id` **univoco** per ogni form (es. `form-crea-stabilimento`, `form-crea-cliente`, ecc.).

- [ ] **Step 2 — applicare a tutti e 6** i modali form-based, un file alla volta, verificando lo spec del file dopo ciascuno:
`corepack pnpm --filter @coralyn/web-staff test -- <NomeFile>.spec` (e web-platform per CreateEstablishmentModal). Se uno spec fa `find('[data-test="form-…"]').trigger('submit')` continuerà a funzionare (il form esiste ancora, ora con `id`); se clicca il bottone Salva, il click emette submit via `form=` → in jsdom il submit del form associato **potrebbe non propagarsi** come nel browser: se un test clicca "Salva" e si aspetta la mutation, **preferire** `form.trigger('submit')` (già così nella maggior parte). Aggiornare i test che cliccano il submit per triggerare il `submit` sul form, motivando nel commit.

- [ ] **Step 3 — full regression + typecheck:**
`corepack pnpm --filter @coralyn/web-staff test` · `--filter @coralyn/web-platform test` · `--filter @coralyn/ui-kit test` · `corepack pnpm -r typecheck` → tutti verdi/pulito. Report conteggi.

- [ ] **Step 4 — commit:**
```bash
git add apps/web-staff/src/features/customers/EditCustomerModal.vue apps/web-platform/src/features/establishments/CreateEstablishmentModal.vue apps/web-staff/src/features/customers/CustomersView.vue apps/web-staff/src/features/establishment/EstablishmentView.vue apps/web-staff/src/features/establishment/EstablishmentStructureView.vue apps/web-staff/src/features/pricing/PricingView.vue
git commit -m "refactor(web): modali con form migrati allo slot #footer (pattern form=) — Fase A"
```

---

## Task 6: Verifica finale + consegna

- [ ] **Step 1 — suite completa:** ui-kit · web-staff · web-platform · `-r typecheck` tutti verdi/pulito (conteggi = baseline + i nuovi test di Modal/Drawer/ConfirmDialog). Report.
- [ ] **Step 2 — verifica LIVE** (istanza utente/Docker): aprire un modale corto (EditCustomer), uno lungo (Nuova prenotazione in MapView, o PricingView) e un Drawer (card ombrellone): confermare header e footer **fissi**, scroll del **solo** corpo, submit dei form funzionante dal footer. Screenshot.
- [ ] **Step 3 — presenta e attendi conferma** per il merge FF su `main`.

---

## Self-review del piano (eseguita)
- **Copertura spec §3:** Task1 Modal, Task2 Drawer, Task3 ConfirmDialog (7 consumer), Task4 ModalFooter-diretti (2), Task5 form-based (6). Tutti i 13 consumer coperti (7+2+ i 6 form; alcuni file compaiono per più modali → gestiti per-modale). ✔
- **Rischio form/submit** esplicitato (pattern `form=` + nota sui test che cliccano il submit). ✔
- **Placeholder:** nessuno; codice mostrato per ogni camb, id di form indicati univoci. ✔
- **Coerenza nomi:** `data-test="modal-footer-region"`/`modal-body`/`drawer-footer-region`/`drawer-body`, slot `#footer` coerenti tra Modal/Drawer/ConfirmDialog e i test. ✔
- **Baseline:** i nuovi test (Modal +3, Drawer +2, ConfirmDialog +1/nuovo file) spostano i conteggi; l'esecutore li conferma. `web-staff` globa gli spec ui-kit. ✔
