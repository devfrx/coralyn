# Frontend — Astrazione delle viste in componenti riutilizzabili — Design Spec

- **Data:** 2026-07-01
- **Stato:** Approvato (design). **Esecuzione delegata alla sessione successiva** (vedi handoff
  [2026-07-01-frontend-abstraction-delegation.md](../handoff/2026-07-01-frontend-abstraction-delegation.md)).
- **ADR di riferimento:** introduce [ADR-0033](../architecture/decisions/0033-astrazione-componenti-frontend.md)
  (astrazione componenti + fedeltà ai mock). Riafferma [ADR-0017](../architecture/decisions/0017-design-system-frontend.md),
  [ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md)/[ADR-0027](../architecture/decisions/0027-coralyn-linguaggio-visivo.md),
  [ADR-0030](../architecture/decisions/0030-codice-e-db-in-inglese.md).
- **Convenzione:** codice/DB inglese; UI/doc italiano. **Prossimo ADR libero: 0034.**

---

## 1. Obiettivo e vincoli

Ridurre la duplicazione tra le viste `web-staff` estraendo componenti/utility/composable
riutilizzabili, **senza cambiare la resa visiva** (le viste — incluse quelle ancora *mock* —
devono restare **pixel-identiche** e continuare a seguire i mock `docs/design/mockups/*.html`
anche in futuro, [ADR-0033](../architecture/decisions/0033-astrazione-componenti-frontend.md)).

- **Scope: massimale** — include `DataTable` *data-driven* e una factory per i composable
  server-state, oltre alle primitive.
- **Vincolo ferreo — zero regressione visiva:** ogni estrazione è **strutturale**; il
  componente emette **le identiche classi/DOM** attuali. Verifica: spec di vista verdi +
  **screenshot before/after** (§7).
- **Retro-compatibilità:** i componenti potenziati mantengono l'API esistente; **adozione
  incrementale** vista per vista.
- **Esecuzione:** non in questa sessione. Questa spec + il piano guidano il prossimo agente.

### Fuori scope
- **Ridisegno visivo** di qualsiasi vista (è un'altra decisione; qui solo estrazione).
- **Nuovi endpoint / dati reali** per le viste mock (`PricingView` resta mock — [D-032];
  `ConsoleView`/CustomerDetail "in arrivo" restano).
- **Nuove funzionalità.** Solo dedup a parità di comportamento.
- **i18n** ([D-003]).

---

## 2. Confini di collocazione (ADR-0033 §1)

| Collocazione | Cosa | Regola |
|---|---|---|
| **`packages/ui-kit`** | `EmptyState`, `Select`, `ModalFooter`, `PageToolbar`, `DataTable` (potenziato); util `formatEuro`/`initials`/`dateRange` | **Generico**: nessun import di dominio (`Customer`/`Booking`/…), nessuna query, nessuna conoscenza dei dati. |
| **`apps/web-staff/src/lib` (shared)** | `useEntityLabels`, `statusMaps`, `useQueryResource` | **Di dominio**: conosce entità/endpoint. |

---

## 3. Componenti `ui-kit` (nuovi / potenziati)

> **Regola trasversale:** le classi Tailwind e la struttura DOM emesse devono **coincidere**
> con quelle attualmente inline nelle viste. Estrarre copiando le classi esatte dalle sorgenti
> indicate — **non** riscriverle a mano.

### 3.1 `EmptyState.vue` (nuovo)
- **Scopo:** blocco empty-state ("Nessun/a …").
- **API:** `props { message: string }`; slot opzionale `#default` per contenuto ricco (icona).
- **Classi da preservare:** quelle di `BookingsView.vue:110-115` /
  `RenewalsView.vue:77-79` (`rounded-[var(--radius-lg)] border border-dashed
  border-[var(--color-border)] px-6 py-10 text-center text-sm text-[var(--color-text-2nd)]`).
- **Adozione:** BookingsView, RenewalsView (e future liste).

### 3.2 `Select.vue` (nuovo — gemello di `Input.vue`)
- **Scopo:** `<select>` stilizzato coerente con `Input.vue`, usabile dentro `Field`.
- **API:** `v-model` (string); `props { options?: { value: string; label: string }[] }` **oppure**
  slot `#default` per gli `<option>` (per gruppi/"Nessun …"); passthrough degli attr nativi
  (come `Input.vue`). `inheritAttrs` coerente con `Input.vue`.
- **Classi da preservare:** quelle dei `<select>` inline di `MapView.vue` (modale, righe form
  ~282-313) e lo stile input di `RenewalsView.vue:49-56` / `SettlePaymentModal` (`inputClass`).
  Allineare a `Input.vue` così Field+Input+Select sono omogenei.
- **Adozione:** MapView (selettore Tipo, Pacchetto, Cliente/Fascia), ovunque ci sia un
  `<select>` inline.

### 3.3 `ModalFooter.vue` (nuovo)
- **Scopo:** coppia di bottoni Annulla/Conferma in fondo ai modali.
- **API:** `props { cancelLabel?: string = 'Annulla'; submitLabel: string; submitDisabled?: boolean;
  submitVariant?: 'primary' | 'danger' = 'primary' }`; emit `cancel`, `submit`. Slot opzionale
  per contenuto extra a sinistra.
- **Classi da preservare:** `flex justify-end gap-2.5 pt-1` + `Button` secondary (Annulla) +
  `Button` primary (Conferma), da `CustomersView` (modale ~60-63), `SettlePaymentModal` (~96-99),
  `MapView` (modale ~320-323).
- **Adozione:** i 3 modali sopra.

### 3.4 `PageToolbar.vue` (nuovo)
- **Scopo:** header lista: controllo a sinistra + spacer + azione a destra.
- **API:** slot `#left` e `#right` (o `#actions`). Nessuna prop obbligatoria.
- **Classi da preservare:** `mb-4 flex flex-wrap items-center gap-3` + `<div class="flex-1">`
  spacer, da `BookingsView.vue:82-85`, `CustomersView.vue:27-33`, `MapView.vue:166-171`.
- **Adozione:** Bookings, Customers, Map (dove usano quel pattern).

### 3.5 `DataTable.vue` (potenziato — **retro-compatibile**)
- **Oggi:** rende solo header da `columns`, il corpo è uno slot in cui la vista scrive
  `<tr>/<td>` a mano (styling ripetuto).
- **Potenziamento (additivo):** modalità *data-driven*. Nuove prop **opzionali**:
  `rows?: T[]`, `rowKey?: (row: T) => string`. Quando `rows` è presente, `DataTable` genera i
  `<tr>` (con `hover:bg-[var(--color-raised)]`) e, per ogni colonna, un `<td>` con le **classi
  standard di cella** (§3.6). Contenuto cella:
  - default: `row[column.key]` con le classi standard (rispettando `align` e un flag
    `column.numeric` → `tabular-nums`);
  - custom: **slot con nome** `#cell-<key>="{ row }"` per celle ricche (avatar+nome, badge,
    bottone).
- **Retro-compatibilità:** senza `rows`, l'API a slot corpo **attuale resta identica**. Le viste
  migrano una alla volta.
- **Classi da preservare:** i `<td>` standard di `BookingsView`/`RenewalsView`/`CustomersView`/
  `PricingView` (`border-b border-[var(--color-border-row)] px-3.5 py-3.5 …`, prima colonna
  `px-[18px]`, destra `text-right`, numerica `tabular-nums`).

### 3.6 Classi di cella (token/utility)
- Definire classi riutilizzabili per le celle (via `@apply` in un file stile `ui-kit`, es.
  `packages/ui-kit/src/styles/table.css`, oppure componenti `<Td>`): `.td` (base),
  `.td-first` (prima colonna, `px-[18px]`), `.td-right`, `.td-num` (`tabular-nums`).
  Coincidono **esattamente** con le classi attuali. Usate dal `DataTable` data-driven e
  disponibili per celle custom.

---

## 4. Utility `ui-kit` (formattatori puri)

`packages/ui-kit/src/format.ts` (o `utils/`), **funzioni pure, unit-testate**:
- `formatEuro(amount: number): string` → `"€ " + amount.toFixed(2)`. Sostituisce gli inline in
  `BookingsView:106`, `SettlePaymentModal:72`, `MapView:318`, ecc. (rendere `€ X / € Y` con due
  chiamate).
- `initials(name: string): string` → prime lettere delle prime 2 parole, upper. Sostituisce gli
  inline duplicati (`BookingsView:48-49`, `RenewalsView:38`, `CustomersView:23`,
  `CustomerDetailView:14`).
- `dateRange(start: string, end: string): string` → `start` se `start === end`, altrimenti
  `"${start} → ${end}"`. Sostituisce `periodLabel` di `BookingsView:37`.

> Sono generiche (nessun dominio) → `ui-kit`. Esportarle da `packages/ui-kit/src/index.ts`.

---

## 5. Shared `web-staff` (di dominio)

### 5.1 `useEntityLabels.ts` (composable)
- **Scopo:** risoluzione entità→etichetta, oggi duplicata.
- **API (proposta):** `useEntityLabels()` ritorna `{ customerName(id): string,
  umbrellaLabel: ComputedRef<Map<string,string>>, packageName: ComputedRef<Map<string,string>> }`,
  cablando internamente `useCustomers()`, `useDayMap()`, `usePackages()`. `initials` viene da
  `ui-kit` (util). Le viste chiamano `useEntityLabels()` invece di ricostruire le Map.
- **Sostituisce:** `BookingsView:39-55`, `RenewalsView:29-37`, `MapView:95-100` (assorbe il
  follow-up "cleanup #2" della review A4.2).
- **Nota comportamento:** `umbrellaLabel` usa `useDayMap()` (le label non dipendono dalla data);
  fallback `'—'`; `customerName` fallback all'id.

### 5.2 `statusMaps.ts`
- **Scopo:** mappe stato→presentazione centralizzate.
- **Contenuto:** `PAY_LABEL`/`PAY_TONE` (stato pagamento → label IT + tone Badge), `TYPE_LABEL`
  (tipo prenotazione → IT). Sostituisce `BookingsView:30-36` e i ternari inline di `MapView:250-257`.

### 5.3 `useQueryResource.ts` (factory composable)
- **Scopo:** ridurre il boilerplate dei 13 composable server-state (pattern
  `useQuery(queryKey computed, queryFn)` / `useMutation(mutationFn, onSuccess: invalidate)`).
- **API (proposta):** un helper che, dati `queryKey` e `queryFn`, ritorna la query; e un helper
  mutation che accetta `mutationFn` + lista di `queryKey` da invalidare. I composable esistenti
  (`useCustomers`, `useBookings`, `useRenewals`, `useDayMap`, …) si riscrivono sopra la factory
  **mantenendo la stessa firma pubblica e lo stesso comportamento** (stesse chiavi invalidate).
- **Cautela (altitude):** è la parte più a rischio *over-engineering*. La factory deve **ridurre**
  il boilerplate senza nascondere le chiavi di invalidazione (che restano esplicite per-composable).
  Se in fase di piano risultasse più oscura del codice attuale, **ridurre lo scope** a soli helper
  opzionali (tracciare la scelta). Nessun cambiamento di comportamento osservabile.

---

## 6. Mappa di adozione (vista → cosa usa)

| Vista | Usa dopo il refactor |
|---|---|
| `BookingsView` | PageToolbar · DataTable data-driven (+ `#cell-*` per avatar/badge/incasso) · EmptyState · useEntityLabels · statusMaps · formatEuro/initials/dateRange |
| `RenewalsView` | DataTable data-driven · EmptyState · useEntityLabels · Field+Input (date) · Badge |
| `MapView` (modale) | Field+Input+Select (Tipo/Pacchetto/Cliente/Fascia/date) · ModalFooter · formatEuro · statusMaps (badge stato) |
| `CustomersView` | PageToolbar · DataTable data-driven · Field+Input (form) · ModalFooter · useEntityLabels(initials) |
| `CustomerDetailView` | Field+Input · initials |
| `SettlePaymentModal` | Field+Input · ModalFooter · formatEuro |
| `PricingView` (mock) | DataTable data-driven · Card (già) — **pixel-identica**, resta mock |
| `ReportView` | (KpiCard/BarChart/StackedBar già) · eventuale ListItem se emerge |

> Ogni riga è **estrazione a parità di resa**. Nessuna vista cambia aspetto.

---

## 7. Strategia di verifica (zero regressione)

1. **Spec di vista esistenti verdi** — asseriscono testo/struttura; se si rompono, il refactor ha
   cambiato comportamento. Baseline da non regredire: **ui-kit 14 · web-staff 47** (post-A4.2) +
   i nuovi spec dei componenti/util.
2. **Nuovi spec** per ogni componente/util `ui-kit` (Vitest, come `Icon.spec`) e per i composable
   shared (con MSW dove serve).
3. **Screenshot before/after** con gli strumenti di preview (`preview_start` sul dev server,
   `preview_screenshot`) su viste rappresentative — **BookingsView**, **MapView (modale aperto)**,
   **RenewalsView**, **CustomersView (modale)** — confrontando prima (main pre-refactor) e dopo.
   Differenze visive = regressione da correggere. In alternativa/aggiunta: `preview_inspect` per
   confermare classi/valori CSS su elementi chiave.
4. **`typecheck` + `eslint .` + `pnpm -r build`** verdi.

---

## 8. Fasi (per il piano — task indipendenti, ognuno verde e pixel-identico)

1. **ui-kit primitive:** `EmptyState`, `Select`, `ModalFooter`, `PageToolbar` (+ spec). Nessuna
   vista ancora migrata (i componenti esistono e sono testati in isolamento).
2. **ui-kit util + DataTable data-driven:** `format.ts` (formatEuro/initials/dateRange) + classi
   cella + `DataTable` potenziato retro-compatibile (+ spec).
3. **web-staff shared:** `useEntityLabels`, `statusMaps`, `useQueryResource` (+ spec).
4. **Adozione incrementale nelle viste** (una commit per vista, ognuna con spec verdi + screenshot
   check): Bookings → Renewals → SettlePaymentModal → Customers → CustomerDetail → MapView(modale)
   → Pricing → Report. Ordine dal più semplice al più complesso (MapView è il più grande, ultimo).

> Ogni fase è un commit-per-layer; ogni vista in fase 4 è un commit a sé, reversibile.

---

## 9. Rischi e mitigazioni

- **Regressione visiva** → estrazione meccanica delle classi + screenshot before/after +
  retro-compatibilità + adozione per-vista.
- **`DataTable` data-driven troppo ambizioso** → API additiva, la vecchia resta; se una vista ha
  celle troppo particolari, resta sull'API a slot (nessun obbligo di migrare tutto).
- **`useQueryResource` over-engineering** → ridurre a helper opzionali se offusca (vedi §5.3).
- **Viste mock** → restano mock; il refactor NON introduce dati reali, solo dedup di markup.

## 10. Decisioni chiuse

1. **Scope massimale** (DataTable data-driven + factory composable inclusi). (§1)
2. **Zero regressione visiva** come vincolo verificato (spec + screenshot). (§1, §7)
3. **Confine** ui-kit (generico) vs web-staff shared (dominio). (§2, [ADR-0033])
4. **Retro-compatibilità + adozione incrementale** per-vista. (§3.5, §8)
5. **`useEntityLabels` assorbe il follow-up cleanup #2** della review A4.2. (§5.1)
6. **Esecuzione delegata** alla sessione successiva; questo doc + il piano sono l'input. (§1)
7. **Componenti futuri** secondo [ADR-0033] §4 (collocazione, stile dai mock, +spec). 
