# Select su reka-ui — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire il `<select>` nativo di ui-kit con un Select composto su reka-ui (trigger stilato + menu popper + componente `Option`), preservando l'API `v-model`/`options`/slot, e migrare in big-bang i 16 file consumatori di web-staff con i loro spec.

**Architecture:** `Select.vue` riscritto su `SelectRoot/Trigger/Value/Portal/Content/Viewport`; nuovo `Option.vue` su `SelectItem`. Il valore vuoto `''` (usato da 10+ consumatori come stato reale) è vietato da reka-ui su `SelectItem`: una **sentinella interna** a ui-kit fa la mappatura `''`↔sentinella in entrambe le direzioni, invisibile ai consumatori. Gli spec delle viste passano da `.value`+`change` sul nativo a un **helper condiviso** `selectOption()` che apre il trigger e clicca l'item nel portal.

**Tech Stack:** Vue 3.5, reka-ui 2.10.1 (già dipendenza di ui-kit — NON aggiungerla alle app), Tailwind v4 con token di `theme.css`, vitest+jsdom+MSW.

**Spec:** [2026-07-23-select-reka-ui-design.md](../specs/2026-07-23-select-reka-ui-design.md)

## Global Constraints

- reka-ui si importa SOLO dentro `packages/ui-kit` (gotcha di repo). Le app consumano i wrapper.
- Nessun colore hex fuori da `theme.css`; usare i token esistenti citati nei task. Niente tema dark.
- Niente em dash `—` in stringhe visibili all'utente (policy 5.5); l'en dash `–` come segnaposto dati è ok.
- Commenti e copy in italiano, stile del file ospite.
- Dopo OGNI task: suite COMPLETA `corepack pnpm -C apps/web-staff test` (include ui-kit), mai il solo spec. Suite di pacchetti diversi mai in parallelo.
- Se `vitest run -- <pattern>` non filtra (quirk host), usare `corepack pnpm -C apps/web-staff exec vitest run <pattern>`.
- I file toccati NON devono reintrodurre `<option>` nativi dentro componenti ui-kit `Select` (il nuovo slot accetta solo `Option`).
- Fatti reka-ui 2.10.1 verificati sul sorgente (`node_modules/.pnpm/reka-ui@2.10.1_*/node_modules/reka-ui/dist/Select/`):
  - `SelectItem` LANCIA con `value=""` (`SelectItem.js:89`).
  - Il trigger apre su `pointerdown` (click sinistro, `pointerType !== 'touch'`) e chiama `target.hasPointerCapture(event.pointerId)` → in jsdom servono gli stub pointer-capture.
  - L'item seleziona su `pointerup` (`SelectItem.js:119`).
  - A menu chiuso il contenuto è teleportato in un `DocumentFragment`: gli item si registrano comunque in `optionsSet`, quindi `SelectValue` mostra la label selezionata anche da chiuso. Ma gli item NON sono in `document.body` finché il menu è chiuso: nei test bisogna APRIRE prima di cercare `[role="option"]`.

---

### Task 1: ui-kit — `Select` su reka-ui + `Option` + spec riscritti

**Files:**
- Create: `packages/ui-kit/src/components/select-internal.ts`
- Create: `packages/ui-kit/src/components/Option.vue`
- Create: `packages/ui-kit/src/components/Option.spec.ts`
- Rewrite: `packages/ui-kit/src/components/Select.vue`
- Rewrite: `packages/ui-kit/src/components/Select.spec.ts`
- Modify: `packages/ui-kit/src/index.ts` (aggiungere export `Option` accanto a `Select`)

**Interfaces:**
- Consumes: reka-ui 2.10.1; `Icon` di ui-kit (nomi `chevron-down`, `check` nel registry).
- Produces:
  - `Select`: props `{ options?: { value: string; label: string; disabled?: boolean }[]; disabled?: boolean }`, `defineModel<string>()`, slot default per `Option`, `$attrs` (incl. `data-test*`, `class`) inoltrati al trigger. Il trigger è un `<button role="combobox">`.
  - `Option`: props `{ value: string; disabled?: boolean }`, slot default = label. Accetta `value=""`.
  - `SELECT_EMPTY` resta PRIVATO (non esportato da `index.ts`).

- [ ] **Step 1: sentinella condivisa**

`packages/ui-kit/src/components/select-internal.ts`:
```ts
/** Sentinella interna per il valore vuoto: reka-ui vieta SelectItem value="" (SelectItem.js:89),
 *  ma i consumatori usano '' come stato reale («Scegli…», «Tutte»). Select e Option mappano
 *  ''↔sentinella ai due bordi; la sentinella non esce mai da ui-kit. */
export const SELECT_EMPTY = '__uikit-select-empty__';
```

- [ ] **Step 2: riscrivere `Select.spec.ts` (test PRIMA dell'implementazione)**

Sostituire l'intero file con (stub jsdom in testa, come `Popover.spec.ts`):
```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Select from './Select.vue';
import Option from './Option.vue';

// reka-ui Popper misura via ResizeObserver (assente in jsdom); il trigger usa le pointer-capture API.
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

const OPTS = [
  { value: 'a', label: 'Alfa' },
  { value: 'b', label: 'Beta' },
];

async function open(w: ReturnType<typeof mount>) {
  await w.get('[role="combobox"]').trigger('pointerdown', { button: 0, ctrlKey: false, pointerId: 1 });
  await nextTick(); await nextTick();
}

function bodyOptions(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll('[role="option"]'));
}

async function pick(label: string) {
  const el = bodyOptions().find((o) => o.textContent?.trim() === label);
  expect(el, `option «${label}» nel portal`).toBeTruthy();
  el!.dispatchEvent(new Event('pointerup', { bubbles: true }));
  await nextTick(); await nextTick();
}

describe('Select (reka-ui)', () => {
  it('mostra la label del valore selezionato nel trigger, anche a menu chiuso', async () => {
    const w = mount(Select, { props: { options: OPTS, modelValue: 'a' } });
    await nextTick();
    expect(w.get('[role="combobox"]').text()).toContain('Alfa');
  });

  it('apre il menu, elenca le option e aggiorna v-model alla selezione', async () => {
    const w = mount(Select, { props: { options: OPTS, modelValue: 'a' } });
    await open(w);
    expect(bodyOptions().map((o) => o.textContent?.trim())).toEqual(['Alfa', 'Beta']);
    await pick('Beta');
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['b']);
  });

  it('round-trip del valore vuoto: Option value="" selezionabile, modello \'\' e label mostrata', async () => {
    const w = mount(Select, {
      props: { modelValue: 'p1' },
      slots: { default: '<Option value="">Nessun pacchetto</Option><Option value="p1">Standard</Option>' },
      global: { components: { Option } },
    });
    await nextTick();
    expect(w.get('[role="combobox"]').text()).toContain('Standard');
    await open(w);
    await pick('Nessun pacchetto');
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['']);
    await w.setProps({ modelValue: '' });
    await nextTick();
    expect(w.get('[role="combobox"]').text()).toContain('Nessun pacchetto');
  });

  it('emette le classi standard del trigger stilizzato (dichiarazione della resa 5.2)', () => {
    const w = mount(Select, { props: { modelValue: '' } });
    expect(w.get('[role="combobox"]').classes()).toEqual(
      expect.arrayContaining([
        'flex', 'w-full', 'items-center', 'justify-between', 'gap-2', 'text-left',
        'rounded-[var(--radius-md)]', 'border-[1.5px]', 'border-[var(--color-border-input)]',
        'bg-[var(--color-surface)]', 'px-3.5', 'py-3', 'text-[13.5px]', 'text-[var(--color-text)]',
        'outline-none', 'focus:border-[var(--color-brand)]', 'focus:[box-shadow:var(--ring-focus)]',
        'disabled:opacity-50', 'disabled:cursor-not-allowed',
      ]),
    );
  });

  it('inoltra gli attributi al trigger (data-test, class aggiuntive) e rispetta disabled', async () => {
    const w = mount(Select, { props: { options: OPTS, modelValue: 'a', disabled: true }, attrs: { 'data-test': 'season-select', class: 'min-w-[150px]' } });
    const t = w.get('[role="combobox"]');
    expect(t.attributes('data-test')).toBe('season-select');
    expect(t.classes()).toContain('min-w-[150px]');
    expect(t.attributes('disabled')).toBeDefined();
    await t.trigger('pointerdown', { button: 0, ctrlKey: false, pointerId: 1 });
    await nextTick();
    expect(bodyOptions()).toHaveLength(0); // disabled: non apre
  });
});
```

- [ ] **Step 3: eseguire e verificare che FALLISCA**

Run: `corepack pnpm -C apps/web-staff exec vitest run Select.spec`
Expected: FAIL (il Select attuale è un `<select>` nativo: nessun `[role="combobox"]`).

- [ ] **Step 4: `Option.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { SelectItem, SelectItemText, SelectItemIndicator } from 'reka-ui';
import Icon from './Icon.vue';
import { SELECT_EMPTY } from './select-internal';

const props = withDefaults(defineProps<{ value: string; disabled?: boolean }>(), { disabled: false });
// reka-ui vieta value="": la mappatura alla sentinella resta interna a ui-kit (vedi select-internal.ts).
const mapped = computed(() => (props.value === '' ? SELECT_EMPTY : props.value));
</script>
<template>
  <SelectItem
    :value="mapped"
    :disabled="disabled"
    class="relative flex cursor-default select-none items-center gap-2 rounded-[9px] px-2.5 py-2 text-[13.5px] text-[var(--color-text)] outline-none data-[highlighted]:bg-[var(--color-warm-050)] data-[disabled]:opacity-50"
  >
    <SelectItemText><slot /></SelectItemText>
    <SelectItemIndicator class="ml-auto flex-none"><Icon name="check" :size="14" class="text-[var(--color-brand)]" /></SelectItemIndicator>
  </SelectItem>
</template>
```

- [ ] **Step 5: `Select.vue` riscritto**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { SelectRoot, SelectTrigger, SelectValue, SelectPortal, SelectContent, SelectViewport } from 'reka-ui';
import Icon from './Icon.vue';
import Option from './Option.vue';
import { SELECT_EMPTY } from './select-internal';

defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{
  options?: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean;
}>(), { options: () => [], disabled: false });
const model = defineModel<string>();
// Il modello dei consumatori usa '' come stato reale; dentro reka-ui viaggia la sentinella.
const inner = computed({
  get: () => (model.value === '' ? SELECT_EMPTY : model.value),
  set: (v) => { model.value = v === SELECT_EMPTY ? '' : (v as string | undefined); },
});
</script>
<template>
  <SelectRoot v-model="inner" :disabled="disabled">
    <SelectTrigger
      v-bind="$attrs"
      class="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-left text-[13.5px] text-[var(--color-text)] outline-none focus:border-[var(--color-brand)] focus:[box-shadow:var(--ring-focus)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <SelectValue class="truncate" />
      <Icon name="chevron-down" :size="16" class="flex-none text-[var(--color-text-muted)]" />
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper" :side-offset="6"
        class="z-[90] max-h-[min(340px,var(--reka-select-content-available-height))] w-[var(--reka-select-trigger-width)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] [box-shadow:var(--shadow-drawer)] data-[state=open]:[animation:overlay-in_var(--motion-fast)_var(--ease-standard)]"
      >
        <SelectViewport class="p-1">
          <slot>
            <Option v-for="o in options" :key="o.value" :value="o.value" :disabled="o.disabled">{{ o.label }}</Option>
          </slot>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
```
Note: `z-[90]` sta sopra i Modal (`z-[80]`, Modal.vue:10-11); ombra e animazione come Popover.vue:15.

- [ ] **Step 6: `Option.spec.ts`**

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Select from './Select.vue';
import Option from './Option.vue';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('Option', () => {
  it('option disabled non selezionabile e marcata data-disabled', async () => {
    const w = mount(Select, {
      props: { modelValue: 'x' },
      slots: { default: '<Option value="x">Attiva</Option><Option value="y" disabled>Spenta</Option>' },
      global: { components: { Option } },
    });
    await w.get('[role="combobox"]').trigger('pointerdown', { button: 0, ctrlKey: false, pointerId: 1 });
    await nextTick(); await nextTick();
    const spenta = Array.from(document.body.querySelectorAll('[role="option"]')).find((o) => o.textContent?.includes('Spenta'))!;
    expect(spenta.hasAttribute('data-disabled')).toBe(true);
    spenta.dispatchEvent(new Event('pointerup', { bubbles: true }));
    await nextTick(); await nextTick();
    expect(w.emitted('update:modelValue')).toBeUndefined();
  });

  it("l'item selezionato mostra l'indicatore check", async () => {
    const w = mount(Select, {
      props: { modelValue: 'x' },
      slots: { default: '<Option value="x">Attiva</Option>' },
      global: { components: { Option } },
    });
    await w.get('[role="combobox"]').trigger('pointerdown', { button: 0, ctrlKey: false, pointerId: 1 });
    await nextTick(); await nextTick();
    const item = document.body.querySelector('[role="option"]')!;
    expect(item.getAttribute('data-state')).toBe('checked');
    expect(item.querySelector('svg')).toBeTruthy();
  });
});
```

- [ ] **Step 7: export in `packages/ui-kit/src/index.ts`**

Trovare la riga che esporta `Select` e aggiungere accanto, stesso stile:
```ts
export { default as Option } from './components/Option.vue';
```

- [ ] **Step 8: eseguire i due spec ui-kit**

Run: `corepack pnpm -C apps/web-staff exec vitest run Select.spec Option.spec`
Expected: PASS. Se `pick`/apertura non funziona, il debug parte dai sorgenti reka in
`node_modules/.pnpm/reka-ui@2.10.1_*/node_modules/reka-ui/dist/Select/` (eventi documentati nelle
Global Constraints), NON da tentativi ciechi: aggiornare la ricetta nei test e (Task 2) nell'helper.

- [ ] **Step 9: suite completa** — `corepack pnpm -C apps/web-staff test`
Expected: i soli rossi ammessi sono gli spec delle viste che usano Select (verranno migrati nei task
3-9). ANNOTARE l'elenco esatto dei file rossi nel report del task: è l'inventario di migrazione dei
test. `motion.spec.ts` DEVE restare verde (theme.css non si tocca).

- [ ] **Step 10: commit**
```bash
git add packages/ui-kit docs/superpowers/plans/2026-07-23-select-reka-ui.md
git commit -m "feat(ui-kit): 5.2 Select su reka-ui con Option dedicata e sentinella per valore vuoto"
```

---

### Task 2: helper di test condiviso `selectOption` + stub jsdom globali

**Files:**
- Modify: `apps/web-staff/src/test/setup.ts`
- Modify: `apps/web-staff/src/test/utils.ts`
- Create: `apps/web-staff/src/test/selectOption.spec.ts`

**Interfaces:**
- Consumes: `Select`/`Option` da `@coralyn/ui-kit` (Task 1).
- Produces: `selectOption(trigger: DOMWrapper<Element> | Element, optionLabel: string): Promise<void>` e
  `findTrigger(w: VueWrapper, selector: string)` esportati da `@/test/utils`. I task 3-9 li importano.

- [ ] **Step 1: stub jsdom in `setup.ts`** (aggiungere in coda al file, con commento):
```ts
// reka-ui (Select/Popover): jsdom non implementa ResizeObserver né le pointer-capture API.
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};
```

- [ ] **Step 2: helper in `utils.ts`** (in coda, dopo `mountApp`):
```ts
/** Apre un Select di ui-kit (trigger [role=combobox]) e seleziona l'option con la label data.
 *  Il menu è portalato: le option vivono in document.body SOLO a menu aperto.
 *  Selezione su pointerup: è l'evento che reka-ui ascolta (SelectItem.js:119). */
export async function selectOption(trigger: { element: Element } | Element, optionLabel: string): Promise<void> {
  const el = (trigger instanceof Element ? trigger : trigger.element) as HTMLElement;
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
  await nextTick(); await nextTick();
  const options = Array.from(document.body.querySelectorAll('[role="option"]'));
  const target = options.find((o) => o.textContent?.trim() === optionLabel.trim());
  if (!target) throw new Error(`selectOption: option «${optionLabel}» non trovata. Presenti: ${options.map((o) => o.textContent?.trim()).join(' | ')}`);
  target.dispatchEvent(new Event('pointerup', { bubbles: true }));
  await nextTick(); await nextTick();
  await flushPromises();
}
```
Aggiungere gli import mancanti in testa a `utils.ts`: `import { nextTick } from 'vue';` e
`import { flushPromises } from '@vue/test-utils';` (verificare cosa è già importato).
NB jsdom non ha `PointerEvent`: se il dispatch lancia, aggiungere in `setup.ts`
`globalThis.PointerEvent ??= MouseEvent as unknown as typeof PointerEvent;` e usare
`new PointerEvent(...)` come sopra (MouseEvent accetta `button`; `pointerId` diventa undefined e
`hasPointerCapture` stubbato lo tollera).

- [ ] **Step 3: smoke test dell'helper** — `apps/web-staff/src/test/selectOption.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { defineComponent, ref } from 'vue';
import { Select, Option } from '@coralyn/ui-kit';
import { mountApp, selectOption } from './utils';

const Host = defineComponent({
  components: { Select, Option },
  setup() { const v = ref(''); return { v }; },
  template: `<Select v-model="v" data-test="host-select">
    <Option value="">Nessuno</Option><Option value="p1">Primo</Option>
  </Select><p data-test="out">{{ v }}</p>`,
});

describe('selectOption helper', () => {
  it('seleziona per label e aggiorna il modello, round-trip del vuoto compreso', async () => {
    const w = mountApp(Host);
    await selectOption(w.get('[data-test="host-select"]'), 'Primo');
    expect(w.get('[data-test="out"]').text()).toBe('p1');
    await selectOption(w.get('[data-test="host-select"]'), 'Nessuno');
    expect(w.get('[data-test="out"]').text()).toBe('');
  });
});
```

- [ ] **Step 4: run** — `corepack pnpm -C apps/web-staff exec vitest run selectOption.spec`
Expected: PASS.

- [ ] **Step 5: suite completa** — `corepack pnpm -C apps/web-staff test` (stessi rossi noti del Task 1, nessun rosso NUOVO).

- [ ] **Step 6: commit** — `git add apps/web-staff/src/test && git commit -m "test(web-staff): helper selectOption e stub jsdom per il Select reka-ui"`

---

### Tasks 3-9: migrazione consumatori (ricetta comune + inventario per task)

**Ricetta di migrazione della VISTA (identica per tutti i task, esempio reale da RenewalsView):**

Prima:
```html
<Select v-model="destinationSeasonId" data-test="destination-season" class="min-w-[170px]">
  <option value="">Scegli…</option>
  <option v-for="o in seasonOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
</Select>
```
Dopo (import: aggiungere `Option` all'import `@coralyn/ui-kit` del file):
```html
<Select v-model="destinationSeasonId" data-test="destination-season" class="min-w-[170px]">
  <Option value="">Scegli…</Option>
  <Option v-for="o in seasonOptions" :key="o.value" :value="o.value">{{ o.label }}</Option>
</Select>
```
Regole: si toccano SOLO i tag `<option>`→`<Option>` (attributi identici); `v-model`, `data-test*`,
`class`, `:disabled` restano; nessun cambio di logica di script oltre all'import.

**Ricetta di migrazione dello SPEC (esempio reale, `setDestination` di RenewalsView.spec.ts):**

Prima:
```ts
const sel = w.get('[data-test="destination-season"]').element as HTMLSelectElement;
sel.value = seasonId;
sel.dispatchEvent(new Event('change'));
await flushPromises(); await tick(); await flushPromises();
```
Dopo (import `selectOption` da `@/test/utils`; il valore diventa la LABEL visibile — per le stagioni
del seed MSW: `se-1` → `Estate 2026`, `se-2` → `Estate 2027`, verificare in `mocks/server.ts`):
```ts
await selectOption(w.get('[data-test="destination-season"]'), seasonLabel);
await flushPromises(); await tick(); await flushPromises();
```
Dove lo spec LEGGE il valore (`expect(sel.value).toBe('x')`), si legge invece il testo del trigger:
`expect(w.get('[data-test="…"]').text()).toContain('Label attesa')`.
Dove lo spec conta i `select` nativi (`querySelectorAll('select')[n]`), si aggiunge un
`data-test` al Select nella vista (parte della migrazione, nominato nel task) e si usa quello.

**Ogni task 3-9 esegue questi step:**
1. Migrare le viste del task (ricetta sopra, inventario sotto).
2. Migrare gli spec del task (ricetta sopra).
3. Run mirato degli spec toccati (`corepack pnpm -C apps/web-staff exec vitest run <nomi>`), PASS.
4. Suite completa `corepack pnpm -C apps/web-staff test`: i rossi residui possono essere SOLO quelli
   dell'inventario non ancora migrato (Task 1 Step 9); nessun rosso nuovo.
5. Commit con messaggio indicato.

### Task 3: Rinnovi

**Files:** Modify `apps/web-staff/src/features/renewals/RenewalsView.vue` (righe ~90, ~96: 2 Select,
option statica «Scegli…» + `v-for`), Modify `apps/web-staff/src/features/renewals/RenewalsView.spec.ts`
(helper `setDestination` riga ~39 e ogni lettura/scrittura di select).
Commit: `refactor(web-staff): 5.2 Rinnovi sul nuovo Select`

### Task 4: Listino (Pricing)

**Files:** Modify `apps/web-staff/src/features/pricing/PricingView.vue` (6 Select: `activeSeasonId`
data-test="season-select" ~400; equip-row ~585 — Select multiriga dentro `data-test="equip-row-N"`;
form tariffa ~658-684: `rType`/`rSector`/`rPackage`/`rSlot` — AGGIUNGERE `data-test="rate-type"`,
`"rate-sector"`, `"rate-package"`, `"rate-slot"`), Modify `PricingView.spec.ts` (righe ~51-79
equip-row: sostituire `querySelector('[data-test="equip-row-0"] select')` con
`w.get('[data-test="equip-row-0"] [role="combobox"]')` + `selectOption`; righe ~172, ~192, ~285:
`form.querySelectorAll('select')[2]` → `[data-test="rate-package"]` + `selectOption`).
Commit: `refactor(web-staff): 5.2 Listino sul nuovo Select`

### Task 5: Mappa

**Files:** Modify `apps/web-staff/src/features/map/MapView.vue` (3 Select nel modale prenotazione,
righe ~495-522: `bookingType`/`customerId`/`packageId` — AGGIUNGERE `data-test="booking-type"`,
`"booking-customer"`, `"booking-package"`), Modify `MapView.spec.ts` (righe ~208, ~223, ~344, ~481,
~513, ~651: i lookup `HTMLSelectElement`/`querySelectorAll('select')` diventano lookup del trigger
per data-test — il modale è portalato: cercare in `document.body` con
`document.body.querySelector('[data-test="booking-type"]')` e passarlo a `selectOption`).
Commit: `refactor(web-staff): 5.2 Mappa sul nuovo Select`

### Task 6: Noleggi

**Files:** Modify `apps/web-staff/src/features/rentals/RentalsView.vue` (3 Select ~170-185, data-test
già presenti), Modify `apps/web-staff/src/features/rentals/RentalCatalogView.vue` (1 Select ~259),
Modify `RentalsView.spec.ts` (riga ~22: l'helper locale `setSelect` che usa `HTMLSelectElement` va
sostituito con `selectOption` sui trigger; le label vengono dal seed rentals in `mocks/server.ts`),
Modify `RentalCatalogView.spec.ts` se interagisce col select stagione.
Commit: `refactor(web-staff): 5.2 Noleggi e Listino noleggi sul nuovo Select`

### Task 7: Stabilimento + Onboarding

**Files:** Modify `apps/web-staff/src/features/establishment/EstablishmentView.vue` (1 Select
`newRole`, data-testid="new-user-role", ~236), Modify
`apps/web-staff/src/features/onboarding/steps/StepStructure.vue` (3 Select ~71-96),
`StepRates.vue` (1 Select ~58); Modify gli spec che li esercitano: `EstablishmentView.spec.ts` (se
tocca il select ruolo), `StepStructure.spec.ts`, `StepRates.spec.ts` (i file esistono sotto
`features/onboarding/`: verificarli con glob prima di iniziare).
Commit: `refactor(web-staff): 5.2 Stabilimento e onboarding sul nuovo Select`

### Task 8: Cantiere (editor struttura)

**Files:** Modify (1-2 Select ciascuno, data-testid già presenti):
`apps/web-staff/src/features/establishment/UmbrellaGeneratorForm.vue`,
`panels/BeachPanel.vue` (2: `type-icon`, `retired-restore-row`), `panels/MultiPanel.vue`,
`panels/SectorCreatePanel.vue`, `panels/SectorPanel.vue`, `panels/UmbrellaCreatePanel.vue`,
`panels/UmbrellaPanel.vue`, `panels/RowCreatePanel.vue`; Modify
`panels/form-sync.spec.ts` (righe ~30, ~54: `(w.find('[data-testid="umbrella-type"]').element as
HTMLSelectElement).value` → `expect(w.get('[data-testid="umbrella-type"]').text()).toContain(<label
della tipologia typ-1 dal fixture>)`), `EstablishmentStructureView.spec.ts` e ogni altro spec del
Cantiere che tocca i select (grep `HTMLSelectElement` sotto `features/establishment/` per l'elenco
completo prima di iniziare).
Commit: `refactor(web-staff): 5.2 Cantiere sul nuovo Select`

### Task 9: i tre `<select>` nativi fuori ui-kit → Select

Nota di scoping (emersa durante il Task 6): l'audit `grep '<select' apps/web-staff/src` ha trovato
**tre** select nativi con `inputClass`, non uno solo. L'inventario della spec §4 citava solo
`TransferSubscriptionModal`; gli altri due (i selettori del metodo di incasso) erano sfuggiti. Il
gate di completezza del Task 10 pretende zero select nativi, quindi vanno migrati tutti e tre — è lo
stesso identico pattern (native `<select>` con `inputClass` → `Select`+`Option` di ui-kit).

**Files:**
- Modify `apps/web-staff/src/features/customers/TransferSubscriptionModal.vue` (riga ~87:
  `<select v-model="newCustomerId" data-testid="transfer-new-customer" :class="inputClass">` con
  `<option>` → `Select`+`Option`; rimuovere `inputClass` se resta inutilizzata), Modify
  `TransferSubscriptionModal.spec.ts` (righe ~46-95: 4 lookup `select[data-testid=…]` → trigger
  `[data-testid="transfer-new-customer"]` in `document.body` — Modal portalato — + `selectOption`).
- Modify `apps/web-staff/src/features/bookings/SettlePaymentModal.vue` (riga ~85:
  `<select v-model="method" :class="inputClass">` con le option metodo incasso → `Select`+`Option`;
  AGGIUNGERE `data-test="settle-method"` per de-posizionalizzare lo spec). Migrare
  `SettlePaymentModal.spec.ts` se interagisce col select (grep prima; il modale è portalato →
  `document.body` + `selectOption`; le label dei metodi vengono da `PAYMENT_METHOD_LABEL` in
  `@/lib/statusMaps` — leggere le label reali).
- Modify `apps/web-staff/src/features/rentals/SettleRentalPaymentModal.vue` (riga ~86: idem, gemello
  del precedente; `data-test="settle-method"` locale al suo modale) e il relativo spec se tocca il
  select.
Questi erano incoerenze pre-esistenti (select nativi con classi locali). `inputClass` va rimossa da
ciascun file se non resta usata da altri campi.
Commit: `refactor(web-staff): 5.2 i tre select nativi dei modali al Select ui-kit`

---

### Task 10: chiusura — design system, verifica di completezza, suite finali

**Files:** Modify `docs/design/design-system.md` (§10 componenti: voce Select aggiornata — composto
reka-ui, Option, menu popper, sentinella valore vuoto), Modify `docs/architecture/deferred.md` SOLO
se durante la migrazione emergono rinvii consapevoli (altrimenti non toccarlo).

- [ ] **Step 1: completezza** — questi grep devono dare zero risultati nei sorgenti (spec esclusi):
```bash
grep -rn "<option" apps/web-staff/src --include=*.vue
grep -rn "<select" apps/web-staff/src --include=*.vue
grep -rn "HTMLSelectElement" apps/web-staff/src
```
(nessun `<select>`/`<option>` nativo residuo: i tre modali del Task 9 inclusi).
- [ ] **Step 2: design-system.md** §10 aggiornata (2-4 frasi, stile delle voci esistenti).
- [ ] **Step 3: suite complete, una alla volta** — `corepack pnpm -C apps/web-staff test` (TUTTO
verde, nessun rosso residuo), poi `corepack pnpm -r typecheck` (exit 0). Le app web-platform e
web-customer non consumano Select (verificato in spec §5): non serve rieseguirle, il typecheck -r le
copre.
- [ ] **Step 4: commit** — `git add -A && git commit -m "docs(design): 5.2 Select composto nel design system"`

Dopo il Task 10: review finale whole-branch su modello top (fuori da questo piano, la orchestra la
sessione madre), fix-loop con re-review, poi gate visivo dell'utente (login necessario).
