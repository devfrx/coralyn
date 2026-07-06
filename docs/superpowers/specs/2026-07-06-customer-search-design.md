# Spec — Ricerca clienti (componente `SearchInput` riutilizzabile)

> Design **CONFERMATO** con l'utente (2026-07-06, filone "rendile vere" §3.2). Slice **FE-only**. Decisioni: filtro su
> **nome + telefono** (coerente col placeholder); **empty-state** su nessun risultato + **contatore filtrato**; la ricerca è
> un **componente modulare riutilizzabile** (`SearchInput`) nello ui-kit.

---

## 1. Contesto e problema

In [CustomersView.vue:29-31](../../../apps/web-staff/src/features/customers/CustomersView.vue) la "barra di ricerca" è un
`<div>` **finto** (placeholder statico "Cerca per nome o telefono…", nessun input). Il contatore a destra
([:34](../../../apps/web-staff/src/features/customers/CustomersView.vue)) mostra `customers.length`. I clienti sono già
caricati client-side via `useCustomers` → il filtro è **FE puro**, nessun backend.

## 2. Decisioni (CONFERMATE)

1. **Componente riutilizzabile `SearchInput`** nello **ui-kit** (dove vivono `Input`/`Field`/…): presentazionale (icona
   lente + `<input>` + pulsante "×" per azzerare), `v-model` stringa, prop `placeholder`/`ariaLabel`. Nessuna logica di
   dominio dentro: il **filtro resta nella view** (dipende dai campi del cliente).
2. **Filtro su nome + telefono**, case-insensitive, substring, `trim` (coerente col placeholder). Nessun debounce (lista
   piccola, YAGNI).
3. **Empty-state** riusando `EmptyState` dello ui-kit ("Nessun cliente trovato") quando il filtro non dà risultati;
   **contatore** allineato ai **risultati filtrati** (`filtered.length`).

## 3. Componenti e file

- **Nuovo** `packages/ui-kit/src/components/SearchInput.vue` (+ export in `packages/ui-kit/src/index.ts`):
  - `v-model` stringa (`defineModel<string>({ default: '' })`); props `placeholder?: string` (default `'Cerca…'`),
    `ariaLabel?: string` (default `'Cerca'`).
  - Root `<div>` stile allineato alla barra attuale (`flex items-center gap-2 rounded-[10px] border … bg-surface px-3.5 py-2.5`),
    con `focus-within` ring; `<Icon name="search">`; `<input type="text">` trasparente; pulsante `×` (`Icon name="x"`,
    `aria-label="Cancella ricerca"`) **visibile solo con testo** che azzera il model. La `class` del consumer ricade sul root
    (single-root fallthrough) → il consumer imposta la larghezza (`w-[300px]`).
- **Modifica** `apps/web-staff/src/features/customers/CustomersView.vue`:
  - `const search = ref('')`; `const filtered = computed(...)` (nome+cognome concatenati o telefono che includono la query
    normalizzata; se query vuota → lista intera).
  - Sostituire il `<div>` finto con `<SearchInput v-model="search" class="w-[300px]" placeholder="Cerca per nome o telefono…" aria-label="Cerca clienti" />`.
  - Contatore → `{{ filtered.length }} clienti`. Tabella itera `filtered`. `EmptyState` "Nessun cliente trovato" quando
    `!isLoading && filtered.length === 0`.

## 4. Test

- **Nuovo** `packages/ui-kit/src/components/SearchInput.spec.ts` (conta in **ui-kit** E in **web-staff**, vedi §6):
  - riflette `modelValue` ed emette `update:modelValue` digitando;
  - il pulsante "×" appare solo con testo e azzera (`update:modelValue` = `''`);
  - usa `placeholder`/`ariaLabel` forniti.
- **Aggiornare** `apps/web-staff/src/features/customers/CustomersView.spec.ts` (aggiungere):
  - digitando "Rossi" la tabella mostra Rossi e **nasconde** Bianchi/Verdi;
  - digitando un frammento di telefono (es. "333 2222") filtra su Luca Bianchi;
  - query senza match (es. "zzz") → **EmptyState** "Nessun cliente trovato" + contatore "0 clienti".
  - Seed (da `test/setup.ts`, reset in `beforeEach`): c-1 Mario Rossi · c-2 Luca Bianchi · c-3 Anna Verdi.

## 5. Fuori scope
- Nessun backend, nessuna ricerca server-side/paginazione (lista piccola). Nessun debounce. Nessuna modifica alla modale di
  creazione. `SearchInput` non incapsula logica di filtro (solo UI).

## 6. Conteggio test (gotcha)
`apps/web-staff/vitest.config.ts` **include** anche `../../packages/ui-kit/src/**/*.spec.ts` → `SearchInput.spec.ts` conta in
**entrambe** le suite. Baseline: **ui-kit 70**, **web-staff 246**. Additivo atteso: ui-kit **70→73** (SearchInput 3);
web-staff **246→252** (SearchInput 3 via glob + CustomersView 3). Verificare **entrambe** le suite + typecheck.

## 7. Baseline
ui-kit **70** · web-staff **246** · typecheck pulito (post slice Modifica cliente, su `main`).
