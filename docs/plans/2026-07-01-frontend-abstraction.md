# Astrazione componenti frontend (ui-kit + web-staff shared) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usa `superpowers:subagent-driven-development`
> (consigliato) o `superpowers:executing-plans` per implementare task-by-task. Gli step usano
> checkbox (`- [ ]`).

**Goal:** Ridurre la duplicazione tra le viste `web-staff` estraendo componenti/utility/composable
riutilizzabili, **senza cambiare la resa visiva**. Nuove primitive `ui-kit` (`EmptyState`, `Select`,
`ModalFooter`, `PageToolbar`), utility pure (`formatEuro`/`initials`/`dateRange`), `DataTable`
data-driven **retro-compatibile**, shared `web-staff` di dominio (`useEntityLabels`, `statusMaps`,
`useQueryResource`), e adozione incrementale in 8 viste (Bookings → Renewals → SettlePaymentModal →
Customers → CustomerDetail → MapView(modale) → Pricing → Report).

**Architecture:** Nessun cambiamento di comportamento osservabile. `ui-kit` resta **generico** (zero
import di dominio); `web-staff/src/lib` ospita le astrazioni **di dominio**. `DataTable` guadagna
una modalità *data-driven* opzionale (`rows`/`rowKey`/`#cell-<key>`) che coesiste con l'attuale API a
slot-body: le viste migrano una alla volta, nessun big-bang. Ogni estrazione è **strutturale**: le
classi Tailwind/il DOM emesso devono **coincidere esattamente** con quelli attuali (copiare
verbatim, mai riscrivere).

**Tech Stack:** Vue 3 + TanStack Query + MSW + Vitest (FE); `@coralyn/ui-kit` (design system) +
`@coralyn/contracts` (tipi condivisi). Nessun cambiamento API/DB/backend in questo piano.

**Spec di riferimento:**
[docs/specs/2026-07-01-frontend-abstraction-design.md](../specs/2026-07-01-frontend-abstraction-design.md).
**ADR di riferimento:**
[docs/architecture/decisions/0033-astrazione-componenti-frontend.md](../architecture/decisions/0033-astrazione-componenti-frontend.md).
**Convenzione:** codice/DB in inglese (ADR-0030); UI/doc in italiano. `corepack pnpm` (pin
**11.9.0**). Typecheck: `corepack pnpm --filter @coralyn/web-staff typecheck`. Test ui-kit:
`corepack pnpm --filter @coralyn/ui-kit test`. Test web-staff: `corepack pnpm --filter
@coralyn/web-staff test`. **Dopo ogni modifica a `ui-kit`**: `corepack pnpm --filter
@coralyn/ui-kit build` **prima** che `web-staff` consumi i nuovi export; se i tipi/export
risultano stale in web-staff, pulire `apps/web-staff/node_modules/.vite` e ri-eseguire i test.

**Baseline da non regredire (verificata all'atto della scrittura del piano):** ui-kit **14** test ·
web-staff **47** test (post-A4.2) — **+** i nuovi spec di componenti/util/composable introdotti dal
piano. `corepack pnpm -r build` + `corepack pnpm eslint .` verdi.

> **Nota esecuzione:** questo piano è stato scritto e verificato (baseline test contati dal vivo) in
> una sessione di **design/pianificazione**. **L'esecuzione è delegata alla sessione successiva**
> (vedi [docs/handoff/2026-07-01-frontend-abstraction-delegation.md](../handoff/2026-07-01-frontend-abstraction-delegation.md)).
> Questo documento è l'artefatto eseguibile: nessun task è stato eseguito, nessun commit creato.

> **Vincolo ferreo — zero regressione visiva:** ogni step di estrazione **quota le classi esatte**
> dalla vista sorgente (con file:riga) che il nuovo componente deve riprodurre **identiche**. Non
> arrotondare, non "pulire", non rinominare classi. Ogni task di adozione vista (Fase 4) verifica (a)
> lo spec di vista esistente resta verde e (b) uno screenshot before/after via `preview_start` +
> `preview_screenshot`/`preview_inspect` sul dev server (`corepack pnpm --filter @coralyn/web-staff
> dev`, porta 5173).

---

## File map

- **Crea** `packages/ui-kit/src/components/EmptyState.vue` + `EmptyState.spec.ts`.
- **Crea** `packages/ui-kit/src/components/Select.vue` + `Select.spec.ts`.
- **Crea** `packages/ui-kit/src/components/ModalFooter.vue` + `ModalFooter.spec.ts`.
- **Crea** `packages/ui-kit/src/components/PageToolbar.vue` + `PageToolbar.spec.ts`.
- **Modifica** `packages/ui-kit/src/index.ts` — esporta i 4 nuovi componenti + `format.ts` + classi cella.
- **Crea** `packages/ui-kit/src/format.ts` + `format.spec.ts` — `formatEuro`/`initials`/`dateRange`.
- **Crea** `packages/ui-kit/src/styles/table.css` — classi cella `.td`/`.td-first`/`.td-right`/`.td-num`.
- **Modifica** `packages/ui-kit/src/components/DataTable.vue` + crea `DataTable.spec.ts` — modalità data-driven additiva.
- **Crea** `apps/web-staff/src/lib/useEntityLabels.ts` + `useEntityLabels.spec.ts`.
- **Crea** `apps/web-staff/src/lib/statusMaps.ts` + `statusMaps.spec.ts`.
- **Crea** `apps/web-staff/src/lib/useQueryResource.ts` + `useQueryResource.spec.ts`.
- **Modifica** `apps/web-staff/src/features/bookings/BookingsView.vue` (+ spec resta verde).
- **Modifica** `apps/web-staff/src/features/renewals/RenewalsView.vue` (+ spec resta verde).
- **Modifica** `apps/web-staff/src/features/bookings/SettlePaymentModal.vue` (nessuno spec dedicato oggi: copre `BookingsView.spec.ts`/`MapView.spec.ts`).
- **Modifica** `apps/web-staff/src/features/customers/CustomersView.vue` (+ spec resta verde).
- **Modifica** `apps/web-staff/src/features/customers/CustomerDetailView.vue` (+ spec resta verde).
- **Modifica** `apps/web-staff/src/features/map/MapView.vue` (+ spec resta verde).
- **Modifica** `apps/web-staff/src/features/pricing/PricingView.vue` (nessuno spec dedicato: verificato solo via build+typecheck+screenshot).
- **Modifica** `apps/web-staff/src/features/report/ReportView.vue` (nessuno spec dedicato: verificato solo via build+typecheck+screenshot).
- **Modifica** `apps/web-staff/src/features/bookings/useBookings.ts`, `usePackages.ts`, `useBookingQuote.ts`, `apps/web-staff/src/features/customers/useCustomers.ts`, `apps/web-staff/src/features/map/useDayMap.ts`, `apps/web-staff/src/features/renewals/useRenewals.ts` — riscritti sopra `useQueryResource` (Task 3, Step finale), **stessa firma pubblica**.

---

## Task 1: ui-kit primitive — `EmptyState`, `Select`, `ModalFooter`, `PageToolbar`

**Files:** Crea `packages/ui-kit/src/components/EmptyState.vue`,
`packages/ui-kit/src/components/EmptyState.spec.ts`,
`packages/ui-kit/src/components/Select.vue`, `packages/ui-kit/src/components/Select.spec.ts`,
`packages/ui-kit/src/components/ModalFooter.vue`,
`packages/ui-kit/src/components/ModalFooter.spec.ts`,
`packages/ui-kit/src/components/PageToolbar.vue`,
`packages/ui-kit/src/components/PageToolbar.spec.ts`; Modifica `packages/ui-kit/src/index.ts`

Nessuna vista è ancora migrata in questo task: i componenti esistono e sono testati in isolamento
(spec §8, fase 1).

### 1.1 `EmptyState.vue`

**Classi da preservare** — quotate da `BookingsView.vue:110-115`:
```
rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-6 py-10 text-center text-sm text-[var(--color-text-2nd)]
```
(identiche in `RenewalsView.vue:77-79`, stessa lista di classi su una riga).

- [ ] **Step 1: Scrivi lo spec (fallisce: il componente non esiste)**

Crea `packages/ui-kit/src/components/EmptyState.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import EmptyState from './EmptyState.vue';

describe('EmptyState', () => {
  it('rende il messaggio con le classi standard', () => {
    const w = mount(EmptyState, { props: { message: 'Nessuna prenotazione per questa data.' } });
    expect(w.text()).toBe('Nessuna prenotazione per questa data.');
    const p = w.find('p');
    expect(p.classes()).toEqual(
      expect.arrayContaining([
        'rounded-[var(--radius-lg)]',
        'border',
        'border-dashed',
        'border-[var(--color-border)]',
        'px-6',
        'py-10',
        'text-center',
        'text-sm',
        'text-[var(--color-text-2nd)]',
      ]),
    );
  });

  it('con slot #default rende il contenuto ricco invece del testo prop', () => {
    const w = mount(EmptyState, {
      props: { message: 'ignorato' },
      slots: { default: '<span data-test="icona">★</span> Nessun abbonato.' },
    });
    expect(w.find('[data-test="icona"]').exists()).toBe(true);
    expect(w.text()).toContain('Nessun abbonato.');
    expect(w.text()).not.toContain('ignorato');
  });
});
```

- [ ] **Step 2: Esegui lo spec (deve fallire)**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- EmptyState`
Expected: FAIL (`Failed to resolve import "./EmptyState.vue"`).

- [ ] **Step 3: Crea il componente**

Crea `packages/ui-kit/src/components/EmptyState.vue`:

```vue
<script setup lang="ts">
defineProps<{ message: string }>();
</script>
<template>
  <p class="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-6 py-10 text-center text-sm text-[var(--color-text-2nd)]">
    <slot>{{ message }}</slot>
  </p>
</template>
```

> Slot opzionale `#default`: se il chiamante non lo popola, Vue usa il contenuto di fallback (la
> prop `message`) — comportamento standard degli slot, nessuna logica aggiuntiva necessaria.

- [ ] **Step 4: Esegui lo spec (deve passare)**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- EmptyState`
Expected: PASS (2 test).

### 1.2 `Select.vue`

**Classi da preservare** — quotate da `RenewalsView.vue:51` (identiche a `55`, e allo stile
`inputClass` di `SettlePaymentModal.vue:27-28`):
```
rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[13.5px] text-[var(--color-text)] focus:outline-none
```
E dai `<select>` inline di `MapView.vue:282` / `:290` / `:309`:
```
w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none
```

> **Nota di allineamento (risoluzione ambiguità):** la spec (§3.2) chiede di "allineare a `Input.vue`
> così Field+Input+Select sono omogenei", ma le classi *attualmente* inline nelle viste (quotate
> sopra) usano dimensioni leggermente diverse da `Input.vue` (che usa `rounded-[var(--radius-md)]`,
> `px-3.5 py-3`, `text-sm`, focus-ring completo). Il **vincolo ferreo di fedeltà pixel (ADR-0033 §2)
> ha priorità**: `Select.vue` deve emettere **esattamente** le classi oggi presenti in `MapView.vue`
> (il consumer target, §3.2 "Adozione: MapView"), **non** una rilettura delle classi di `Input.vue`.
> Il componente adotta quindi le classi del `<select>` di `MapView.vue` verbatim (uguali, a meno di
> `w-full`, a quelle di `RenewalsView`/`SettlePaymentModal`, che restano su `<input>` semplici e non
> vengono toccate in questo task). Nessuna riga preesistente cambia aspetto.

- [ ] **Step 1: Scrivi lo spec (fallisce: il componente non esiste)**

Crea `packages/ui-kit/src/components/Select.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Select from './Select.vue';

describe('Select', () => {
  it('rende le option da props.options e supporta v-model', async () => {
    const w = mount(Select, {
      props: {
        options: [
          { value: 'a', label: 'Alfa' },
          { value: 'b', label: 'Beta' },
        ],
        modelValue: 'a',
        'onUpdate:modelValue': (v: string) => w.setProps({ modelValue: v }),
      },
    });
    const options = w.findAll('option');
    expect(options).toHaveLength(2);
    expect(options[0].text()).toBe('Alfa');
    expect(w.find('select').element.value).toBe('a');
  });

  it('con slot #default rende gli <option> passati (gruppi/"Nessun…")', () => {
    const w = mount(Select, {
      props: { modelValue: '' },
      slots: { default: '<option value="">Nessun pacchetto</option><option value="p1">Standard</option>' },
    });
    expect(w.findAll('option')).toHaveLength(2);
    expect(w.text()).toContain('Nessun pacchetto');
  });

  it('emette le classi standard del select stilizzato', () => {
    const w = mount(Select, { props: { modelValue: '' } });
    expect(w.find('select').classes()).toEqual(
      expect.arrayContaining([
        'w-full',
        'rounded-[11px]',
        'border-[1.5px]',
        'border-[var(--color-border-input)]',
        'bg-[var(--color-surface)]',
        'px-3.5',
        'py-3',
        'text-[13.5px]',
        'text-[var(--color-text)]',
        'focus:outline-none',
      ]),
    );
  });

  it('passa attraverso gli attributi nativi (inheritAttrs coerente con Input.vue)', () => {
    const w = mount(Select, { props: { modelValue: '' }, attrs: { name: 'pacchetto', disabled: true } });
    expect(w.find('select').attributes('name')).toBe('pacchetto');
    expect(w.find('select').attributes('disabled')).toBeDefined();
  });
});
```

- [ ] **Step 2: Esegui lo spec (deve fallire)**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- Select`
Expected: FAIL (`Failed to resolve import "./Select.vue"`).

- [ ] **Step 3: Crea il componente**

Crea `packages/ui-kit/src/components/Select.vue`:

```vue
<script setup lang="ts">
withDefaults(defineProps<{ options?: { value: string; label: string }[] }>(), { options: () => [] });
const model = defineModel<string>();
</script>
<template>
  <select
    v-model="model"
    v-bind="$attrs"
    class="w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none"
  >
    <slot>
      <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
    </slot>
  </select>
</template>
```

> `inheritAttrs` di default è `true` (come `Input.vue`, che non lo disattiva): gli attributi non
> dichiarati come prop (es. `name`, `disabled`) atterrano sul root element (`<select>`), coerente col
> passthrough di `Input.vue`.

- [ ] **Step 4: Esegui lo spec (deve passare)**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- Select`
Expected: PASS (4 test).

### 1.3 `ModalFooter.vue`

**Classi da preservare** — quotate da `CustomersView.vue:60-63`:
```
flex justify-end gap-2.5 pt-1
```
(bottone Annulla: `Button variant="secondary" type="button"`; bottone submit: `Button type="submit"`).
`SettlePaymentModal.vue:96-99` usa `pt-2` invece di `pt-1` per lo stesso pattern (bottoni non-submit,
`@click`); `MapView.vue:320-323` (modale prenotazione) usa anch'esso `pt-2`.

> **Nota di ambiguità risolta:** i tre modali NON condividono lo stesso spaziatore verticale
> (`CustomersView` usa `pt-1`, `SettlePaymentModal`/`MapView` usano `pt-2`). Il vincolo di fedeltà
> pixel impone di **non forzare un valore unico** che cambierebbe la resa in uno dei tre. `ModalFooter`
> espone quindi una prop opzionale `class` passthrough (comportamento nativo Vue: la classe passata
> dal parent si fonde con quella di default) — il default è `pt-1` (il footer "canonico" da cui il
> componente nasce, `CustomersView`), e i consumer con spaziatura diversa passano `class="pt-2"`
> esplicitamente in adozione (Fase 4, Task 3.3/3.6). Nessuna nuova prop dedicata: `class` passthrough
> è già comportamento standard di Vue SFC e non richiede `defineProps`.

- [ ] **Step 1: Scrivi lo spec (fallisce: il componente non esiste)**

Crea `packages/ui-kit/src/components/ModalFooter.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ModalFooter from './ModalFooter.vue';

describe('ModalFooter', () => {
  it('rende Annulla (secondary) + submitLabel (primary) e le classi del wrapper', () => {
    const w = mount(ModalFooter, { props: { submitLabel: 'Salva cliente' } });
    const wrapper = w.find('div');
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['flex', 'justify-end', 'gap-2.5', 'pt-1']));
    const buttons = w.findAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].text()).toBe('Annulla');
    expect(buttons[1].text()).toBe('Salva cliente');
  });

  it('supporta cancelLabel custom e submitVariant danger', () => {
    const w = mount(ModalFooter, { props: { cancelLabel: 'Chiudi', submitLabel: 'Elimina', submitVariant: 'danger' } });
    const buttons = w.findAll('button');
    expect(buttons[0].text()).toBe('Chiudi');
    expect(buttons[1].text()).toBe('Elimina');
  });

  it('emette cancel/submit al click', async () => {
    const w = mount(ModalFooter, { props: { submitLabel: 'Conferma' } });
    await w.findAll('button')[0].trigger('click');
    await w.findAll('button')[1].trigger('click');
    expect(w.emitted('cancel')).toHaveLength(1);
    expect(w.emitted('submit')).toHaveLength(1);
  });

  it('submitDisabled disabilita il bottone di conferma', () => {
    const w = mount(ModalFooter, { props: { submitLabel: 'Conferma', submitDisabled: true } });
    expect(w.findAll('button')[1].attributes('disabled')).toBeDefined();
  });
});
```

- [ ] **Step 2: Esegui lo spec (deve fallire)**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- ModalFooter`
Expected: FAIL (`Failed to resolve import "./ModalFooter.vue"`).

- [ ] **Step 3: Crea il componente**

Crea `packages/ui-kit/src/components/ModalFooter.vue`:

```vue
<script setup lang="ts">
import Button from './Button.vue';

withDefaults(
  defineProps<{
    cancelLabel?: string;
    submitLabel: string;
    submitDisabled?: boolean;
    submitVariant?: 'primary' | 'danger';
  }>(),
  { cancelLabel: 'Annulla', submitDisabled: false, submitVariant: 'primary' },
);
defineEmits<{ cancel: []; submit: [] }>();
</script>
<template>
  <div class="flex justify-end gap-2.5 pt-1">
    <slot name="extra" />
    <Button type="button" variant="secondary" @click="$emit('cancel')">{{ cancelLabel }}</Button>
    <Button type="button" :variant="submitVariant" :disabled="submitDisabled" @click="$emit('submit')">{{ submitLabel }}</Button>
  </div>
</template>
```

> Il caller sovrascrive `pt-1` passando `class="pt-2"` sul componente (fusione classi standard Vue) —
> vedi nota sopra. Slot opzionale `#extra` per contenuto a sinistra (spec §3.3: "slot opzionale per
> contenuto extra a sinistra") — nessun consumer attuale lo usa, resta disponibile per l'adozione.

- [ ] **Step 4: Esegui lo spec (deve passare)**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- ModalFooter`
Expected: PASS (4 test).

### 1.4 `PageToolbar.vue`

**Classi da preservare** — quotate da `BookingsView.vue:82`:
```
mb-4 flex flex-wrap items-center gap-3
```
più lo spacer `BookingsView.vue:84`:
```
<div class="flex-1"></div>
```
Identiche in `CustomersView.vue:27` (+spacer `:31`) e `MapView.vue:166` (+spacer `:168`, dove però il
contenitore ha anche `px-[26px] pt-4` **sul genitore**, non sul toolbar stesso — vedi nota adozione
Task 4.6).

- [ ] **Step 1: Scrivi lo spec (fallisce: il componente non esiste)**

Crea `packages/ui-kit/src/components/PageToolbar.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PageToolbar from './PageToolbar.vue';

describe('PageToolbar', () => {
  it('rende #left e #right con lo spacer flex-1 in mezzo, classi del wrapper standard', () => {
    const w = mount(PageToolbar, {
      slots: { left: '<span data-test="left">Filtro</span>', right: '<button data-test="right">Azione</button>' },
    });
    expect(w.classes()).toEqual(expect.arrayContaining(['mb-4', 'flex', 'flex-wrap', 'items-center', 'gap-3']));
    const children = Array.from(w.element.children);
    const spacerIdx = children.findIndex((el) => el.classList.contains('flex-1'));
    const leftIdx = children.findIndex((el) => el.querySelector('[data-test="left"]') || el.matches?.('[data-test="left"]'));
    expect(w.find('[data-test="left"]').exists()).toBe(true);
    expect(w.find('[data-test="right"]').exists()).toBe(true);
    expect(spacerIdx).toBeGreaterThan(-1);
  });

  it('non richiede alcuna prop (slot opzionali)', () => {
    expect(() => mount(PageToolbar)).not.toThrow();
  });
});
```

- [ ] **Step 2: Esegui lo spec (deve fallire)**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- PageToolbar`
Expected: FAIL (`Failed to resolve import "./PageToolbar.vue"`).

- [ ] **Step 3: Crea il componente**

Crea `packages/ui-kit/src/components/PageToolbar.vue`:

```vue
<template>
  <div class="mb-4 flex flex-wrap items-center gap-3">
    <slot name="left" />
    <div class="flex-1"></div>
    <slot name="right" />
    <slot name="actions" />
  </div>
</template>
```

> Slot `#right` **e** `#actions` (spec §3.4: "slot `#left` e `#right` (o `#actions`)") coesistono:
> nessun consumer attuale usa entrambi insieme, quindi non c'è ambiguità di ordine. `MapView.vue`
> adotta solo `#right` per l'indicatore testuale (Task 4.6).

- [ ] **Step 4: Esegui lo spec (deve passare)**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- PageToolbar`
Expected: PASS (2 test).

### 1.5 Esporta i 4 componenti

- [ ] **Step 1: Aggiorna `packages/ui-kit/src/index.ts`**

In `packages/ui-kit/src/index.ts`, **dopo** la riga `export { default as DataTable } ...`, aggiungi:

```ts
export { default as EmptyState } from './components/EmptyState.vue';
export { default as Select } from './components/Select.vue';
export { default as ModalFooter } from './components/ModalFooter.vue';
export { default as PageToolbar } from './components/PageToolbar.vue';
```

- [ ] **Step 2: Build + tutti i test ui-kit**

Run:
```bash
corepack pnpm --filter @coralyn/ui-kit build
corepack pnpm --filter @coralyn/ui-kit test
```
Expected: build OK; **18** test PASS (14 baseline + 4×EmptyState/Select/ModalFooter/PageToolbar =
2+4+4+2 = 12 nuovi → **26** totali). *(Ricontrolla il conteggio esatto dall'output — vedi nota sotto.)*

> **Nota conteggio:** i nuovi spec aggiungono rispettivamente 2 (EmptyState) + 4 (Select) + 4
> (ModalFooter) + 2 (PageToolbar) = **12** test. Totale atteso dopo Task 1: **14 + 12 = 26**.

- [ ] **Step 3: Commit**

```bash
git add packages/ui-kit/src/components/EmptyState.vue packages/ui-kit/src/components/EmptyState.spec.ts packages/ui-kit/src/components/Select.vue packages/ui-kit/src/components/Select.spec.ts packages/ui-kit/src/components/ModalFooter.vue packages/ui-kit/src/components/ModalFooter.spec.ts packages/ui-kit/src/components/PageToolbar.vue packages/ui-kit/src/components/PageToolbar.spec.ts packages/ui-kit/src/index.ts
git commit -m "feat(ui-kit): EmptyState + Select + ModalFooter + PageToolbar (astrazione FE fase 1)"
```

---

## Task 2: ui-kit util (`format.ts`) + classi cella + `DataTable` data-driven

**Files:** Crea `packages/ui-kit/src/format.ts`, `packages/ui-kit/src/format.spec.ts`,
`packages/ui-kit/src/styles/table.css`; Modifica `packages/ui-kit/src/components/DataTable.vue`,
`packages/ui-kit/src/index.ts`; Crea `packages/ui-kit/src/components/DataTable.spec.ts`

### 2.1 `format.ts` — `formatEuro`/`initials`/`dateRange`

**Sostituisce:** `formatEuro` gli inline `€ ${x.toFixed(2)}` di `BookingsView.vue:106`
(`€ {{ b.amountCollected.toFixed(2) }} / € {{ b.totalPrice.toFixed(2) }}`),
`SettlePaymentModal.vue:72` (`€ {{ total.toFixed(2) }}`), `MapView.vue:318`
(`€ {{ (quote?.totalPrice ?? 0).toFixed(2) }}`). `initials` gli inline duplicati di
`BookingsView.vue:48-49`, `RenewalsView.vue:38`, `CustomersView.vue:23` (`ini`, firma diversa ma
stessa logica su `{firstName,lastName}`), `CustomerDetailView.vue:14` (stessa logica inline nel
`computed`). `dateRange` sostituisce `periodLabel` di `BookingsView.vue:37`.

- [ ] **Step 1: Scrivi lo spec (fallisce: il modulo non esiste)**

Crea `packages/ui-kit/src/format.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatEuro, initials, dateRange } from './format';

describe('formatEuro', () => {
  it('formatta un numero come "€ x.xx"', () => {
    expect(formatEuro(28)).toBe('€ 28.00');
    expect(formatEuro(0)).toBe('€ 0.00');
    expect(formatEuro(1234.5)).toBe('€ 1234.50');
  });
});

describe('initials', () => {
  it('prende le iniziali maiuscole delle prime 2 parole', () => {
    expect(initials('Mario Rossi')).toBe('MR');
    expect(initials('anna verdi')).toBe('AV');
  });
  it('con una sola parola prende una sola iniziale', () => {
    expect(initials('Mario')).toBe('M');
  });
  it('ignora parole oltre la seconda', () => {
    expect(initials('Anna Maria Verdi')).toBe('AM');
  });
});

describe('dateRange', () => {
  it('ritorna la data singola se start === end', () => {
    expect(dateRange('2026-07-15', '2026-07-15')).toBe('2026-07-15');
  });
  it('ritorna "start → end" se diverse', () => {
    expect(dateRange('2026-07-24', '2026-07-26')).toBe('2026-07-24 → 2026-07-26');
  });
});
```

- [ ] **Step 2: Esegui lo spec (deve fallire)**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- format`
Expected: FAIL (`Failed to resolve import "./format"`).

- [ ] **Step 3: Crea il modulo**

Crea `packages/ui-kit/src/format.ts`:

```ts
/** Formatta un importo come valuta EUR ("€ " + due decimali). Generico: nessun dominio. */
export function formatEuro(amount: number): string {
  return `€ ${amount.toFixed(2)}`;
}

/** Iniziali maiuscole delle prime 2 parole di un nome (es. "Mario Rossi" → "MR"). */
export function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Intervallo date: la data singola se coincidono, altrimenti "start → end". */
export function dateRange(start: string, end: string): string {
  return start === end ? start : `${start} → ${end}`;
}
```

- [ ] **Step 4: Esegui lo spec (deve passare)**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- format`
Expected: PASS (7 test).

- [ ] **Step 5: Esporta da `index.ts`**

In `packages/ui-kit/src/index.ts`, **dopo** i 4 export componenti aggiunti in Task 1, aggiungi:

```ts
export { formatEuro, initials, dateRange } from './format';
```

### 2.2 Classi di cella (`table.css`)

**Classi da preservare** — quotate da `BookingsView.vue:90` (prima colonna):
```
border-b border-[var(--color-border-row)] px-[18px] py-3.5
```
da `BookingsView.vue:96` (cella standard):
```
border-b border-[var(--color-border-row)] px-3.5 py-3.5
```
+ `tabular-nums` quando numerica (es. `:96`, `:99`); da `BookingsView.vue:101` (destra):
```
border-b border-[var(--color-border-row)] px-[18px] py-3.5 text-right
```
Le stesse identiche classi ricorrono in `RenewalsView.vue:61/67/68/72`, `CustomersView.vue:39/45/46/47`,
`PricingView.vue:65-70`.

> **Nota implementativa:** la spec (§3.6) propone `@apply` in `table.css` **oppure** componenti
> `<Td>`. Si sceglie **la via più semplice e meno rischiosa per la fedeltà pixel**: costanti di
> stringa esportate da TypeScript (non un file CSS con `@apply`), perché (a) evitano di introdurre
> un nuovo entry-point CSS che i consumer devono ricordarsi di importare, (b) sono immediatamente
> utilizzabili sia dal `DataTable` data-driven sia da celle custom nelle viste (semplice
> interpolazione di classi, niente nuova classe CSS globale da tenere sincronizzata con Tailwind
> JIT), (c) restano **byte-per-byte identiche** alle classi Tailwind esistenti (nessuna doppia fonte
> di verità tra un file `.css` con `@apply` e le utility Tailwind stesse). Il file si chiama
> comunque `styles/table.css` **come commento/indice** ma il contenuto operativo (le costanti) vive
> in `styles/table.ts`, importato da `table.css` solo a scopo di non rompere l'aspettativa del nome
> file della spec — **scelta**: creiamo `packages/ui-kit/src/styles/table.ts` (non `.css`) per le
> costanti, e comunque documentiamo la decisione qui. Se in fase di build `.css` fosse strettamente
> richiesto da qualche tool, la conversione è meccanica (stesse stringhe).

- [ ] **Step 1: Scrivi lo spec (fallisce: il modulo non esiste)**

Crea `packages/ui-kit/src/styles/table.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TD, TD_FIRST, TD_RIGHT, TD_NUM } from './table';

describe('classi di cella tabella', () => {
  it('TD è la classe base della cella standard', () => {
    expect(TD).toBe('border-b border-[var(--color-border-row)] px-3.5 py-3.5');
  });
  it('TD_FIRST è la cella di prima colonna (px-[18px])', () => {
    expect(TD_FIRST).toBe('border-b border-[var(--color-border-row)] px-[18px] py-3.5');
  });
  it('TD_RIGHT è la cella allineata a destra (ultima colonna)', () => {
    expect(TD_RIGHT).toBe('border-b border-[var(--color-border-row)] px-[18px] py-3.5 text-right');
  });
  it('TD_NUM aggiunge tabular-nums', () => {
    expect(TD_NUM).toBe('tabular-nums');
  });
});
```

- [ ] **Step 2: Esegui lo spec (deve fallire)**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- styles/table`
Expected: FAIL (`Failed to resolve import "./table"`).

- [ ] **Step 3: Crea il modulo**

Crea `packages/ui-kit/src/styles/table.ts`:

```ts
/**
 * Classi standard di cella `<td>` per DataTable e tabelle custom (ADR-0033 §3.6). Coincidono
 * ESATTAMENTE con le classi oggi inline in BookingsView/RenewalsView/CustomersView/PricingView.
 * Non introdurre nuove classi CSS: solo costanti di stringa Tailwind riutilizzabili.
 */
export const TD = 'border-b border-[var(--color-border-row)] px-3.5 py-3.5';
export const TD_FIRST = 'border-b border-[var(--color-border-row)] px-[18px] py-3.5';
export const TD_RIGHT = 'border-b border-[var(--color-border-row)] px-[18px] py-3.5 text-right';
export const TD_NUM = 'tabular-nums';
```

Crea anche `packages/ui-kit/src/styles/table.css` (file indice/commento, nessuna regola — evita di
rompere l'aspettativa "table.css" della spec §3.6 senza introdurre un secondo sistema di stile):

```css
/*
 * Le classi standard di cella per DataTable/tabelle custom vivono in `./table.ts` (costanti TS),
 * non qui: sono riutilizzate lato template Vue via interpolazione classe, non via `@apply` — evita
 * una doppia fonte di verità con le utility Tailwind. Vedi ADR-0033 §3.6 e docs/plans/2026-07-01-
 * frontend-abstraction.md (Task 2.2) per la motivazione della scelta.
 */
```

- [ ] **Step 4: Esegui lo spec (deve passare)**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- styles/table`
Expected: PASS (4 test).

- [ ] **Step 5: Esporta da `index.ts`**

In `packages/ui-kit/src/index.ts`, **dopo** l'export di `format.ts`, aggiungi:

```ts
export { TD, TD_FIRST, TD_RIGHT, TD_NUM } from './styles/table';
```

### 2.3 `DataTable.vue` — modalità data-driven (retro-compatibile)

**Oggi** (`packages/ui-kit/src/components/DataTable.vue`, letto per intero in fase di piano): rende
solo l'header da `columns`, il body è `<tbody><slot /></tbody>` dove la vista scrive `<tr>/<td>` a
mano.

**Potenziamento additivo:** nuove prop **opzionali** `rows?: T[]` e `rowKey?: (row: T) => string`.
Quando `rows` è presente (e non `undefined`), il componente genera i `<tr>` internamente; altrimenti
usa lo `<slot />` come oggi (**zero breaking change**: tutte le viste non ancora migrate continuano
a passare `columns` + slot-body esattamente come ora).

- [ ] **Step 1: Scrivi lo spec del nuovo modo, PRIMA di toccare il componente (deve fallire)**

Crea `packages/ui-kit/src/components/DataTable.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DataTable from './DataTable.vue';

const columns = [
  { key: 'nome', label: 'Nome' },
  { key: 'eta', label: 'Età', align: 'right' as const, numeric: true },
];
const rows = [
  { id: 'r1', nome: 'Mario', eta: 40 },
  { id: 'r2', nome: 'Anna', eta: 32 },
];

describe('DataTable — retro-compatibilità (API a slot esistente)', () => {
  it('senza rows, il body resta uno slot: il markup passato a mano è invariato', () => {
    const w = mount(DataTable, {
      props: { columns },
      slots: { default: '<tr class="riga-custom"><td class="cella-custom">X</td></tr>' },
    });
    expect(w.find('tr.riga-custom').exists()).toBe(true);
    expect(w.find('td.cella-custom').text()).toBe('X');
  });

  it('header invariato: classi standard sulle <th>', () => {
    const w = mount(DataTable, { props: { columns } });
    const ths = w.findAll('th');
    expect(ths[0].classes()).toEqual(expect.arrayContaining(['text-left']));
    expect(ths[1].classes()).toEqual(expect.arrayContaining(['text-right']));
  });
});

describe('DataTable — modalità data-driven (rows/rowKey)', () => {
  it('con rows, genera un <tr> per riga con hover:bg standard e i <td> con le classi cella', () => {
    const w = mount(DataTable, { props: { columns, rows, rowKey: (r: { id: string }) => r.id } });
    const trs = w.findAll('tbody tr');
    expect(trs).toHaveLength(2);
    expect(trs[0].classes()).toEqual(expect.arrayContaining(['hover:bg-[var(--color-raised)]']));
    expect(trs[0].text()).toContain('Mario');
    expect(trs[1].text()).toContain('Anna');
  });

  it('cella default: usa row[column.key], classi TD_FIRST sulla prima colonna, TD_NUM se column.numeric', () => {
    const w = mount(DataTable, { props: { columns, rows, rowKey: (r: { id: string }) => r.id } });
    const firstRowCells = w.findAll('tbody tr')[0].findAll('td');
    expect(firstRowCells[0].classes()).toEqual(expect.arrayContaining(['px-[18px]']));
    expect(firstRowCells[1].classes()).toEqual(expect.arrayContaining(['tabular-nums', 'text-right']));
  });

  it('cella custom: slot #cell-<key> sostituisce il contenuto default per quella colonna', () => {
    const w = mount(DataTable, {
      props: { columns, rows, rowKey: (r: { id: string }) => r.id },
      slots: { 'cell-nome': `<template #cell-nome="{ row }"><b class="custom">{{ row.nome.toUpperCase() }}</b></template>` },
    });
    expect(w.find('td b.custom').text()).toBe('MARIO');
  });
});
```

- [ ] **Step 2: Esegui lo spec (parte deve fallire: il modo data-driven non esiste ancora)**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- DataTable`
Expected: i 2 test "retro-compatibilità" **PASS già ora** (comportamento invariato); i 3 test
"data-driven" **FAIL** (nessun `<tr>` generato: `rows`/`rowKey` non sono prop del componente attuale
→ Vue le ignora silenziosamente, `tbody` resta vuoto).

- [ ] **Step 3: Potenzia il componente (additivo)**

Sostituisci **interamente** `packages/ui-kit/src/components/DataTable.vue` con:

```vue
<script setup lang="ts">
import { TD, TD_FIRST, TD_RIGHT, TD_NUM } from '../styles/table';

type Column = { key: string; label: string; align?: 'left' | 'right'; numeric?: boolean };

const props = defineProps<{
  columns: Column[];
  rows?: Record<string, unknown>[];
  rowKey?: (row: Record<string, unknown>) => string;
}>();

function cellClass(col: Column, isFirst: boolean): string {
  if (isFirst) return col.numeric ? `${TD_FIRST} ${TD_NUM}` : TD_FIRST;
  if (col.align === 'right') return col.numeric ? `${TD_RIGHT} ${TD_NUM}` : TD_RIGHT;
  return col.numeric ? `${TD} ${TD_NUM}` : TD;
}
function key(row: Record<string, unknown>, idx: number): string {
  return props.rowKey ? props.rowKey(row) : String(idx);
}
</script>
<template>
  <div class="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] [box-shadow:var(--shadow-card)]">
    <table class="w-full border-collapse text-[13px]">
      <thead>
        <tr class="bg-[var(--color-raised)]">
          <th v-for="c in columns" :key="c.key" :class="['border-b border-[var(--color-border)] px-[18px] py-3 text-[10.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-text-muted)]', c.align === 'right' ? 'text-right' : 'text-left']">{{ c.label }}</th>
        </tr>
      </thead>
      <tbody v-if="rows">
        <tr v-for="(row, i) in rows" :key="key(row, i)" class="hover:bg-[var(--color-raised)]">
          <td v-for="(c, ci) in columns" :key="c.key" :class="cellClass(c, ci === 0)">
            <slot :name="`cell-${c.key}`" :row="row">{{ row[c.key] }}</slot>
          </td>
        </tr>
      </tbody>
      <tbody v-else><slot /></tbody>
    </table>
  </div>
</template>
```

> **Retro-compatibilità:** quando `rows` è `undefined` (nessuna vista migrata lo passa ancora),
> `v-if="rows"` è falso → il `<tbody><slot /></tbody>` esistente resta l'unico ramo attivo, byte per
> byte identico a prima (stesso `<div>`/`<table>`/`<thead>` wrapper, invariati). Il ramo data-driven
> è un `<tbody>` **alternativo**, mai renderizzato insieme al primo (`v-if`/`v-else` mutuamente
> esclusivi) — zero rischio di doppio body.
> **Nota tipi:** `Record<string, unknown>` è generico volutamente (DataTable resta senza dominio,
> ADR-0033 §1); le viste tipizzano le proprie righe lato chiamante e Vue accetta l'assegnazione
> strutturale. Se in fase di adozione (Fase 4) il typecheck lamenta un cast, usare `as
> Record<string, unknown>[]` sul lato vista (non introdurre generics `<T>` su un SFC — non
> supportato da `defineProps` con `<script setup>` senza `generic="T"`, che è disponibile da Vue
> 3.3+; se il typecheck del progetto lo consente già altrove, preferire `<script setup lang="ts"
> generic="T extends Record<string, unknown>">` per tipizzare `rows`/`rowKey` senza cast — verificare
> con `vue-tsc` nello Step 4 e adottare quest'ultima forma se il build la accetta senza errori).

- [ ] **Step 4: Esegui lo spec (deve passare tutto)**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- DataTable`
Expected: PASS (5 test: 2 retro-compat + 3 data-driven).

- [ ] **Step 5: Build + tutti i test ui-kit + verifica che nessuna vista sia rotta**

Run:
```bash
corepack pnpm --filter @coralyn/ui-kit build
corepack pnpm --filter @coralyn/ui-kit test
corepack pnpm --filter @coralyn/web-staff typecheck
corepack pnpm --filter @coralyn/web-staff test
```
Expected: ui-kit **26 (Task 1) + 7 (format) + 4 (table) + 5 (DataTable) = 42** test PASS; web-staff
**47** invariato (nessuna vista è stata toccata in questo task — solo l'API additiva di `DataTable`).

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/format.ts packages/ui-kit/src/format.spec.ts packages/ui-kit/src/styles/table.ts packages/ui-kit/src/styles/table.css packages/ui-kit/src/styles/table.spec.ts packages/ui-kit/src/components/DataTable.vue packages/ui-kit/src/components/DataTable.spec.ts packages/ui-kit/src/index.ts
git commit -m "feat(ui-kit): format.ts (formatEuro/initials/dateRange) + classi cella + DataTable data-driven retro-compatibile (astrazione FE fase 2)"
```

---

## Task 3: web-staff shared — `useEntityLabels`, `statusMaps`, `useQueryResource`

**Files:** Crea `apps/web-staff/src/lib/useEntityLabels.ts`,
`apps/web-staff/src/lib/useEntityLabels.spec.ts`, `apps/web-staff/src/lib/statusMaps.ts`,
`apps/web-staff/src/lib/statusMaps.spec.ts`, `apps/web-staff/src/lib/useQueryResource.ts`,
`apps/web-staff/src/lib/useQueryResource.spec.ts`; Modifica i 6 composable esistenti
(`useBookings.ts`, `usePackages.ts`, `useBookingQuote.ts`, `useCustomers.ts`, `useDayMap.ts`,
`useRenewals.ts`) per usare `useQueryResource` **mantenendo la stessa firma pubblica**.

> Nessuna vista è ancora migrata su `useEntityLabels`/`statusMaps` in questo task (l'adozione avviene
> vista per vista in Fase 4); i 6 composable esistenti **cambiano internamente** ma le viste che li
> consumano non cambiano un solo carattere (stessa firma, stesso comportamento, stesse chiavi
> invalidate) — nessun test di vista deve rompersi.

### 3.1 `statusMaps.ts`

**Sostituisce:** `BookingsView.vue:30-36` (`PAY_LABEL`, `PAY_TONE`, `TYPE_LABEL`); i ternari inline
di `MapView.vue:250-257` (badge stato pagamento nel pannello laterale:
`currentBooking.paymentStatus === 'paid' ? 'success' : … === 'partial' ? 'warning' : 'neutral'` e
l'equivalente label italiana).

- [ ] **Step 1: Scrivi lo spec (fallisce: il modulo non esiste)**

Crea `apps/web-staff/src/lib/statusMaps.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PAY_LABEL, PAY_TONE, TYPE_LABEL } from './statusMaps';

describe('statusMaps', () => {
  it('PAY_LABEL: etichetta IT per ogni PaymentStatus', () => {
    expect(PAY_LABEL.unpaid).toBe('Da incassare');
    expect(PAY_LABEL.partial).toBe('Parziale');
    expect(PAY_LABEL.paid).toBe('Saldato');
  });
  it('PAY_TONE: tone Badge per ogni PaymentStatus', () => {
    expect(PAY_TONE.unpaid).toBe('neutral');
    expect(PAY_TONE.partial).toBe('warning');
    expect(PAY_TONE.paid).toBe('success');
  });
  it('TYPE_LABEL: etichetta IT per ogni BookingType', () => {
    expect(TYPE_LABEL.daily).toBe('Giornaliera');
    expect(TYPE_LABEL.periodic).toBe('Periodica');
    expect(TYPE_LABEL.subscription).toBe('Abbonamento');
  });
});
```

- [ ] **Step 2: Esegui lo spec (deve fallire)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- statusMaps`
Expected: FAIL (`Cannot find module './statusMaps'`).

- [ ] **Step 3: Crea il modulo**

Crea `apps/web-staff/src/lib/statusMaps.ts`:

```ts
import type { BookingType, PaymentStatus } from '@coralyn/contracts';

/** Mappe stato→presentazione (ADR-0033 §2, di dominio: conoscono i contratti Booking). */
export const PAY_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Da incassare',
  partial: 'Parziale',
  paid: 'Saldato',
};
export const PAY_TONE: Record<PaymentStatus, 'success' | 'warning' | 'neutral'> = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'neutral',
};
export const TYPE_LABEL: Record<BookingType, string> = {
  daily: 'Giornaliera',
  periodic: 'Periodica',
  subscription: 'Abbonamento',
};
```

- [ ] **Step 4: Esegui lo spec (deve passare)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- statusMaps`
Expected: PASS (3 test).

### 3.2 `useEntityLabels.ts`

**Sostituisce:** `BookingsView.vue:39-55` (`customerName`, `umbrellaLabel`, `initials`,
`packageName`), `RenewalsView.vue:29-37` (`customerName`, `umbrellaLabel`, `initials`),
`MapView.vue:95-100` (`currentCustomerName`, che risolve `customerId` → nome — stessa logica di
`customerName`). Assorbe il follow-up "cleanup #2" della review A4.2 (spec §5.1, decisione 5).

**Nota comportamento (dalla spec §5.1):** `umbrellaLabel` usa `useDayMap()` (le label non dipendono
dalla data attiva — coerente con `RenewalsView.vue:17` che già lo fa apposta per gli abbonati di
un'altra stagione); fallback `'—'` quando l'id non è in mappa; `customerName` fallback all'id se il
cliente non è (ancora) risolto.

- [ ] **Step 1: Scrivi lo spec (fallisce: il modulo non esiste)**

Crea `apps/web-staff/src/lib/useEntityLabels.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useEntityLabels } from './useEntityLabels';

const tick = () => new Promise((r) => setTimeout(r, 0));

// Componente host minimale: gli hook composable richiedono un contesto Vue attivo.
function mountHook() {
  let api!: ReturnType<typeof useEntityLabels>;
  const Host = defineComponent({
    setup() {
      api = useEntityLabels();
      return () => h('div');
    },
  });
  const w = mountApp(Host);
  return { w, api: () => api };
}

describe('useEntityLabels', () => {
  it('customerName risolve id → "Nome Cognome", fallback id se non trovato', async () => {
    const { api } = mountHook();
    await flushPromises();
    await tick();
    await flushPromises();
    expect(api().customerName('c-1')).toContain('Rossi'); // seed MSW: c-1 = Mario Rossi
    expect(api().customerName('inesistente')).toBe('inesistente');
  });

  it('umbrellaLabel: Map id→label da useDayMap, indipendente dalla data attiva', async () => {
    const { api } = mountHook();
    await flushPromises();
    await tick();
    await flushPromises();
    expect(api().umbrellaLabel.value.get('u1')).toBeTruthy();
    expect(api().umbrellaLabel.value.get('non-esiste') ?? '—').toBe('—');
  });

  it('packageName: Map id→nome da usePackages, fallback assente = "—" gestito dal chiamante', async () => {
    server.use(
      http.get('/api/packages', () => HttpResponse.json([{ id: 'pkg-1', name: 'Standard', equipment: { sunbeds: 2 } }])),
    );
    const { api } = mountHook();
    await flushPromises();
    await tick();
    await flushPromises();
    expect(api().packageName.value.get('pkg-1')).toBe('Standard');
  });
});
```

> **Nota TDD:** verificare i seed MSW (`apps/web-staff/src/mocks/handlers.ts` /
> `apps/web-staff/src/mocks/data/seed.ts`) per la forma esatta di `c-1`/`u1` prima di scrivere le
> asserzioni definitive — se i default MSW non coprono l'id `u1`/`c-1`, sostituire con
> `server.use(http.get('/api/map', ...))`/`http.get('/api/customers', ...)` espliciti nello spec
> (pattern già usato in `BookingsView.spec.ts`).

- [ ] **Step 2: Esegui lo spec (deve fallire)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- useEntityLabels`
Expected: FAIL (`Cannot find module './useEntityLabels'`).

- [ ] **Step 3: Crea il composable**

Crea `apps/web-staff/src/lib/useEntityLabels.ts`:

```ts
import { computed } from 'vue';
import { initials as initialsUtil } from '@coralyn/ui-kit';
import { useCustomers } from '@/features/customers/useCustomers';
import { useDayMap } from '@/features/map/useDayMap';
import { usePackages } from '@/features/bookings/usePackages';

/**
 * Risoluzione entità→etichetta condivisa (ADR-0033 §5.1, assorbe il follow-up "cleanup #2" della
 * review A4.2). `umbrellaLabel` usa `useDayMap()` deliberatamente: le label ombrellone non
 * dipendono dalla data (funziona anche per le viste che mostrano un'altra stagione, es. Rinnovi).
 */
export function useEntityLabels() {
  const { data: customers } = useCustomers();
  const { data: map } = useDayMap();
  const { data: packages } = usePackages();

  function customerName(id: string): string {
    const c = (customers.value ?? []).find((x) => x.id === id);
    return c ? `${c.firstName} ${c.lastName}` : id;
  }

  const umbrellaLabel = computed(() => {
    const m = new Map<string, string>();
    for (const s of map.value?.sectors ?? []) for (const r of s.rows) for (const u of r.umbrellas) m.set(u.id, u.label);
    return m;
  });

  const packageName = computed(() => {
    const m = new Map<string, string>();
    for (const p of packages.value ?? []) m.set(p.id, p.name);
    return m;
  });

  return { customerName, umbrellaLabel, packageName };
}

export { initialsUtil as initials };
```

> `initials` è ri-esportato da qui **solo per comodità di import unico** nelle viste che già
> importano `useEntityLabels`; la funzione vera vive in `ui-kit` (util pura, nessun dominio) — le
> viste possono anche importarla direttamente da `@coralyn/ui-kit` (preferito, più esplicito
> sull'origine). Il piano di adozione (Fase 4) userà l'import diretto da `@coralyn/ui-kit` per
> `initials` e `useEntityLabels` da `@/lib/useEntityLabels` per il resto — **decisione**: rimuovere il
> re-export `initials` da `useEntityLabels.ts` per evitare due strade per la stessa cosa (principio
> DRY/altitude). Vedi Step 3-bis.

- [ ] **Step 3-bis: Rimuovi il re-export ridondante di `initials`**

In `apps/web-staff/src/lib/useEntityLabels.ts`, elimina l'ultima riga (`export { initialsUtil as
initials };`) e l'alias in import (torna a `import { initials } from '@coralyn/ui-kit';` solo se
usato altrove nel file — non lo è: rimuovi anche l'import inutilizzato). File finale:

```ts
import { computed } from 'vue';
import { useCustomers } from '@/features/customers/useCustomers';
import { useDayMap } from '@/features/map/useDayMap';
import { usePackages } from '@/features/bookings/usePackages';

/**
 * Risoluzione entità→etichetta condivisa (ADR-0033 §5.1, assorbe il follow-up "cleanup #2" della
 * review A4.2). `umbrellaLabel` usa `useDayMap()` deliberatamente: le label ombrellone non
 * dipendono dalla data (funziona anche per le viste che mostrano un'altra stagione, es. Rinnovi).
 * `initials` NON è ri-esportato da qui: è una util pura senza dominio, le viste la importano
 * direttamente da `@coralyn/ui-kit`.
 */
export function useEntityLabels() {
  const { data: customers } = useCustomers();
  const { data: map } = useDayMap();
  const { data: packages } = usePackages();

  function customerName(id: string): string {
    const c = (customers.value ?? []).find((x) => x.id === id);
    return c ? `${c.firstName} ${c.lastName}` : id;
  }

  const umbrellaLabel = computed(() => {
    const m = new Map<string, string>();
    for (const s of map.value?.sectors ?? []) for (const r of s.rows) for (const u of r.umbrellas) m.set(u.id, u.label);
    return m;
  });

  const packageName = computed(() => {
    const m = new Map<string, string>();
    for (const p of packages.value ?? []) m.set(p.id, p.name);
    return m;
  });

  return { customerName, umbrellaLabel, packageName };
}
```

Nello spec (Step 1), rimuovi ogni asserzione su `initials` esportato da qui (non presente: lo spec
sopra non lo testa già, nessuna modifica necessaria allo spec).

- [ ] **Step 4: Esegui lo spec (deve passare)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- useEntityLabels`
Expected: PASS (3 test).

### 3.3 `useQueryResource.ts` (factory — scope cautelativo)

**Cautela esplicita (spec §5.3):** è la parte più a rischio *over-engineering*. Prima di scrivere il
codice finale, **verifica di altitude**: i 6 composable esistenti (`useDayBookings`,
`useCreateBooking`, `useCancelBooking`, `useSettlePayment`, `useCustomers`, `useCustomer`,
`useUpdateCustomer`, `useCreateCustomer`, `useDayMap`, `usePackages`, `useSubscriptions`,
`useRenewBooking`, `useBookingQuote` — **12 funzioni esportate, non 13** come stimato dalla spec;
vedi nota ambiguità sotto) seguono **due pattern**:
1. **Query semplice:** `useQuery({ queryKey: computed(() => queryKeys.X(session.establishmentId,
   …)), queryFn: () => apiFetch(...) })`.
2. **Mutation con invalidazione:** `useMutation({ mutationFn: (input) => apiFetch(...), onSuccess:
   () => qc.invalidateQueries({ queryKey: ... }) })`.

> **Nota di ambiguità risolta (conteggio "13 composable"):** contando le funzioni esportate dai 6
> file (`useBookings.ts`: 4, `usePackages.ts`: 1, `useBookingQuote.ts`: 1, `useCustomers.ts`: 4,
> `useDayMap.ts`: 1, `useRenewals.ts`: 2) si arriva a **13** funzioni esportate (non "13 file" — la
> spec §5.3 dice "i 13 composable server-state", che si legge correttamente come 13 *funzioni*
> composable, coerente col conteggio verificato). Il piano userà questo conteggio (13 funzioni in 6
> file) come riferimento per "copertura completa" allo Step finale.

- [ ] **Step 1: Scrivi lo spec della factory (fallisce: il modulo non esiste)**

Crea `apps/web-staff/src/lib/useQueryResource.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { mountApp } from '@/test/utils';
import { queryResource, mutationResource } from './useQueryResource';

const tick = () => new Promise((r) => setTimeout(r, 0));

function mountHook<T>(setupFn: () => T) {
  let api!: T;
  const Host = defineComponent({
    setup() {
      api = setupFn();
      return () => h('div');
    },
  });
  const w = mountApp(Host);
  return { w, api: () => api };
}

describe('queryResource', () => {
  it('esegue queryFn e ritorna .data reattivo (stesso comportamento di useQuery diretto)', async () => {
    const queryFn = vi.fn().mockResolvedValue(['a', 'b']);
    const { api } = mountHook(() => queryResource({ queryKey: () => ['test-key'], queryFn }));
    await flushPromises();
    await tick();
    await flushPromises();
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(api().data.value).toEqual(['a', 'b']);
  });

  it('la queryKey è reattiva: cambia quando cambia la dipendenza', async () => {
    const dep = ref('x');
    const queryFn = vi.fn().mockResolvedValue('ok');
    mountHook(() => queryResource({ queryKey: () => ['test-key', dep.value], queryFn }));
    await flushPromises();
    dep.value = 'y';
    await flushPromises();
    await tick();
    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});

describe('mutationResource', () => {
  it('esegue mutationFn e invalida le queryKey indicate (stesse chiavi esplicite, no comportamento nascosto)', async () => {
    const mutationFn = vi.fn().mockResolvedValue({ ok: true });
    const { api } = mountHook(() =>
      mutationResource({ mutationFn, invalidates: [['test-key']] }),
    );
    await api().mutateAsync('input');
    expect(mutationFn).toHaveBeenCalledWith('input');
  });
});
```

- [ ] **Step 2: Esegui lo spec (deve fallire)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- useQueryResource`
Expected: FAIL (`Cannot find module './useQueryResource'`).

- [ ] **Step 3: Crea la factory (scope ridotto: 2 helper opzionali, chiavi esplicite per-composable)**

Crea `apps/web-staff/src/lib/useQueryResource.ts`:

```ts
import { computed } from 'vue';
import { useQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/vue-query';

/**
 * Factory dei composable server-state (ADR-0033 §5.3). SCOPO: ridurre il boilerplate ripetuto di
 * `useQuery({ queryKey: computed(...), queryFn })` senza nascondere le query key (che restano
 * esplicite, dichiarate dal chiamante — NON generate qui). Per le mutation, l'invalidazione resta
 * un elenco esplicito di query key passato dal chiamante: la factory non indovina cosa invalidare.
 *
 * Cautela (scope ridotto rispetto alla spec): NON esistono qui costruzioni "magiche" (niente
 * inferenza di chiavi da endpoint, niente convenzioni implicite). Ogni composable riscritto sopra
 * questi due helper ha ESATTAMENTE la stessa firma pubblica e lo stesso comportamento osservabile
 * di prima (stesse query key, stesse invalidazioni). Se in un punto la factory rende il codice più
 * oscuro che esplicito, quel composable resta scritto a mano con `useQuery`/`useMutation` diretti
 * (nessun obbligo di migrare tutto — stesso principio di retro-compatibilità di DataTable).
 */
export function queryResource<T>(opts: { queryKey: () => QueryKey; queryFn: () => Promise<T>; enabled?: () => boolean }) {
  return useQuery({
    queryKey: computed(opts.queryKey),
    queryFn: opts.queryFn,
    ...(opts.enabled ? { enabled: computed(opts.enabled) } : {}),
  });
}

export function mutationResource<TInput, TOutput>(opts: {
  mutationFn: (input: TInput) => Promise<TOutput>;
  invalidates: QueryKey[];
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: opts.mutationFn,
    onSuccess: () => {
      for (const key of opts.invalidates) qc.invalidateQueries({ queryKey: key });
    },
  });
}
```

- [ ] **Step 4: Esegui lo spec (deve passare)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- useQueryResource`
Expected: PASS (3 test).

- [ ] **Step 5: Riscrivi i 6 composable esistenti sopra la factory (stessa firma pubblica, stesso comportamento)**

Sostituisci **interamente** `apps/web-staff/src/features/bookings/useBookings.ts` con:

```ts
import { type Ref } from 'vue';
import type { BookingDTO, CreateBookingInput, SettlePaymentInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

export function useDayBookings(date: Ref<string>) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.bookings(session.establishmentId, date.value),
    queryFn: () => apiFetch<BookingDTO[]>(`/bookings?date=${date.value}`),
  });
}

export function useCreateBooking() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateBookingInput) =>
      apiFetch<BookingDTO>('/bookings', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: [
      queryKeys.bookings(session.establishmentId, session.activeDate),
      queryKeys.dayMap(session.establishmentId, session.activeDate),
    ],
  });
}

export function useCancelBooking() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<BookingDTO>(`/bookings/${id}`, { method: 'DELETE' }),
    invalidates: [
      queryKeys.bookings(session.establishmentId, session.activeDate),
      queryKeys.dayMap(session.establishmentId, session.activeDate),
    ],
  });
}

export function useSettlePayment() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: SettlePaymentInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/payment`, { method: 'PATCH', body: JSON.stringify(input) }),
    // L'incasso non cambia lo stato della mappa (A1 §10): invalida solo la lista del giorno.
    invalidates: [queryKeys.bookings(session.establishmentId, session.activeDate)],
  });
}
```

Sostituisci **interamente** `apps/web-staff/src/features/bookings/usePackages.ts` con:

```ts
import type { PackageDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource } from '@/lib/useQueryResource';

/** Lista dei pacchetti del tenant per il selettore del modale. */
export function usePackages() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.packages(session.establishmentId),
    queryFn: () => apiFetch<PackageDTO[]>('/packages'),
  });
}
```

Sostituisci **interamente** `apps/web-staff/src/features/customers/useCustomers.ts` con:

```ts
import type { CustomerDTO, CreateCustomerInput, UpdateCustomerInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

export function useCustomers() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.customers(session.establishmentId),
    queryFn: () => apiFetch<CustomerDTO[]>('/customers'),
  });
}

export function useCustomer(id: string) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.customer(session.establishmentId, id),
    queryFn: () => apiFetch<CustomerDTO>(`/customers/${id}`),
  });
}

export function useUpdateCustomer(id: string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: UpdateCustomerInput) =>
      apiFetch<CustomerDTO>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    invalidates: [queryKeys.customers(session.establishmentId), queryKeys.customer(session.establishmentId, id)],
  });
}

export function useCreateCustomer() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateCustomerInput) =>
      apiFetch<CustomerDTO>('/customers', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: [queryKeys.customers(session.establishmentId)],
  });
}
```

Sostituisci **interamente** `apps/web-staff/src/features/map/useDayMap.ts` con:

```ts
import type { DayMapDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource } from '@/lib/useQueryResource';

export function useDayMap() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.dayMap(session.establishmentId, session.activeDate),
    queryFn: () => apiFetch<DayMapDTO>(`/map?date=${session.activeDate}`),
  });
}
```

Sostituisci **interamente** `apps/web-staff/src/features/renewals/useRenewals.ts` con:

```ts
import { type Ref } from 'vue';
import type { BookingDTO, SubscriptionListItemDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

/** Abbonati della stagione che contiene `date` (campagna rinnovi). */
export function useSubscriptions(date: Ref<string>) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.subscriptions(session.establishmentId, date.value),
    queryFn: () => apiFetch<SubscriptionListItemDTO[]>(`/bookings/subscriptions?date=${date.value}`),
    enabled: () => !!date.value,
  });
}

/** Rinnova un abbonamento nella stagione di destinazione (`startDate`). */
export function useRenewBooking() {
  return mutationResource({
    mutationFn: ({ id, startDate }: { id: string; startDate: string }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/renew`, { method: 'POST', body: JSON.stringify({ startDate }) }),
    // La riga diventa "Rinnovato" e il nuovo abbonamento appare nell'elenco della stagione di destinazione.
    invalidates: [['subscriptions'], ['map']],
  });
}
```

> **`useBookingQuote.ts` resta invariato** (non riscritto sopra la factory): usa una `queryKey`
> composita a 7 elementi con logica di default inline (`params.value?.x ?? ''`) e un `queryFn` che
> spacchetta `params.value!` — forzarlo nella forma `queryResource` non riduce boilerplate (la
> queryKey resta comunque una funzione con la stessa logica), quindi **si lascia com'è** per non
> introdurre un'astrazione che non paga il suo costo (spec §5.3 "se in fase di piano risultasse più
> oscura del codice attuale, ridurre lo scope"). Annotare questa scelta nel Self-review.

- [ ] **Step 6: Esegui TUTTI i test web-staff + typecheck (nessuna vista deve rompersi)**

Run:
```bash
corepack pnpm --filter @coralyn/web-staff typecheck
corepack pnpm --filter @coralyn/web-staff test
```
Expected: **47** test PASS (invariato — nessuna vista importa ancora `useEntityLabels`/`statusMaps`,
i composable riscritti hanno la stessa firma pubblica quindi tutti gli spec di vista esistenti
restano verdi senza modifiche). Se qualcosa fallisce: la causa più probabile è un ordine di
invalidazione diverso o una `queryKey` non più reattiva — **non proseguire** finché non torna verde
(vedi `superpowers:systematic-debugging`).

- [ ] **Step 7: Commit**

```bash
git add apps/web-staff/src/lib/statusMaps.ts apps/web-staff/src/lib/statusMaps.spec.ts apps/web-staff/src/lib/useEntityLabels.ts apps/web-staff/src/lib/useEntityLabels.spec.ts apps/web-staff/src/lib/useQueryResource.ts apps/web-staff/src/lib/useQueryResource.spec.ts apps/web-staff/src/features/bookings/useBookings.ts apps/web-staff/src/features/bookings/usePackages.ts apps/web-staff/src/features/customers/useCustomers.ts apps/web-staff/src/features/map/useDayMap.ts apps/web-staff/src/features/renewals/useRenewals.ts
git commit -m "feat(web-staff): useEntityLabels + statusMaps + useQueryResource (astrazione FE fase 3)"
```

---

## Task 4: Adozione incrementale nelle viste

> Ogni sotto-task è **una vista, una commit, reversibile**. Prima di ogni sotto-task: `corepack pnpm
> --filter @coralyn/ui-kit build` (già fatto nei task precedenti, ma rieseguirlo non costa nulla se
> in dubbio). Dopo ogni sotto-task: (a) lo spec di vista esistente resta verde, (b) verifica visiva
> — avvia il dev server con `preview_start` (config `web-staff` in `.claude/launch.json`, porta
> 5173; serve login: backend Docker su `docker compose --profile full up -d --build api`, credenziali
> dev `admin@coralyn.dev` / `coralyn-admin-8473`), naviga alla vista, `preview_screenshot` +
> `preview_inspect` su un elemento chiave (es. una cella tabella, il footer del modale) per
> confrontare le classi risolte con quelle di **prima** della modifica (annotale prima di editare, o
> usa `git stash`/checkout del commit precedente in un secondo terminale per il confronto "before").

### Task 4.1: `BookingsView.vue`

**Files:** Modifica `apps/web-staff/src/features/bookings/BookingsView.vue`

Adotta: `PageToolbar` · `DataTable` data-driven (+ `#cell-cliente`/`#cell-incasso` per avatar/bottone)
· `EmptyState` · `useEntityLabels` · `statusMaps` · `formatEuro`/`initials`/`dateRange` (spec §6).

- [ ] **Step 1: Verifica che lo spec esistente sia verde PRIMA di toccare la vista (baseline)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- BookingsView`
Expected: PASS (4 test) — baseline pre-refactor.

- [ ] **Step 2: Sostituisci il `<script setup>`**

In `apps/web-staff/src/features/bookings/BookingsView.vue`, sostituisci **il blocco `<script
setup>` per intero** con:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { SegmentedControl, Button, Badge, Avatar, DataTable, Icon, PageToolbar, EmptyState, formatEuro, initials, dateRange } from '@coralyn/ui-kit';
import type { BookingDTO, PaymentStatus } from '@coralyn/contracts';
import { storeToRefs } from 'pinia';
import { useSessionStore } from '@/stores/session';
import { useDayBookings } from './useBookings';
import { useCustomers } from '@/features/customers/useCustomers';
import { useDayMap } from '@/features/map/useDayMap';
import { useEntityLabels } from '@/lib/useEntityLabels';
import { PAY_LABEL, PAY_TONE, TYPE_LABEL } from '@/lib/statusMaps';
import SettlePaymentModal from './SettlePaymentModal.vue';

const router = useRouter();
const session = useSessionStore();
const { activeDate } = storeToRefs(session);
const { data: bookings } = useDayBookings(activeDate);
useCustomers(); // mantiene la query clienti calda per useEntityLabels (stesso comportamento di prima)
useDayMap();

const filtro = ref<'all' | PaymentStatus>('all');
const filtri = [
  { value: 'all', label: 'Tutte' },
  { value: 'unpaid', label: 'Da incassare' },
  { value: 'partial', label: 'Parziali' },
  { value: 'paid', label: 'Saldate' },
];

const { customerName, umbrellaLabel, packageName } = useEntityLabels();
const periodLabel = (b: BookingDTO): string => (b.type === 'daily' ? b.startDate : dateRange(b.startDate, b.endDate));

const cols = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'ombrellone', label: 'Ombrellone', numeric: true },
  { key: 'tipo', label: 'Tipo' },
  { key: 'pacchetto', label: 'Pacchetto' },
  { key: 'periodo', label: 'Periodo', numeric: true },
  { key: 'stato', label: 'Stato' },
  { key: 'incasso', label: 'Incasso', align: 'right' as const },
];

const rows = computed<BookingDTO[]>(() => {
  const list = bookings.value ?? [];
  return filtro.value === 'all' ? list : list.filter((b) => b.paymentStatus === filtro.value);
});

const modalOpen = ref(false);
const selected = ref<BookingDTO | null>(null);
function openSettle(b: BookingDTO): void {
  selected.value = b;
  modalOpen.value = true;
}
</script>
```

> **Nota fedeltà pixel:** le colonne `ombrellone` e `periodo` avevano già `tabular-nums` inline
> (`BookingsView.vue:96/99`, letto in fase di piano) → mappate su `numeric: true` così il `DataTable`
> data-driven applica `TD_NUM` automaticamente (stessa classe risultante). La colonna `pacchetto` **non**
> aveva `tabular-nums` → resta senza `numeric`. `tipo`/`stato` idem.

- [ ] **Step 3: Sostituisci il `<template>`**

Sostituisci **il blocco `<template>` per intero** con:

```vue
<template>
  <section class="px-[26px] pb-[30px] pt-[22px]">
    <PageToolbar>
      <template #left><SegmentedControl v-model="filtro" :options="filtri" /></template>
      <template #right><Button @click="router.push('/map')"><Icon name="plus" :size="16" />Nuova prenotazione</Button></template>
    </PageToolbar>

    <DataTable v-if="rows.length" :columns="cols" :rows="(rows as unknown as Record<string, unknown>[])" :row-key="(r) => (r as unknown as BookingDTO).id">
      <template #cell-cliente="{ row }">
        <div class="flex items-center gap-2.5">
          <Avatar :initials="initials(customerName((row as unknown as BookingDTO).customerId))" size="sm" />
          <span class="font-semibold text-[var(--color-text)]">{{ customerName((row as unknown as BookingDTO).customerId) }}</span>
        </div>
      </template>
      <template #cell-ombrellone="{ row }">{{ umbrellaLabel.get((row as unknown as BookingDTO).umbrellaId) ?? '—' }}</template>
      <template #cell-tipo="{ row }">{{ TYPE_LABEL[(row as unknown as BookingDTO).type] }}</template>
      <template #cell-pacchetto="{ row }">{{ (row as unknown as BookingDTO).packageId ? (packageName.get((row as unknown as BookingDTO).packageId!) ?? '—') : '—' }}</template>
      <template #cell-periodo="{ row }">{{ periodLabel(row as unknown as BookingDTO) }}</template>
      <template #cell-stato="{ row }"><Badge :tone="PAY_TONE[(row as unknown as BookingDTO).paymentStatus]">{{ PAY_LABEL[(row as unknown as BookingDTO).paymentStatus] }}</Badge></template>
      <template #cell-incasso="{ row }">
        <button
          type="button"
          class="font-semibold tabular-nums text-[var(--color-text)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          @click="openSettle(row as unknown as BookingDTO)"
        >{{ formatEuro((row as unknown as BookingDTO).amountCollected) }} / {{ formatEuro((row as unknown as BookingDTO).totalPrice) }}</button>
      </template>
    </DataTable>
    <EmptyState v-else message="Nessuna prenotazione per questa data." />

    <SettlePaymentModal v-model="modalOpen" :booking="selected" />
  </section>
</template>
```

> **Perché i cast `as unknown as BookingDTO`:** `DataTable` è generico (`Record<string, unknown>[]`,
> ADR-0033 §1 — nessun dominio in ui-kit). Se il typecheck (Step 5) accetta la forma `<script setup
> generic="T">` proposta in Task 2.3, **preferire quella** e rimuovere i cast qui (più pulito); questa
> versione con cast è la **fallback sicura** se i generics SFC non sono disponibili nella versione Vue
> del progetto. Verificare con `vue-tsc` e scegliere la forma che compila senza errori/warning.
> **Classi invariate:** ogni `<template #cell-*>` contiene **esattamente** le stesse classi/markup
> della `<td>` originale (letta da `BookingsView.vue:90-107` in fase di piano) — solo il wrapper
> `<td>` è ora generato da `DataTable` con `TD`/`TD_FIRST`/`TD_RIGHT`/`TD_NUM` (Task 2.2), che
> coincidono byte-per-byte con le classi che c'erano scritte a mano sulla `<td>`.

- [ ] **Step 4: Esegui lo spec di vista (deve restare verde)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- BookingsView`
Expected: PASS (4 test, invariati — stesse asserzioni testuali di prima, nessuna modifica allo spec).

- [ ] **Step 5: Typecheck + build**

Run:
```bash
corepack pnpm --filter @coralyn/web-staff typecheck
corepack pnpm --filter @coralyn/web-staff build
```
Expected: nessun errore. Se i cast `as unknown as BookingDTO` risultano superflui perché `vue-tsc`
accetta i generics SFC, rimuoverli e ri-lanciare typecheck.

- [ ] **Step 6: Verifica visiva (screenshot before/after)**

```
preview_start (config "web-staff")
```
Naviga a `/bookings` con almeno una prenotazione di ogni tipo (usa i dati MSW/dev seed). Confronta
con uno screenshot preso **prima** di questo task (o col commit precedente in un worktree/branch
separato): stessa tabella, stesse colonne, stesso bottone incasso. Usa `preview_inspect` su una `<td>`
per confermare che le classi risolte (`border-b border-[var(--color-border-row)] px-3.5 py-3.5
tabular-nums`) coincidano con l'originale.

- [ ] **Step 7: Commit**

```bash
git add apps/web-staff/src/features/bookings/BookingsView.vue
git commit -m "refactor(web-staff): BookingsView su PageToolbar + DataTable data-driven + EmptyState + useEntityLabels/statusMaps (astrazione FE)"
```

### Task 4.2: `RenewalsView.vue`

**Files:** Modifica `apps/web-staff/src/features/renewals/RenewalsView.vue`

Adotta: `DataTable` data-driven · `EmptyState` · `useEntityLabels` (spec §6). Field+Input/Badge
restano come sono (la spec elenca "Field+Input (date)" ma la vista attuale usa `<input type="date">`
inline senza `Field`/`Input` — vedi nota sotto).

> **Nota di ambiguità risolta:** la mappa di adozione (spec §6) elenca per `RenewalsView`: "DataTable
> data-driven · EmptyState · useEntityLabels · Field+Input (date) · Badge". La vista attuale
> (`RenewalsView.vue:49-56`, letta in fase di piano) usa due `<input type="date">` inline con classe
> `rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)]
> px-3.5 py-2.5 text-[13.5px] text-[var(--color-text)] focus:outline-none` — **non** `Input.vue`
> (che ha classi diverse: `rounded-[var(--radius-md)]`, `py-3`, `text-sm`). Sostituire questi input
> con `Field`+`Input` di `ui-kit` **cambierebbe le classi renderizzate**, violando il vincolo di
> fedeltà pixel (ADR-0033 §2). **Decisione:** questo task **non** tocca i due `<input type="date">`
> (restano inline, identici) — la riga "Field+Input (date)" della mappa §6 si considera **non
> applicabile senza redesign** e viene esplicitamente **fuori scope** qui (coerente con §1 "fuori
> scope: ridisegno visivo"). Solo `DataTable`/`EmptyState`/`useEntityLabels` vengono adottati.

- [ ] **Step 1: Verifica baseline**

Run: `corepack pnpm --filter @coralyn/web-staff test -- RenewalsView`
Expected: PASS (2 test).

- [ ] **Step 2: Sostituisci il `<script setup>`**

In `apps/web-staff/src/features/renewals/RenewalsView.vue`, sostituisci **il blocco `<script
setup>` per intero** con:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { Button, Badge, DataTable, Avatar, EmptyState, initials } from '@coralyn/ui-kit';
import type { SubscriptionListItemDTO } from '@coralyn/contracts';
import { storeToRefs } from 'pinia';
import { useSessionStore } from '@/stores/session';
import { useSubscriptions, useRenewBooking } from './useRenewals';
import { useEntityLabels } from '@/lib/useEntityLabels';

const session = useSessionStore();
const { activeDate } = storeToRefs(session);
const sourceDate = ref(activeDate.value); // una data nella stagione di ORIGINE
const targetDate = ref('');               // una data nella stagione di DESTINAZIONE

const { data: subs } = useSubscriptions(sourceDate);
const renew = useRenewBooking();
const { customerName, umbrellaLabel } = useEntityLabels();

const cols = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'ombrellone', label: 'Ombrellone', numeric: true },
  { key: 'anzianita', label: 'Anzianità', numeric: true },
  { key: 'stato', label: 'Stato' },
  { key: 'azione', label: '', align: 'right' as const },
];

const rows = computed(() => subs.value ?? []);

function doRenew(id: string): void {
  if (!targetDate.value) return;
  renew.mutate({ id, startDate: targetDate.value });
}
</script>
```

- [ ] **Step 3: Sostituisci il `<template>`**

Sostituisci il blocco `<DataTable>...</DataTable>` e il `<p v-else>` con:

```vue
    <DataTable v-if="rows.length" :columns="cols" :rows="(rows as unknown as Record<string, unknown>[])" :row-key="(r) => (r as unknown as SubscriptionListItemDTO).id">
      <template #cell-cliente="{ row }">
        <div class="flex items-center gap-2.5">
          <Avatar :initials="initials(customerName((row as unknown as SubscriptionListItemDTO).customerId))" size="sm" />
          <span class="font-semibold text-[var(--color-text)]">{{ customerName((row as unknown as SubscriptionListItemDTO).customerId) }}</span>
        </div>
      </template>
      <template #cell-ombrellone="{ row }">{{ umbrellaLabel.get((row as unknown as SubscriptionListItemDTO).umbrellaId) ?? '—' }}</template>
      <template #cell-anzianita="{ row }">{{ (row as unknown as SubscriptionListItemDTO).seniority }} {{ (row as unknown as SubscriptionListItemDTO).seniority === 1 ? 'stagione' : 'stagioni' }}</template>
      <template #cell-stato="{ row }">
        <Badge :tone="(row as unknown as SubscriptionListItemDTO).renewed ? 'success' : 'neutral'">{{ (row as unknown as SubscriptionListItemDTO).renewed ? 'Rinnovato' : 'Da rinnovare' }}</Badge>
      </template>
      <template #cell-azione="{ row }">
        <Button :disabled="(row as unknown as SubscriptionListItemDTO).renewed || !targetDate" @click="doRenew((row as unknown as SubscriptionListItemDTO).id)">Rinnova</Button>
      </template>
    </DataTable>
    <EmptyState v-else message="Nessun abbonato per questa stagione." />
```

Il resto del `<template>` (i due `<label>`/`<input type="date">` di apertura) **resta invariato
carattere per carattere** (vedi nota sopra: fuori scope).

- [ ] **Step 4: Spec verde**

Run: `corepack pnpm --filter @coralyn/web-staff test -- RenewalsView`
Expected: PASS (2 test).

- [ ] **Step 5: Typecheck + build**

Run: `corepack pnpm --filter @coralyn/web-staff typecheck && corepack pnpm --filter @coralyn/web-staff build`
Expected: nessun errore.

- [ ] **Step 6: Verifica visiva**

`preview_start` → naviga `/renewals` con almeno un abbonato non rinnovato e uno rinnovato (imposta
`targetDate` per abilitare "Rinnova") → `preview_screenshot` + `preview_inspect` sulla riga tabella e
sul badge stato, confronto con prima.

- [ ] **Step 7: Commit**

```bash
git add apps/web-staff/src/features/renewals/RenewalsView.vue
git commit -m "refactor(web-staff): RenewalsView su DataTable data-driven + EmptyState + useEntityLabels (astrazione FE)"
```

### Task 4.3: `SettlePaymentModal.vue`

**Files:** Modifica `apps/web-staff/src/features/bookings/SettlePaymentModal.vue`

Adotta: `Field`+`Input` (già usati) · `ModalFooter` · `formatEuro` (spec §6). Il `<select>` del
metodo pagamento **resta** con `inputClass` locale (vedi nota: adottare `Select.vue` qui
cambierebbe le classi? No — verificare: `SettlePaymentModal.vue:85` usa `inputClass` che è
`rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)]
px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none` — **manca solo `w-full`**
rispetto alle classi di `Select.vue` create in Task 1.2, che sono prese proprio da `MapView`. Con
`w-full` assente qui, il `<select>` di `SettlePaymentModal` è dentro un `<Field>` che è già `block`
(dal CSS di `Field.vue:5`, `label.block`) — il rendering visivo pratico è identico con o senza
`w-full` esplicito perché l'elemento `<select>` è comunque `display: block`/full-width per via del
contesto, MA per **fedeltà byte-per-byte delle classi** (non solo del rendering) si **NON** sostituisce
questo `<select>` con `Select.vue` in questo task: la classe risultante sarebbe diversa
(`w-full` aggiunto). Resta il `<select>` inline con `inputClass`, fuori scope qui.

- [ ] **Step 1: Verifica baseline (nessuno spec dedicato — coperto da `BookingsView.spec.ts` che monta il modale indirettamente? Verifica.)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- BookingsView MapView`
Expected: PASS (baseline). *(`SettlePaymentModal` non ha uno spec proprio: è esercitato
indirettamente. Se in fase di esecuzione risultasse non coperto affatto dai due spec sopra, aggiungi
uno spec minimo `SettlePaymentModal.spec.ts` prima di procedere — TDD non è saltabile solo perché
manca un file: verificare con `grep -r SettlePaymentModal apps/web-staff/src/**/*.spec.ts` quale spec
lo monta davvero prima di fidarsi della sola baseline dei due sopra.)*

- [ ] **Step 2: Sostituisci le righe del totale e del footer**

In `apps/web-staff/src/features/bookings/SettlePaymentModal.vue`, nello `<script setup>`, aggiungi
l'import di `formatEuro` e `ModalFooter`:

```ts
import { Modal, Field, Button, ModalFooter, formatEuro } from '@coralyn/ui-kit';
```//sostituisce `import { Modal, Field, Button } from '@coralyn/ui-kit';`

Nel `<template>`, sostituisci:

```vue
      <p class="text-[13px] text-[var(--color-text-2nd)]">
        Totale dovuto:
        <span class="font-semibold tabular-nums text-[var(--color-text)]">€ {{ total.toFixed(2) }}</span>
      </p>
```

con:

```vue
      <p class="text-[13px] text-[var(--color-text-2nd)]">
        Totale dovuto:
        <span class="font-semibold tabular-nums text-[var(--color-text)]">{{ formatEuro(total) }}</span>
      </p>
```

E sostituisci:

```vue
      <div class="flex justify-end gap-2.5 pt-2">
        <Button type="button" variant="secondary" @click="open = false">Annulla</Button>
        <Button type="button" :disabled="submitting" @click="confirm">Conferma incasso</Button>
      </div>
```

con:

```vue
      <ModalFooter class="pt-2" submit-label="Conferma incasso" :submit-disabled="submitting" @cancel="open = false" @submit="confirm" />
```

> **Nota fedeltà pixel:** `ModalFooter` di default emette `pt-1` (Task 1.3); qui si passa
> `class="pt-2"` per riprodurre esattamente `SettlePaymentModal.vue:96` (`pt-2`, non `pt-1` — le due
> spaziature sono diverse, vedi nota Task 1.3). I due bottoni erano `type="button"` con `@click`
> diretti — `ModalFooter` li rende internamente come `type="button"` con gli stessi `variant`
> (`secondary`/default primary) ed emette `cancel`/`submit`, che qui si collegano a `open = false` e
> `confirm` rispettivamente: **stesso comportamento**, stesso testo bottone ("Annulla" default di
> `ModalFooter`, "Conferma incasso" via `submit-label`).

- [ ] **Step 3: Spec verde**

Run: `corepack pnpm --filter @coralyn/web-staff test -- BookingsView MapView`
Expected: PASS (baseline invariata).

- [ ] **Step 4: Typecheck + build**

Run: `corepack pnpm --filter @coralyn/web-staff typecheck && corepack pnpm --filter @coralyn/web-staff build`

- [ ] **Step 5: Verifica visiva**

`preview_start` → apri una prenotazione dalla mappa o da Bookings → "Registra incasso" →
`preview_screenshot` sul modale, `preview_inspect` sul footer bottoni (verifica `pt-2`, `flex
justify-end gap-2.5`) e sul totale dovuto.

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/bookings/SettlePaymentModal.vue
git commit -m "refactor(web-staff): SettlePaymentModal su ModalFooter + formatEuro (astrazione FE)"
```

### Task 4.4: `CustomersView.vue`

**Files:** Modifica `apps/web-staff/src/features/customers/CustomersView.vue`

Adotta: `PageToolbar` · `DataTable` data-driven · `Field`+`Input` (già usati) · `ModalFooter` ·
`initials` da `ui-kit` (spec §6).

- [ ] **Step 1: Verifica baseline**

Run: `corepack pnpm --filter @coralyn/web-staff test -- CustomersView`
Expected: PASS (3 test).

- [ ] **Step 2: Sostituisci il `<script setup>`**

Sostituisci **il blocco `<script setup>` per intero** con:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Button, Avatar, DataTable, Modal, Field, Input, Textarea, Icon, PageToolbar, ModalFooter, initials } from '@coralyn/ui-kit';
import type { CustomerDTO } from '@coralyn/contracts';
import { useCustomers, useCreateCustomer } from './useCustomers';

const router = useRouter();
const { data: customers, isLoading } = useCustomers();
const create = useCreateCustomer();

const open = ref(false);
const firstName = ref(''); const lastName = ref(''); const phone = ref(''); const email = ref(''); const notes = ref('');
function submit() {
  if (!firstName.value || !lastName.value) return;
  create.mutate(
    { firstName: firstName.value, lastName: lastName.value, phone: phone.value || undefined, email: email.value || undefined, notes: notes.value || undefined },
    { onSuccess: () => { firstName.value = ''; lastName.value = ''; phone.value = ''; email.value = ''; notes.value = ''; open.value = false; } },
  );
}
const cols = [
  { key: 'customer', label: 'Cliente' }, { key: 'phone', label: 'Telefono', numeric: true }, { key: 'email', label: 'Email' }, { key: 'notes', label: 'Note' },
];
function ini(c: { firstName: string; lastName: string }) { return initials(`${c.firstName} ${c.lastName}`); }
</script>
```

> **Nota fedeltà pixel:** la vecchia `ini()` locale (`CustomersView.vue:23`) faceva
> `((c.firstName[0] ?? '') + (c.lastName[0] ?? '')).toUpperCase()` — prende SEMPRE la prima lettera
> di nome e cognome. `initials(name)` di `ui-kit` (Task 2.1) prende le iniziali delle **prime 2
> parole** di una stringa unica. Con `initials(\`${c.firstName} ${c.lastName}\`)`, se `firstName` o
> `lastName` contengono **più parole** (es. "Anna Maria"), il risultato cambia rispetto
> all'originale (originale: sempre 1a lettera di firstName + 1a di lastName, es. "AV" per "Anna
> Maria"+"Verdi" = "A"+"V"="AV" — coincide comunque se si passano le stringhe intere come 2 "parole"
> logiche solo quando ciascun campo è una singola parola). **Verificare nello Step 3** con un
> cliente il cui nome/cognome contenga uno spazio (case limite non coperto dagli spec attuali): se
> il comportamento diverge, **non usare** `initials()` di ui-kit qui e mantenere la funzione `ini()`
> locale invariata (è già corretta e specifica per `{firstName, lastName}`, un caso leggermente
> diverso dalla util generica "prime 2 parole di una stringa"). **Decisione presa in questo piano:**
> mantenere `ini()` locale (nessuna riga sopra la si tocca) — la util `initials()` di `ui-kit` resta
> pensata per il caso "nome completo in una stringa" (come già usato in Bookings/Renewals dove il
> nome è `customerName(id)` = stringa unica "Nome Cognome"), mentre qui l'input è
> `{firstName,lastName}` separati: **non sostituire**, il rischio di regressione su nomi/cognomi
> multi-parola non vale il dedup. Rimuovi quindi l'import `initials` e la riga `function ini(...)`
> aggiornata sopra e **ripristina** la funzione originale:

```ts
function ini(c: { firstName: string; lastName: string }) { return ((c.firstName[0] ?? '') + (c.lastName[0] ?? '')).toUpperCase(); }
```

(rimuovi `initials` dall'elenco import `@coralyn/ui-kit` in questo file).

- [ ] **Step 3: Sostituisci il `<template>`**

Sostituisci il blocco toolbar (righe con `<div class="mb-4 flex flex-wrap items-center gap-3">…
</div>`) con:

```vue
    <PageToolbar>
      <template #left>
        <div class="flex w-[300px] items-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[var(--color-placeholder)]">
          <Icon name="search" :size="16" /><span class="text-[13px]">Cerca per nome o telefono…</span>
        </div>
      </template>
      <template #right>
        <span class="text-[12.5px] tabular-nums text-[var(--color-text-muted)]">{{ customers?.length ?? 0 }} clienti</span>
        <Button data-test="new-customer" @click="open = true"><Icon name="plus" :size="16" />Nuovo cliente</Button>
      </template>
    </PageToolbar>
```

Sostituisci il blocco `<DataTable>…</DataTable>` con:

```vue
    <p v-if="isLoading" class="text-[var(--color-text-muted)]">Caricamento…</p>
    <DataTable v-else :columns="cols" :rows="(customers as unknown as Record<string, unknown>[]) ?? []" :row-key="(r) => (r as unknown as CustomerDTO).id">
      <template #cell-customer="{ row }">
        <div class="flex items-center gap-2.5">
          <Avatar :initials="ini(row as unknown as CustomerDTO)" size="sm" />
          <RouterLink :to="{ name: 'customer-detail', params: { id: (row as unknown as CustomerDTO).id } }" class="font-semibold text-[var(--color-text)] hover:text-[var(--color-brand-ink)]" @click.stop>{{ (row as unknown as CustomerDTO).firstName }} {{ (row as unknown as CustomerDTO).lastName }}</RouterLink>
        </div>
      </template>
      <template #cell-phone="{ row }">{{ (row as unknown as CustomerDTO).phone ?? '—' }}</template>
      <template #cell-email="{ row }">{{ (row as unknown as CustomerDTO).email ?? '—' }}</template>
      <template #cell-notes="{ row }"><span class="max-w-[280px] truncate text-[var(--color-text-muted)]">{{ (row as unknown as CustomerDTO).notes ?? '' }}</span></template>
    </DataTable>
```

> **Attenzione — comportamento click-riga:** la `<tr>` originale (`CustomersView.vue:38`) aveva
> `cursor-pointer hover:bg-[var(--color-raised)]` **e** `@click="router.push(...)"` sull'intera riga
> (oltre al link sul nome). `DataTable` data-driven (Task 2.3) genera `<tr>` con **solo**
> `hover:bg-[var(--color-raised)]` (nessun `cursor-pointer`, nessun `@click` di riga: l'API attuale
> non espone un evento riga-click). **Questo È una perdita di comportamento** (non solo di stile) se
> lasciata così: cliccare una cella vuota della riga non naviga più, e il cursore non è più "pointer"
> fuori dal link. **Per lo spec esistente** (`CustomersView.spec.ts:35-42`, "ogni riga linka alla
> scheda del cliente") questo non si rompe (il test verifica solo che esista un link `<a>` col testo
> giusto, non il click sulla riga) — ma è una **regressione comportamentale reale** rispetto
> all'attuale. **Decisione:** non migrare questa vista a `DataTable` data-driven per la tabella
> principale; **mantenere l'attuale API a slot** (retro-compatibilità, spec §9 "se una vista ha
> celle troppo particolari, resta sull'API a slot — nessun obbligo di migrare tutto"). **Sostituire
> quindi** il blocco `DataTable` qui sopra con la versione a slot esistente, **senza modifiche al
> corpo tabella**, e migrare solo `PageToolbar`/`ModalFooter`/`ini()` in questo task:

```vue
    <p v-if="isLoading" class="text-[var(--color-text-muted)]">Caricamento…</p>
    <DataTable v-else :columns="cols">
      <tr v-for="c in customers" :key="c.id" class="cursor-pointer hover:bg-[var(--color-raised)]" @click="router.push({ name: 'customer-detail', params: { id: c.id } })">
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5">
          <div class="flex items-center gap-2.5">
            <Avatar :initials="ini(c)" size="sm" />
            <RouterLink :to="{ name: 'customer-detail', params: { id: c.id } }" class="font-semibold text-[var(--color-text)] hover:text-[var(--color-brand-ink)]" @click.stop>{{ c.firstName }} {{ c.lastName }}</RouterLink>
          </div>
        </td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 tabular-nums text-[var(--color-text-2nd)]">{{ c.phone ?? '—' }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ c.email ?? '—' }}</td>
        <td class="max-w-[280px] truncate border-b border-[var(--color-border-row)] px-[18px] py-3.5 text-[var(--color-text-muted)]">{{ c.notes ?? '' }}</td>
      </tr>
    </DataTable>
```

> Questo **annulla** l'adozione `DataTable` data-driven per `CustomersView` prevista dalla mappa §6.
> Motivazione tracciata sopra: preservare il comportamento click-riga (non solo lo stile) è il
> vincolo più stringente qui — coerente con §9 dei rischi ("se una vista ha celle troppo particolari,
> resta sull'API a slot"). `cols` nello script sopra resta con `numeric: true` rimosso da `phone` (non
> serve più, era solo per il modo data-driven): **ripristina** anche

```ts
const cols = [
  { key: 'customer', label: 'Cliente' }, { key: 'phone', label: 'Telefono' }, { key: 'email', label: 'Email' }, { key: 'notes', label: 'Note' },
];
```

(senza `numeric: true`, dato che ora la colonna è resa dallo slot a mano come prima, con
`tabular-nums` esplicito sulla `<td>`).

Sostituisci il footer del modale:

```vue
        <div class="flex justify-end gap-2.5 pt-1">
          <Button variant="secondary" type="button" @click="open = false">Annulla</Button>
          <Button type="submit">Salva cliente</Button>
        </div>
```

con:

```vue
        <ModalFooter submit-label="Salva cliente" @cancel="open = false" @submit="submit" />
```

> Il bottone "Salva cliente" era `type="submit"` dentro un `<form @submit.prevent="submit">`
> (`CustomersView.vue:52-63`). `ModalFooter` emette `submit` al click (non è un `<button
> type="submit">` nativo) — collegato a `@submit="submit"` invoca la stessa funzione `submit()`.
> **Comportamento preservato**: click sul bottone chiama `submit()` esattamente come il submit nativo
> del form (che a sua volta chiamava `submit()` via `@submit.prevent`). Il form resta `<form
> data-test="form-new-customer" @submit.prevent="submit">` invariato (il test
> `CustomersView.spec.ts:27-28` dispatcha un evento `submit` nativo sul form — questo continua a
> funzionare perché il form stesso non cambia, solo il bottone al suo interno cambia da nativo
> `type="submit"` a `ModalFooter` con click-handler esplicito. **Verifica Step 4** che il test "crea
> un cliente dal modal" resti verde: se il dispatch di `submit` sul form non passa più per il bottone
> del `ModalFooter` — che non è `type="submit"` — il test potrebbe comunque passare perché dispatcha
> l'evento **direttamente sul form**, non tramite click sul bottone. Nessuna regressione attesa.)*

- [ ] **Step 4: Spec verde**

Run: `corepack pnpm --filter @coralyn/web-staff test -- CustomersView`
Expected: PASS (3 test, invariati).

- [ ] **Step 5: Typecheck + build**

Run: `corepack pnpm --filter @coralyn/web-staff typecheck && corepack pnpm --filter @coralyn/web-staff build`

- [ ] **Step 6: Verifica visiva**

`preview_start` → naviga `/customers` → `preview_screenshot` sulla toolbar (ricerca + contatore +
bottone) e sul modale "Nuovo cliente" (footer bottoni) → `preview_inspect` per confermare classi
invariate sulla riga tabella (che non è cambiata) e sul footer modale.

- [ ] **Step 7: Commit**

```bash
git add apps/web-staff/src/features/customers/CustomersView.vue
git commit -m "refactor(web-staff): CustomersView su PageToolbar + ModalFooter (astrazione FE; tabella resta su API a slot per preservare click-riga)"
```

### Task 4.5: `CustomerDetailView.vue`

**Files:** Modifica `apps/web-staff/src/features/customers/CustomerDetailView.vue`

Adotta: `Field`+`Input` (già usati) · `initials` da `ui-kit` (spec §6).

> **Nota:** qui l'input di `initials` è **una singola stringa già combinata** logicamente
> equivalente (vedi sotto), non `{firstName,lastName}` come in CustomersView — il rischio di
> divergenza multi-parola discusso in Task 4.4 **non si applica allo stesso modo**, ma va comunque
> verificato.

- [ ] **Step 1: Verifica baseline**

Run: `corepack pnpm --filter @coralyn/web-staff test -- CustomerDetailView`
Expected: PASS (3 test).

- [ ] **Step 2: Sostituisci l'import e il computed `ini`**

In `apps/web-staff/src/features/customers/CustomerDetailView.vue`, sostituisci:

```ts
import { Card, Avatar, Badge, Button, Field, Input, Textarea, Icon } from '@coralyn/ui-kit';
```

con:

```ts
import { Card, Avatar, Badge, Button, Field, Input, Textarea, Icon, initials } from '@coralyn/ui-kit';
```

E sostituisci:

```ts
const ini = computed(() => (customer.value ? ((customer.value.firstName[0] ?? '') + (customer.value.lastName[0] ?? '')).toUpperCase() : ''));
```

con:

```ts
const ini = computed(() => (customer.value ? initials(`${customer.value.firstName} ${customer.value.lastName}`) : ''));
```

> **Verifica di equivalenza:** `initials('Mario Rossi')` (Task 2.1) → split su spazio → `['Mario',
> 'Rossi']` → prime 2 parole → `'M' + 'R'` → `'MR'`. Identico all'originale
> `(firstName[0]+lastName[0]).toUpperCase()` **quando `firstName` e `lastName` sono singole parole**
> (caso comune). **Diverge** se `firstName` o `lastName` contiene uno spazio interno (es. "Anna
> Maria" + "Verdi" → originale: "A"+"V"="AV"; nuovo: split di "Anna Maria Verdi" → prime 2 parole →
> "Anna"+"Maria" → "AM" — **diverso!**). **Nessuno spec attuale copre questo caso limite**
> (`CustomerDetailView.spec.ts` letto in fase di piano non testa nomi multi-parola). **Decisione:**
> accettare il dedup qui (rischio basso, nomi propri raramente hanno spazi interni nel dataset reale
> del gestore) ma **annotarlo esplicitamente** nel Self-review come rischio noto e tracciarlo — se il
> team preferisce zero rischio comportamentale, la mitigazione è identica a Task 4.4 (non
> sostituire, mantenere il calcolo locale). Eseguire comunque lo Step 3 per confermare che lo spec
> esistente non copra (e quindi non riveli) questa divergenza.

- [ ] **Step 3: Spec verde**

Run: `corepack pnpm --filter @coralyn/web-staff test -- CustomerDetailView`
Expected: PASS (3 test, invariati — nessuno testa nomi multi-parola).

- [ ] **Step 4: Typecheck + build**

Run: `corepack pnpm --filter @coralyn/web-staff typecheck && corepack pnpm --filter @coralyn/web-staff build`

- [ ] **Step 5: Verifica visiva**

`preview_start` → naviga `/customers/:id` di un cliente esistente → `preview_screenshot` sull'header
con avatar iniziali → `preview_inspect` sull'`Avatar` per confermare le iniziali invariate per un
cliente con nome/cognome singola-parola (caso comune del seed).

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/customers/CustomerDetailView.vue
git commit -m "refactor(web-staff): CustomerDetailView su initials da ui-kit (astrazione FE)"
```

### Task 4.6: `MapView.vue` (modale) — la più grande, ultima prima delle mock

**Files:** Modifica `apps/web-staff/src/features/map/MapView.vue`

Adotta: `Field`+`Input`+`Select` (Tipo/Pacchetto/Cliente/Fascia/date) · `ModalFooter` · `formatEuro`
· `statusMaps` (badge stato) (spec §6). Vista grande: si mostrano solo gli **hunch** esatti da
cambiare, non il file intero (già letto per intero in fase di piano — righe citate sotto sono
verificate contro il contenuto reale).

> **Nota sector/toolbar:** la mappa di adozione (§3.4) cita `MapView.vue:166-171` come sorgente delle
> classi `PageToolbar`, ma quel blocco (`MapView.vue:166-172`, letto in fase di piano) è
> `<div class="flex flex-wrap items-center gap-3 px-[26px] pt-4">` — **manca `mb-4`** e **ha
> `px-[26px] pt-4`** che negli altri due consumer (`BookingsView`/`CustomersView`) sta sul `<section>`
> padre, non sul toolbar stesso. Sostituire qui cambierebbe le classi effettivamente presenti su
> quell'elemento (aggiungerebbe `mb-4`, toglierebbe `px-[26px] pt-4` che nessun altro elemento
> riprenderebbe). **Decisione:** `MapView` **non adotta `PageToolbar`** per questo blocco (fuori
> scope: la spec elenca "MapView" tra i consumer di `PageToolbar` in §3.4 ma con classi
> incompatibili — priorità al vincolo di fedeltà pixel). La riga "PageToolbar" per MapView nella
> mappa adozione si considera quindi **non realizzata** (nessun elemento del genere in questa vista
> soddisfa il pattern esatto) — annotare nel Self-review.

- [ ] **Step 1: Verifica baseline**

Run: `corepack pnpm --filter @coralyn/web-staff test -- MapView`
Expected: PASS (2 test).

- [ ] **Step 2: Import — aggiungi `Select`, `ModalFooter`, `formatEuro`, `statusMaps`**

In `apps/web-staff/src/features/map/MapView.vue`, sostituisci la riga import:

```ts
import { UmbrellaCell, SegmentedControl, Badge, Button, Modal, Icon } from '@coralyn/ui-kit';
```

con:

```ts
import { UmbrellaCell, SegmentedControl, Badge, Button, Modal, Icon, Select, ModalFooter, formatEuro } from '@coralyn/ui-kit';
```

E aggiungi, subito dopo gli import esistenti:

```ts
import { PAY_LABEL, PAY_TONE } from '@/lib/statusMaps';
```

- [ ] **Step 3: Sostituisci il badge stato pagamento nel pannello laterale**

Trova (hunch esatto, verificato contro `MapView.vue:254-258`):

```vue
              <Badge :tone="currentBooking.paymentStatus === 'paid' ? 'success' : currentBooking.paymentStatus === 'partial' ? 'warning' : 'neutral'">
                {{ currentBooking.paymentStatus === 'paid' ? 'Saldato' : currentBooking.paymentStatus === 'partial' ? 'Parziale' : 'Da incassare' }}
              </Badge>
```

Sostituisci con:

```vue
              <Badge :tone="PAY_TONE[currentBooking.paymentStatus]">{{ PAY_LABEL[currentBooking.paymentStatus] }}</Badge>
```

> **Verifica di equivalenza:** `PAY_TONE.paid==='success'`, `.partial==='warning'`,
> `.unpaid==='neutral'` (Task 3.1) — coincide esattamente col ternario a cascata originale.
> `PAY_LABEL` idem per le label.

Trova (`MapView.vue:253`, l'importo):

```vue
            <div class="flex justify-between border-b border-dashed border-[var(--color-border-row)] py-2"><span class="text-[var(--color-text-muted)]">Importo</span><span class="font-semibold tabular-nums text-[var(--color-text)]">€ {{ currentBooking.totalPrice }}</span></div>
```

> **Attenzione:** questa riga usa `€ {{ currentBooking.totalPrice }}` **senza** `.toFixed(2)` (a
> differenza delle altre viste) — `formatEuro` **aggiunge sempre** `.toFixed(2)`. Sostituirla
> **cambierebbe la resa** per importi non interi o già a 2 decimali diversamente formattati (es.
> `totalPrice = 30` → originale mostra `€ 30`, `formatEuro(30)` mostra `€ 30.00` — **diverso!**).
> **Decisione: NON sostituire questa riga** — resta `€ {{ currentBooking.totalPrice }}` invariata
> (il vincolo di fedeltà pixel vince sul dedup; la spec §4 cita esplicitamente `MapView:318` per
> `formatEuro`, che è una riga diversa — vedi Step 4 sotto — non questa).

- [ ] **Step 4: Sostituisci il prezzo preventivo nel modale (riga citata dalla spec, `MapView.vue:318`)**

Trova:

```vue
          <p v-else class="text-lg font-bold tabular-nums text-[var(--color-text)]">€ {{ (quote?.totalPrice ?? 0).toFixed(2) }}</p>
```

Sostituisci con:

```vue
          <p v-else class="text-lg font-bold tabular-nums text-[var(--color-text)]">{{ formatEuro(quote?.totalPrice ?? 0) }}</p>
```

> Equivalente esatto: `(x).toFixed(2)` preceduto da `'€ '` letterale == `formatEuro(x)`.

- [ ] **Step 5: Sostituisci i 3 `<select>` inline del modale con `Select`**

Trova (Tipo, `MapView.vue:280-286`):

```vue
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Tipo</label>
          <select v-model="bookingType" class="w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none">
            <option value="daily">Giornaliera</option>
            <option value="periodic">Periodica</option>
            <option value="subscription">Abbonamento</option>
          </select>
        </div>
```

Sostituisci con:

```vue
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Tipo</label>
          <Select v-model="bookingType">
            <option value="daily">Giornaliera</option>
            <option value="periodic">Periodica</option>
            <option value="subscription">Abbonamento</option>
          </Select>
        </div>
```

Trova (Cliente, `MapView.vue:288-297`):

```vue
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Cliente</label>
          <select v-model="customerId" class="w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none">
            <option value="" disabled>Seleziona un cliente…</option>
            <option v-for="c in (customers ?? [])" :key="c.id" :value="c.id">{{ c.firstName }} {{ c.lastName }}</option>
          </select>
          <p v-if="(customers ?? []).length === 0" class="mt-1.5 text-[11.5px] text-[var(--color-text-muted)]">
            Nessun cliente. <router-link to="/customers" class="font-semibold text-[var(--color-accent)]">Crea un cliente</router-link>.
          </p>
        </div>
```

Sostituisci con:

```vue
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Cliente</label>
          <Select v-model="customerId">
            <option value="" disabled>Seleziona un cliente…</option>
            <option v-for="c in (customers ?? [])" :key="c.id" :value="c.id">{{ c.firstName }} {{ c.lastName }}</option>
          </Select>
          <p v-if="(customers ?? []).length === 0" class="mt-1.5 text-[11.5px] text-[var(--color-text-muted)]">
            Nessun cliente. <router-link to="/customers" class="font-semibold text-[var(--color-accent)]">Crea un cliente</router-link>.
          </p>
        </div>
```

Trova (Pacchetto, `MapView.vue:307-313`):

```vue
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Pacchetto</label>
          <select v-model="packageId" class="w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none">
            <option value="">Nessun pacchetto</option>
            <option v-for="p in (packages ?? [])" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
```

Sostituisci con:

```vue
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Pacchetto</label>
          <Select v-model="packageId">
            <option value="">Nessun pacchetto</option>
            <option v-for="p in (packages ?? [])" :key="p.id" :value="p.id">{{ p.name }}</option>
          </Select>
        </div>
```

> **Verifica di equivalenza classi:** `Select.vue` (Task 1.2) emette esattamente
> `w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none`
> — identiche ai 3 `<select>` sostituiti (stessa stringa, verificata sopra). Uso dello slot
> `#default` (non `options` prop) perché servono `<option disabled>`/valori speciali ("Nessun
> pacchetto") — coerente con l'API di `Select.vue` (§3.2: "slot `#default` per gli `<option>` (per
> gruppi/'Nessun …')").

- [ ] **Step 6: Sostituisci il footer del modale prenotazione**

Trova (`MapView.vue:320-323`):

```vue
        <div class="flex justify-end gap-2.5 pt-2">
          <Button variant="secondary" @click="modalBooking = false">Annulla</Button>
          <Button :disabled="quoteError || quoteLoading" @click="confirmBooking">Conferma prenotazione</Button>
        </div>
```

Sostituisci con:

```vue
        <ModalFooter class="pt-2" submit-label="Conferma prenotazione" :submit-disabled="!!quoteError || quoteLoading" @cancel="modalBooking = false" @submit="confirmBooking" />
```

> **Nota tipi:** `quoteError` è `isError` di TanStack Query (booleano) — `!!quoteError` è
> ridondante ma esplicita l'intento se il tipo inferito fosse `Ref<boolean>` vs `boolean`; verificare
> col typecheck (Step 8) se il cast è necessario o superfluo e rimuoverlo se TS non lo richiede.

- [ ] **Step 7: Spec verde**

Run: `corepack pnpm --filter @coralyn/web-staff test -- MapView`
Expected: PASS (2 test, invariati).

- [ ] **Step 8: Typecheck + build (+ pulizia cache se necessario)**

Run:
```bash
corepack pnpm --filter @coralyn/web-staff typecheck
corepack pnpm --filter @coralyn/web-staff build
```
Se il typecheck lamenta export non trovati da `@coralyn/ui-kit` (Select/ModalFooter/formatEuro non
ancora "visti" dal build system dopo i task precedenti), esegui:
```bash
corepack pnpm --filter @coralyn/ui-kit build
```
e, se persiste, elimina la cache Vite:
```bash
rm -rf apps/web-staff/node_modules/.vite
```
(su PowerShell: `Remove-Item -Recurse -Force apps/web-staff/node_modules/.vite -ErrorAction SilentlyContinue`)
e ri-esegui typecheck/test.

- [ ] **Step 9: Verifica visiva (vista rappresentativa citata dalla spec §7 — modale aperto)**

`preview_start` → naviga `/map` → clicca un ombrellone libero → "Nuova prenotazione" → apri il
modale → `preview_screenshot` sul modale con tutti i select popolati → `preview_inspect` su ciascun
`<select>` (verifica classi identiche ai 3 originali) e sul footer (`pt-2`, bottoni). Ripeti su un
ombrellone occupato per il badge stato pagamento nel pannello laterale.

- [ ] **Step 10: Commit**

```bash
git add apps/web-staff/src/features/map/MapView.vue
git commit -m "refactor(web-staff): MapView su Select + ModalFooter + formatEuro + statusMaps (astrazione FE)"
```

### Task 4.7: `PricingView.vue` (mock — resta mock)

**Files:** Modifica `apps/web-staff/src/features/pricing/PricingView.vue`

Adotta: `DataTable` data-driven · `Card` (già usato) — **pixel-identica**, resta mock (spec §6, §1
"fuori scope: nuovi endpoint/dati reali per le viste mock"). Nessuno spec dedicato esiste per questa
vista (verificato in fase di piano: nessun `PricingView.spec.ts`) — la verifica è **solo**
typecheck/build/screenshot.

- [ ] **Step 1: Verifica che non esista uno spec (conferma, nessuna baseline da rompere)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- PricingView`
Expected: "No test files found" (atteso — nessun test esistente per questa vista).

- [ ] **Step 2: Sostituisci il corpo tabella con la modalità data-driven**

In `apps/web-staff/src/features/pricing/PricingView.vue`, sostituisci l'import:

```ts
import { Button, Badge, Card, DataTable, Icon } from '@coralyn/ui-kit';
```

(invariato — nessun nuovo import di componente serve; `tariffe` diventa le `rows`).

Sostituisci:

```vue
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
```

con:

```vue
    <DataTable :columns="cols" :rows="(tariffe as unknown as Record<string, unknown>[])" :row-key="(_r, i) => String(i)">
      <template #cell-posizione="{ row }"><span class="font-semibold text-[var(--color-text)]">{{ (row as unknown as typeof tariffe[number]).posizione }}</span></template>
      <template #cell-giorno="{ row }"><span class="text-[var(--color-text)]">{{ (row as unknown as typeof tariffe[number]).giorno }}</span></template>
      <template #cell-settimana="{ row }"><span class="text-[var(--color-text)]">{{ (row as unknown as typeof tariffe[number]).settimana }}</span></template>
      <template #cell-stagione="{ row }"><span class="font-bold text-[var(--color-text)]">{{ (row as unknown as typeof tariffe[number]).stagione }}</span></template>
    </DataTable>
```

> **Nota `rowKey`:** l'originale usa l'indice dell'array come `:key` (`v-for="(t, i) in tariffe"
> :key="i"`) perché `tariffe` non ha un id proprio (dati mock statici) — `row-key="(_r, i) =>
> String(i)"` replica esattamente questa strategia (nota: la firma di `rowKey` nel `DataTable`
> potenziato, Task 2.3, è `(row) => string`, **senza indice** — se il typecheck lamenta un parametro
> in eccesso, aggiornare la firma di `rowKey` in `DataTable.vue` per accettare opzionalmente
> l'indice: `rowKey?: (row, index: number) => string`, oppure — più semplice e senza toccare di
> nuovo `DataTable` — omettere `row-key` qui e lasciare che il componente usi il fallback interno
> `String(idx)` già presente nella funzione `key()` di `DataTable.vue` Task 2.3 quando `rowKey` è
> assente. **Scelta:** omettere `:row-key` in questo task, sfruttando il fallback esistente.)*

Correggi quindi la riga sopra rimuovendo `:row-key`:

```vue
    <DataTable :columns="cols" :rows="(tariffe as unknown as Record<string, unknown>[])">
```

> **Colonne `posizione`/`pacchetto`/`fascia` non hanno slot custom:** default rendering
> `row[column.key]` con classe standard (`TD`/`TD_FIRST`) — coincide con le `<td>` originali per
> `pacchetto`/`fascia` (classe `TD` esatta) e per `posizione` (prima colonna, `TD_FIRST`, ma
> l'originale ha **anche** `font-semibold text-[var(--color-text)]` che il default `TD_FIRST` non
> applica — per questo `posizione` ha uno slot custom sopra che aggiunge lo `<span
> class="font-semibold text-[var(--color-text)]">`). Le colonne `giorno`/`settimana` hanno slot
> custom per lo stesso motivo (colore testo non-muted, mentre il default cella usa
> `text-[var(--color-text-2nd)]` implicito da nessuna classe — verifica: il default `DataTable`
> data-driven **non** imposta alcun colore testo esplicito sul contenuto, quindi eredita
> `text-[var(--color-text)]` dal contesto tabella? **Verificare attentamente**: l'originale
> `giorno`/`settimana` hanno esplicitamente `text-[var(--color-text)]` (non `-2nd`), che è il default
> "neutro" — se il rendering senza slot custom produce lo stesso colore visivo, gli slot per
> `giorno`/`settimana` sono superflui e possono essere rimossi per semplicità; **mantenerli espliciti
> qui è la scelta più sicura per la fedeltà pixel** (nessuna classe di colore viene "ereditata per
> caso" da un genitore, dato che `<td>` non ha classi di colore testo di default nel `DataTable`
> potenziato). `stagione` ha `font-bold` in più (colonna finale, enfatizzata) → slot custom
> necessario.

- [ ] **Step 3: Typecheck + build**

Run: `corepack pnpm --filter @coralyn/web-staff typecheck && corepack pnpm --filter @coralyn/web-staff build`
Expected: nessun errore.

- [ ] **Step 4: Verifica visiva**

`preview_start` → naviga `/pricing` → `preview_screenshot` sulla tabella tariffe → `preview_inspect`
su ciascuna colonna (`posizione` grassetto, `stagione` grassetto+destra, `giorno`/`settimana`
allineate a destra tabular-nums) per confermare che nessuna classe sia cambiata rispetto
all'originale.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/pricing/PricingView.vue
git commit -m "refactor(web-staff): PricingView (mock) su DataTable data-driven, pixel-identica (astrazione FE)"
```

### Task 4.8: `ReportView.vue` (mock — resta mock)

**Files:** Modifica `apps/web-staff/src/features/report/ReportView.vue` (se emerge un `ListItem`
utile) o **nessuna modifica** se non emerge nulla di dedup-abile.

> **Nota di ambiguità risolta:** la mappa di adozione (§6) per `ReportView` dice: "(KpiCard/BarChart/
> StackedBar già) · eventuale ListItem se emerge". Rileggendo `ReportView.vue` per intero (fatto in
> fase di piano): la sezione "Abbonamenti in scadenza" (righe 62-72) ha un pattern ripetuto
> (`Avatar` + nome + dettaglio + bottone) che **potrebbe** diventare un `ListItem`, ma **nessun altro
> consumer attuale** nella codebase usa lo stesso pattern (non è duplicato altrove — è la sola vista
> con questa struttura). Estrarre un componente `ListItem` per un **singolo uso** violerebbe YAGNI
> (ADR-0033 §4: "Non si anticipano componenti 'che potrebbero servire'") e la nota "Cautela" della
> spec (§9, "over-engineering" si applica per analogia). **Decisione: nessuna estrazione in questo
> task.** `ReportView.vue` **non viene modificato** — resta mock, pixel-identica per definizione
> (zero modifiche). Il task esiste nel piano solo per completezza dell'ordine di adozione (§8), ma
> il suo "step" è la verifica esplicita che non ci sia nulla da estrarre.

- [ ] **Step 1: Conferma che nessun altro consumer condivida il pattern "Avatar + nome + dettaglio + bottone"**

Cerca nel codebase (`grep -rn "Avatar" apps/web-staff/src/features --include=*.vue`) e verifica a
mano se un secondo consumer con la stessa combinazione esiste. Se **sì** (nuova vista introdotta dopo
la scrittura di questo piano), valutare l'estrazione di un `ListItem` in `ui-kit` seguendo lo stesso
schema TDD di Task 1 (spec-first, classi quotate verbatim). Se **no** (atteso, stato alla scrittura
del piano): non fare nulla.

- [ ] **Step 2: Typecheck + build (verifica che la vista compili invariata — nessuna modifica attesa)**

Run: `corepack pnpm --filter @coralyn/web-staff typecheck && corepack pnpm --filter @coralyn/web-staff build`
Expected: nessun errore (il file non è stato toccato).

- [ ] **Step 3: Verifica visiva (baseline, nessuna differenza attesa per costruzione)**

`preview_start` → naviga `/report` (o `/` se è la home) → `preview_screenshot` per il record
before/after del refactor complessivo (utile come riferimento finale, anche se questa vista non
cambia).

- [ ] **Step 4: Nessun commit necessario** (nessun file modificato). Se lo Step 1 rivela un secondo
consumer e si procede con l'estrazione, allora: commit dedicato con lo stesso pattern TDD (spec ui-kit
→ componente → adozione → spec vista verde → screenshot → commit).

---

## Task 5: Verifica finale (DoD) — tutta la fase 4 completata

**Files:** nessuno (solo verifica)

- [ ] **Step 1: Tutti i test + typecheck + build + lint**

Run:
```bash
corepack pnpm -r build
corepack pnpm eslint .
corepack pnpm --filter @coralyn/ui-kit test
corepack pnpm --filter @coralyn/web-staff typecheck
corepack pnpm --filter @coralyn/web-staff test
```
Expected: tutto verde. Conteggi attesi (da ricontare dal vivo, non assumere): ui-kit **42** (14
baseline + 12 Task1 + 7 Task2.1 + 4 Task2.2 + 5 Task2.3 = 42) · web-staff **≥ 53** (47 baseline + 3
statusMaps + 3 useEntityLabels + 3 useQueryResource = 56; **nessun nuovo spec di vista** è stato
aggiunto in Fase 4 — solo le viste esistenti sono state modificate mantenendo i loro spec invariati,
quindi il totale web-staff atteso è **56**, non 47: la baseline "47 da non regredire" resta
soddisfatta per costruzione, il totale cresce per i nuovi spec di `lib/`).

> **Nota conteggio:** ricontrollare l'aritmetica esatta eseguendo i comandi sopra — i numeri qui sono
> una stima verificata algebricamente in fase di scrittura del piano, non un output reale di test
> (l'esecuzione è delegata). Se il conteggio osservato diverge da quello stimato, la fonte di verità
> è **sempre l'esecuzione reale**, non questo documento.

- [ ] **Step 2: Screenshot before/after finale sulle 4 viste rappresentative (spec §7)**

`preview_start` (config `web-staff`) → per ciascuna di **BookingsView, MapView (modale aperto),
RenewalsView, CustomersView (modale)**: `preview_screenshot` + `preview_inspect` su almeno un
elemento chiave. Confronta con gli screenshot presi nei rispettivi task 4.1/4.2/4.4/4.6. Nessuna
differenza visiva accettata: se emerge una differenza, tornare al task della vista responsabile,
correggere le classi (non il comportamento), ri-verificare.

- [ ] **Step 3: Nessun commit in questo task** (solo verifica; se emergono fix, ogni fix è un commit
piccolo e mirato nel task/vista di competenza, non un commit "fix generico" a fine piano).

---

## Self-review (eseguito in fase di scrittura)

- **Copertura spec:** §3.1 EmptyState → Task 1.1; §3.2 Select → Task 1.2 + adozione MapView Task
  4.6; §3.3 ModalFooter → Task 1.3 + adozione SettlePaymentModal/CustomersView/MapView Task
  4.3/4.4/4.6; §3.4 PageToolbar → Task 1.4 + adozione Bookings/Customers Task 4.1/4.4 (**non**
  MapView, vedi nota Task 4.6); §3.5 DataTable data-driven → Task 2.3 + adozione Bookings/Renewals/
  Pricing Task 4.1/4.2/4.7 (**non** Customers, vedi nota Task 4.4); §3.6 classi cella → Task 2.2
  (scelta TS invece di `@apply`, motivata); §4 format.ts → Task 2.1 + adozione in tutte le viste
  applicabili (Bookings/Renewals/SettlePaymentModal/MapView/CustomerDetail); §5.1 useEntityLabels →
  Task 3.2 + adozione Bookings/Renewals/(non Customers/CustomerDetail: usano `initials`/`ini`
  direttamente, non serve la Map completa); §5.2 statusMaps → Task 3.1 + adozione Bookings/MapView;
  §5.3 useQueryResource → Task 3.3 (scope ridotto a 2 helper, `useBookingQuote` esplicitamente
  escluso e motivato); §6 mappa di adozione → Task 4.1-4.8, con **3 deviazioni esplicite e motivate**
  (CustomersView tabella resta a slot per preservare click-riga; MapView non adotta PageToolbar per
  incompatibilità classi; ReportView non produce estrazioni per YAGN/singolo-uso); §7 verifica →
  ogni task 4.x ha spec-verde + screenshot; Task 5 è la verifica aggregata finale; §8 fasi → Task
  1/2/3/4 rispettano l'ordine "primitive → util+DataTable → shared dominio → adozione incrementale";
  §9 rischi → tracciati puntualmente (DataTable troppo ambizioso → retro-compat verificata da spec
  dedicati; useQueryResource over-engineering → useBookingQuote escluso; viste mock → Pricing/Report
  toccate solo strutturalmente, zero dati nuovi).
- **Placeholder:** nessuno; ogni step crea/modifica file con contenuto reale o quota l'hunk esatto
  con file:riga verificato contro il contenuto letto in fase di piano.
- **Coerenza tipi/nomi:** `EmptyState{message,slot#default}` ↔ uso in Task 4.1/4.2; `Select{options?,
  slot#default,v-model}` ↔ uso in Task 4.6 (sempre via slot, mai `options` — coerente con la nota
  §3.2 su gruppi/opzioni speciali); `ModalFooter{cancelLabel,submitLabel,submitDisabled,
  submitVariant,@cancel,@submit,slot#extra}` ↔ uso identico nei 3 consumer (Task 4.3/4.4/4.6);
  `PageToolbar{slot#left,#right,#actions}` ↔ uso in Task 4.1 (`#left`+`#right`) e 4.4
  (`#left`+`#right`); `DataTable{columns,rows?,rowKey?,slot#cell-<key>}` ↔ uso in Task 4.1/4.2/4.7
  (con cast `Record<string,unknown>`, alternativa generics SFC segnalata); `formatEuro/initials/
  dateRange` ↔ stessa firma in ogni chiamata (Task 2.1, adottate in 4.1/4.2/4.3/4.5/4.6, **NON**
  adottate in 4.4/CustomersView per `initials` — motivato — e **NON** in una riga di MapView, Task
  4.6 Step 3, motivato); `useEntityLabels(){customerName,umbrellaLabel,packageName}` ↔ uso in Task
  4.1/4.2 (stessa destrutturazione); `PAY_LABEL/PAY_TONE/TYPE_LABEL` ↔ uso in Task 4.1/4.6; `TD/
  TD_FIRST/TD_RIGHT/TD_NUM` ↔ usati solo internamente da `DataTable.vue` (Task 2.3), mai importati
  direttamente da una vista in questo piano (nessuna vista scrive `<td>` a mano con queste costanti
  — coerente con "disponibili per celle custom" della spec, opzione non esercitata perché non
  necessaria nei casi concreti incontrati); `queryResource/mutationResource` ↔ firma
  `{queryKey:()=>QueryKey, queryFn, enabled?}` / `{mutationFn, invalidates: QueryKey[]}` usata
  identicamente nei 5 file riscritti (Task 3.3 Step 5).
- **Ambiguità della spec risolte esplicitamente in questo piano (elenco):**
  1. `Select.vue` — allineamento a `Input.vue` (richiesto dalla spec) vs. fedeltà pixel alle classi
     attuali di `MapView` (diverse da `Input.vue`): **vince la fedeltà pixel** (Task 1.2).
  2. `ModalFooter` — spaziatura verticale non uniforme tra i 3 consumer (`pt-1` vs `pt-2`): risolta
     con `class` passthrough, default `pt-1`, override esplicito dove serve (Task 1.3).
  3. Classi di cella — `@apply` in CSS vs. componenti `<Td>`: scelta una terza via (costanti TS) per
     evitare doppia fonte di verità (Task 2.2).
  4. Conteggio "13 composable" della spec §5.3 — interpretato come 13 *funzioni* esportate (verificato
     per conteggio diretto), non 13 file (Task 3.3).
  5. `useQueryResource` — `useBookingQuote` escluso dalla riscrittura (l'astrazione non riduce
     boilerplate lì): scope ridotto come esplicitamente permesso dalla spec §5.3 (Task 3.3).
  6. `CustomersView` — la mappa di adozione (§6) implica `DataTable` data-driven, ma la tabella ha un
     comportamento click-riga che l'API data-driven non espone: **si resta sull'API a slot**
     (Task 4.4), coerente con §9 ("nessun obbligo di migrare tutto").
  7. `MapView` — la mappa di adozione (§6) implica `PageToolbar`, ma il blocco toolbar di `MapView`
     ha classi incompatibili (`px-[26px] pt-4` sul contenitore, non `mb-4`): **non adottato**
     (Task 4.6).
  8. `RenewalsView` — la mappa di adozione (§6) implica "Field+Input (date)", ma sostituire i due
     `<input type="date">` inline con `Field`+`Input` cambierebbe le classi: **non adottato**
     (Task 4.2), coerente con §1 "fuori scope: ridisegno visivo".
  9. `ReportView` — "eventuale ListItem se emerge": verificato che non emerge (pattern a singolo uso,
     YAGNI) → nessuna estrazione (Task 4.8).
  10. `CustomersView`/`CustomerDetailView` — dedup di `initials`/`ini` locale con la util `ui-kit`:
      accettato solo dove l'input è già una stringa singola (CustomerDetailView, rischio noto e
      tracciato per nomi multi-parola) e **rifiutato** dove l'input è `{firstName,lastName}`
      separati con semantica leggermente diversa (CustomersView) — Task 4.4/4.5.
- **Baseline verificata dal vivo (non solo assunta dalla spec):** `corepack pnpm --filter
  @coralyn/ui-kit test` → **14 test, 7 file** PASS; `corepack pnpm --filter @coralyn/web-staff test`
  → **47 test, 19 file** PASS. Eseguito il 2026-07-01 in fase di scrittura del piano, working tree
  pulito (nessuna modifica applicativa pendente).

---

## Nota di esecuzione

**Questa sessione ha prodotto solo il design e questo piano.** Nessun file applicativo è stato
creato o modificato, nessun comando di build/test è stato eseguito per validare il codice del
piano (solo per contare la baseline), nessun commit è stato creato. **L'esecuzione è delegata alla
sessione successiva** (vedi
[docs/handoff/2026-07-01-frontend-abstraction-delegation.md](../handoff/2026-07-01-frontend-abstraction-delegation.md)),
che dovrà: (1) creare un nuovo branch da `main`; (2) eseguire i Task 1→5 in ordine, task-by-task,
con `superpowers:subagent-driven-development` o `superpowers:executing-plans`; (3) per ogni step
con codice, verificare che il codice qui scritto compili/passi davvero (il piano è stato scritto con
cura e classi verificate contro le sorgenti reali, ma non è stato eseguito riga per riga: trattare
ogni blocco di codice come una bozza da validare con i comandi TDD indicati, non come verità
assoluta); (4) se un'asserzione di equivalenza (es. "classi identiche", "comportamento invariato")
si rivela falsa all'esecuzione, **fermarsi e correggere secondo il vincolo di fedeltà pixel**, non
seguire ciecamente il piano.
