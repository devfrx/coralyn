# Ricerca clienti (`SearchInput` riutilizzabile) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rendere reale la ricerca clienti: un componente `SearchInput` riutilizzabile nello ui-kit + filtro client-side per nome/telefono in `CustomersView`, con empty-state e contatore allineati ai risultati.

**Architecture:** Slice **FE-only**. `SearchInput.vue` (ui-kit) è **presentazionale** (icona + input + clear), `v-model` stringa; la **logica di filtro** resta in `CustomersView` (dipende dai campi del cliente). Empty-state riusa `EmptyState` dello ui-kit.

**Tech Stack:** Vue 3 `<script setup>` (`defineModel`), `@coralyn/ui-kit`, Vitest, `@vue/test-utils`, msw.

## Global Constraints

- **Package manager:** `corepack pnpm` — MAI `npm`. Se pnpm chiede di purgare `node_modules` senza TTY → `CI=true corepack pnpm install`.
- **Comandi:**
  - ui-kit test: `corepack pnpm --filter @coralyn/ui-kit test`
  - ui-kit typecheck: `corepack pnpm --filter @coralyn/ui-kit typecheck`
  - web-staff test: `corepack pnpm --filter web-staff test` (globba anche gli spec ui-kit)
  - web-staff typecheck: `corepack pnpm --filter web-staff typecheck`
  - singolo file web-staff: `corepack pnpm --filter web-staff test -- <path>`
- **Gotcha conteggio:** `apps/web-staff/vitest.config.ts` include `../../packages/ui-kit/src/**/*.spec.ts` → `SearchInput.spec.ts` conta in ENTRAMBE le suite. Baseline: **ui-kit 70**, **web-staff 246**. Atteso: ui-kit **73**, web-staff **252**. **Verificare entrambe.**
- **Convenzioni ui-kit:** `defineModel`, Tailwind con CSS vars (nessun hex), spec con `mount` da `@vue/test-utils` (vedi `Input.spec.ts`). Icone: `Icon` interno (`./Icon.vue`); chiavi `search`/`x` esistono nel registry.
- **Branch:** `customer-search` (creato). Nessun push senza ok esplicito.

---

### Task 1: `SearchInput.vue` (ui-kit) + export + test

**Files:**
- Create: `packages/ui-kit/src/components/SearchInput.vue`
- Modify: `packages/ui-kit/src/index.ts` (aggiunge l'export)
- Test: `packages/ui-kit/src/components/SearchInput.spec.ts`

**Interfaces:**
- Consumes: `Icon` (`./Icon.vue`).
- Produces: componente `SearchInput`, esportato da `@coralyn/ui-kit`. `v-model` stringa; props `placeholder?: string` (default `'Cerca…'`), `ariaLabel?: string` (default `'Cerca'`). Rende un `<input type="text">`; pulsante `[aria-label="Cancella ricerca"]` visibile solo con testo, azzera il model. La `class` del consumer ricade sul root `<div>`.

- [ ] **Step 1: Scrivere il test che fallisce**

Create `packages/ui-kit/src/components/SearchInput.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SearchInput from './SearchInput.vue';

describe('SearchInput', () => {
  it('riflette il modelValue ed emette update:modelValue digitando', async () => {
    const w = mount(SearchInput, { props: { modelValue: 'ab' } });
    expect(w.find('input').element.value).toBe('ab');
    await w.find('input').setValue('abc');
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['abc']);
  });

  it('mostra il pulsante di pulizia solo con testo e lo azzera', async () => {
    const w = mount(SearchInput, { props: { modelValue: '' } });
    expect(w.find('[aria-label="Cancella ricerca"]').exists()).toBe(false);
    await w.setProps({ modelValue: 'x' });
    expect(w.find('[aria-label="Cancella ricerca"]').exists()).toBe(true);
    await w.find('[aria-label="Cancella ricerca"]').trigger('click');
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['']);
  });

  it('usa placeholder e aria-label forniti', () => {
    const w = mount(SearchInput, { props: { modelValue: '', placeholder: 'Cerca per nome o telefono…', ariaLabel: 'Cerca clienti' } });
    const input = w.find('input');
    expect(input.attributes('placeholder')).toBe('Cerca per nome o telefono…');
    expect(input.attributes('aria-label')).toBe('Cerca clienti');
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che FALLISCA**

Run: `corepack pnpm --filter @coralyn/ui-kit test`
Expected: FAIL — `Failed to resolve import "./SearchInput.vue"`.

- [ ] **Step 3: Implementare il componente**

Create `packages/ui-kit/src/components/SearchInput.vue`:

```vue
<script setup lang="ts">
import Icon from './Icon.vue';
withDefaults(defineProps<{ placeholder?: string; ariaLabel?: string }>(), {
  placeholder: 'Cerca…',
  ariaLabel: 'Cerca',
});
const model = defineModel<string>({ default: '' });
</script>
<template>
  <div class="flex items-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 focus-within:border-[var(--color-brand)] focus-within:[box-shadow:var(--ring-focus)]">
    <Icon name="search" :size="16" class="shrink-0 text-[var(--color-placeholder)]" />
    <input
      v-model="model"
      type="text"
      :aria-label="ariaLabel"
      :placeholder="placeholder"
      class="w-full min-w-0 bg-transparent text-[13px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-placeholder)]"
    />
    <button
      v-if="model"
      type="button"
      aria-label="Cancella ricerca"
      class="grid size-5 shrink-0 place-items-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-raised)]"
      @click="model = ''"
    ><Icon name="x" :size="14" /></button>
  </div>
</template>
```

- [ ] **Step 4: Aggiungere l'export**

In `packages/ui-kit/src/index.ts`, aggiungere accanto agli altri componenti (es. dopo la riga `Input`):

```ts
export { default as SearchInput } from './components/SearchInput.vue';
```

- [ ] **Step 5: Eseguire i test e verificare che PASSINO**

Run: `corepack pnpm --filter @coralyn/ui-kit test`
Expected: PASS — ui-kit **73** (70 + 3).

- [ ] **Step 6: Typecheck ui-kit**

Run: `corepack pnpm --filter @coralyn/ui-kit typecheck`
Expected: EXIT 0.

- [ ] **Step 7: Commit**

```bash
git add packages/ui-kit/src/components/SearchInput.vue packages/ui-kit/src/components/SearchInput.spec.ts packages/ui-kit/src/index.ts
git commit -m "feat(ui-kit): SearchInput — campo di ricerca riutilizzabile (icona + input + clear)"
```

---

### Task 2: `CustomersView` — ricerca reale (filtro + empty-state + contatore)

**Files:**
- Modify: `apps/web-staff/src/features/customers/CustomersView.vue`
- Test: `apps/web-staff/src/features/customers/CustomersView.spec.ts`

**Interfaces:**
- Consumes: `SearchInput`, `EmptyState` da `@coralyn/ui-kit` (Task 1 per SearchInput).
- Produces: filtro client-side su nome+telefono; tabella su `filtered`; contatore `filtered.length`; empty-state su 0 risultati.

- [ ] **Step 1: Scrivere i test che falliscono**

In `apps/web-staff/src/features/customers/CustomersView.spec.ts`, aggiungere dentro il `describe('CustomersView', ...)`:

```ts
  it('filtra per nome: "Rossi" mostra Rossi e nasconde Bianchi/Verdi', async () => {
    const w = mountApp(CustomersView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await w.find('input[aria-label="Cerca clienti"]').setValue('Rossi');
    expect(w.text()).toContain('Rossi');
    expect(w.text()).not.toContain('Bianchi');
    expect(w.text()).not.toContain('Verdi');
  });

  it('filtra per telefono: un frammento del numero seleziona Bianchi', async () => {
    const w = mountApp(CustomersView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await w.find('input[aria-label="Cerca clienti"]').setValue('333 2222');
    expect(w.text()).toContain('Bianchi');
    expect(w.text()).not.toContain('Rossi');
  });

  it('nessun risultato: mostra empty-state e contatore a 0', async () => {
    const w = mountApp(CustomersView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await w.find('input[aria-label="Cerca clienti"]').setValue('zzz');
    expect(w.text()).toContain('Nessun cliente trovato');
    expect(w.text()).toContain('0 clienti');
  });
```

- [ ] **Step 2: Eseguire il test e verificare che FALLISCA**

Run: `corepack pnpm --filter web-staff test -- src/features/customers/CustomersView.spec.ts`
Expected: FAIL — non esiste `input[aria-label="Cerca clienti"]` (la barra è un `<div>` finto); nessun empty-state.

- [ ] **Step 3: Modificare `CustomersView.vue`**

**Script (`<script setup>`):**
- Aggiungere `computed` all'import di vue: `import { ref, computed } from 'vue';`
- Aggiungere `SearchInput, EmptyState` all'import da `@coralyn/ui-kit` (accanto a `Button, Avatar, DataTable, Modal, Field, Input, Textarea, Icon, PageToolbar`).
- Aggiungere lo stato ricerca + filtro (dopo `const create = useCreateCustomer();`):

```ts
const search = ref('');
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  const list = customers.value ?? [];
  if (!q) return list;
  return list.filter(
    (c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q),
  );
});
```

**Template:**
- Sostituire il `<div>` finto della ricerca (il blocco dentro `<template #left>`):

```vue
      <template #left>
        <SearchInput v-model="search" class="w-[300px]" placeholder="Cerca per nome o telefono…" aria-label="Cerca clienti" />
      </template>
```

- Contatore (dentro `<template #right>`): `{{ customers?.length ?? 0 }} clienti` → `{{ filtered.length }} clienti`.
- Sostituire il ramo tabella per gestire l'empty-state. Attuale:

```vue
    <p v-if="isLoading" class="text-[var(--color-text-muted)]">Caricamento…</p>
    <DataTable v-else :columns="cols">
      <tr v-for="c in customers" :key="c.id" ...>
```

diventa:

```vue
    <p v-if="isLoading" class="text-[var(--color-text-muted)]">Caricamento…</p>
    <EmptyState v-else-if="filtered.length === 0" message="Nessun cliente trovato" class="mt-4" />
    <DataTable v-else :columns="cols">
      <tr v-for="c in filtered" :key="c.id" ...>
```

(Il resto della riga `<tr>` — celle Avatar/RouterLink/telefono/email/note — resta identico, solo la sorgente del `v-for` passa da `customers` a `filtered`.)

- [ ] **Step 4: Eseguire i test del file e verificare che PASSINO**

Run: `corepack pnpm --filter web-staff test -- src/features/customers/CustomersView.spec.ts`
Expected: PASS (i 3 nuovi + i 3 preesistenti: "mostra i clienti", "crea un cliente dal modal", "ogni riga linka").

- [ ] **Step 5: Suite complete + typecheck (no regressioni)**

Run: `corepack pnpm --filter web-staff test`
Expected: **252** (246 + 3 SearchInput via glob + 3 CustomersView).

Run: `corepack pnpm --filter @coralyn/ui-kit test`
Expected: **73** (invariato rispetto a Task 1).

Run: `corepack pnpm --filter web-staff typecheck`
Expected: EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/customers/CustomersView.vue apps/web-staff/src/features/customers/CustomersView.spec.ts
git commit -m "feat(web-staff): ricerca clienti reale (SearchInput) con filtro nome/telefono, empty-state e contatore filtrato"
```

---

## Verifica finale (dopo Task 2)

- [ ] ui-kit **73** verdi; web-staff **252** verdi; typecheck web-staff + ui-kit EXIT 0.
- [ ] Ricerca reale funzionante: filtro nome+telefono, "×" azzera, empty-state su 0 match, contatore allineato.
- [ ] Review whole-branch (opus) prima del merge FF su `main` (ok esplicito).

## Note di scope
- `SearchInput` è presentazionale (nessuna logica di filtro dentro). Nessun backend, nessun debounce, nessuna paginazione. Modale di creazione non toccata.
