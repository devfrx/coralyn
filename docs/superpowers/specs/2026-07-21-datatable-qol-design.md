# Spec — DataTable QoL: wrapping, paginazione, ordinamento, stati

- **Data:** 2026-07-21 · **Stato:** approvata a voce in brainstorming, in attesa di review scritta.
- **Scope:** `packages/ui-kit` (DataTable + funzioni pure + icone) e le 7 viste `web-staff` che lo usano.
- **ADR di riferimento:** [ADR-0033](../../architecture/decisions/0033-astrazione-componenti-frontend.md)
  (collocazione ui-kit vs app, retro-compatibilità, componente = +spec). Il vincolo «zero cambio di
  resa visiva» di ADR-0033 valeva per l'astrazione strutturale; questo lavoro è il redesign che
  quell'ADR rimandava esplicitamente («il redesign è un'altra decisione»). Nessun nuovo ADR: nessuna
  nuova dipendenza né cambio di pattern.

## 1. Problema

[`DataTable.vue`](../../../packages/ui-kit/src/components/DataTable.vue) è minimale: card +
`overflow-x-auto` + header skinnato. Mancano:

- **Wrapping governato**: in contesti stretti (375px, card affiancate, drawer) il testo va a capo
  dove capita; l'unica cella governata è Note in Clienti (`max-w truncate` scritto a mano).
- **Paginazione**: nessuna, da nessuna parte. I contratti API non hanno `page`/`limit`/`cursor`:
  le liste arrivano intere.
- **Ordinamento**, **empty state integrato**, **conteggio righe**, **sticky header**, **densità**.

9 usi in 7 viste: 4 viste usano l'API a slot (celle `<td>` copia-incolla delle costanti
`TD`/`TD_FIRST` — il debito che ADR-0033 voleva chiudere), 5 usi sono data-driven.

## 2. Decisioni prese (con l'utente, in brainstorming)

1. **Paginazione client-side**, implementata nel componente sul dato in memoria. Ai volumi di uno
   stabilimento balneare (centinaia di righe) è la scelta corretta; il backend non cambia. L'API del
   componente è però **controlled-capable** (`v-model:page` opzionale con fallback interno): se un
   domani un contratto diventasse paginato lato server, il componente non cambia API.
2. **Scope QoL**: ordinamento colonne, stati integrati (empty + conteggio; **niente skeleton** —
   feature separata futura), sticky header, densità configurabile.
3. **Responsive**: policy di wrapping per colonna + colonne che si nascondono sotto un breakpoint
   (`hideBelow`). Niente card-view mobile (scartata: raddoppia il template).
4. **Approccio A**: tutte le feature nuove vivono nell'API data-driven; le lacune che oggi
   costringono all'API a slot si colmano (click-riga, classe per riga) e le 4 viste a slot migrano
   una alla volta. L'API a slot resta funzionante (retro-compat) ma congelata: non riceve feature.
5. **Niente composable headless** (`useTable`): un solo consumatore oggi = astrazione speculativa.
   Le funzioni pure sono comunque isolate in un modulo colocato, così un'eventuale estrazione futura
   è banale.

## 3. API del componente (tutta additiva — i 9 usi attuali compilano invariati)

### 3.1 Definizione colonna

```ts
type Column = {
  key: string;
  label: string;
  align?: 'left' | 'right';
  numeric?: boolean;                        // esistente: tabular-nums
  sortable?: boolean;                       // header cliccabile
  sortValue?: (row: Record<string, unknown>) => string | number;
  wrap?: 'wrap' | 'nowrap' | 'truncate';    // default 'wrap' = comportamento attuale
  maxWidth?: string;                        // con 'truncate' (es. '280px'); title col testo pieno
  hideBelow?: 'sm' | 'md' | 'lg';           // colonna nascosta sotto il breakpoint
};
```

- **`sortValue` è necessario**: le celle spesso mostrano valori derivati via slot (es. Cliente
  mostra il nome risolto da `customerId`) — ordinare per `row[key]` ordinerebbe per id. L'accessor
  arriva dalla vista: il dominio resta fuori da ui-kit (ADR-0033).
- **`hideBelow` esplicito** invece di `priority` numerico: si legge da solo e mappa su classi
  Tailwind **statiche** (`max-sm:hidden` / `max-md:hidden` / `max-lg:hidden`, richieste dal JIT).
- Le colonne `numeric` non vanno mai a capo (nowrap implicito).

### 3.2 Prop / emit nuovi

| API | Default | Comportamento |
|---|---|---|
| `pageSize?: number` | — | Opt-in paginazione client-side. `v-model:page` opzionale (controlled-capable, fallback interno). Reset a pagina 1 quando cambiano le righe. |
| `density?: 'comfortable' \| 'compact'` | `'comfortable'` | `compact` = `py-2` invece di `py-3.5`; font invariato. |
| `emptyMessage?: string` | — | Con 0 righe rende `EmptyState` dentro la card (solo API data-driven). |
| `maxHeight?: string` | — | Scroll verticale interno alla card + `thead` sticky. |
| `rowClass?: (row) => string` | — | Classe aggiuntiva per riga (es. tariffe archiviate `opacity-60`). |
| `showCount?: boolean` | `false` | Mostra il footer col conteggio anche senza paginazione. |
| emit `row-click(row)` | — | Riga cliccabile; cursor/hover attivi solo se il listener esiste. |

- **Sticky header vincolato a `maxHeight`**: dentro la card (`overflow-hidden` + `overflow-x-auto`)
  `position: sticky` rispetto allo scroll di pagina non può funzionare (antenati con overflow).
  Sticky funziona solo nello scroll interno della card — quindi le due prop sono una cosa sola.
  Con la paginazione attiva le liste diventano corte e il caso d'uso si riduce.
- **Ordinamento**: click sull'header cicla asc → desc → nessuno. `aria-sort` sul `th`; header
  sortable resi come `<button>` (tastiera). Il sort si applica **prima** della paginazione.
- **Footer**: appare se paginazione attiva o `showCount`. A sinistra «1–20 di 87» in
  `tabular-nums`; a destra pager prev/next.

### 3.3 Collocazione della logica

- `DataTable.vue`: stato (sort, pagina) e orchestrazione (`computed` della finestra visibile).
- Funzioni pure in un modulo colocato ui-kit (es. `src/lib/tableData.ts`): comparatore di sort
  (stringhe con `localeCompare`, numeri numericamente, null/undefined in fondo), calcolo finestra e
  range del footer. Pure = testabili in Vitest senza montare il componente.
- Zero dominio in ui-kit: nessun import di `@coralyn/contracts`.

## 4. Resa visiva (token Coralyn esistenti, nessuna estetica nuova)

- **Footer**: simmetrico all'header — bg `--color-raised`, bordo sup. `--color-border-row`, testo
  12.5px `--color-text-muted`, conteggio `tabular-nums`. Pager: 2 `IconButton` ghost con
  `chevron-left`/`chevron-right` (**icone da aggiungere al registry**), `disabled` `opacity-50`,
  focus `--ring-focus`.
- **Indicatore sort**: freccia 14px accanto alla label — tenue al hover sugli header ordinabili,
  `--color-accent` quando attivo. Header invariato (10.5px maiuscolo `--tracking-caps`); click-target
  = intero `th`. Transizioni `--motion-fast`/`--ease-standard`.
- **Celle troncate**: attributo `title` col testo completo.
- Nessun hex fuori da `theme.css`; stati interattivi secondo §10.1 del design system (focus ring,
  hover via token, disabled `opacity-50`).

## 5. Piano di migrazione (una vista per task, ciascuna verde e reversibile)

1. **CustomersView** (la più ricca): → data-driven con `row-click`, sort su Cliente
   (`sortValue` = `cognome nome`), `pageSize`, `emptyMessage`, Note → `truncate`+`maxWidth`,
   Email/Note → `hideBelow` su mobile. Il RouterLink nella cella resta (a11y del link reale).
2. **RentalsView**: celle → slot `#cell-*`.
3. **PricingView**: celle → slot; l'ordinamento manuale (`sortedRates`) resta nella vista — è
   ordine di dominio, non preferenza utente.
4. **RentalCatalogView** (2 tabelle): celle → slot + `rowClass` per le archiviate (`opacity-60`).

Viste già data-driven — solo opt-in mirati: wrapping per colonna e `hideBelow` dove ha senso
(Prenotazioni ha 7 colonne), `compact` per la card Pagamenti cliente. Prenotazioni è day-scoped →
paginazione lì probabilmente non necessaria (si decide nel piano, vista per vista).

Le costanti `TD`/`TD_FIRST`/`TD_RIGHT`/`TD_NUM` restano finché l'ultima vista a slot non migra;
a fine migrazione si valuta la rimozione (sono export pubblici ui-kit → verificare altri usi).

## 6. Test e verifica

- Spec nuovo per le funzioni pure; `DataTable.spec.ts` esteso: ciclo sort a 3 stati, `aria-sort`,
  finestra pagine + range footer, reset pagina al cambio righe, `v-model:page`, `row-click`,
  `rowClass`, `emptyMessage`, classi densità/`hideBelow`/`maxHeight`.
- Spec di vista aggiornati per ogni migrazione. **Sempre l'intera suite** web-staff
  (`npx vitest run`, include ui-kit) + `pnpm typecheck` — regola cross-file.
- Limite jsdom: truncate/sticky/breakpoint si asseriscono come classi; la **resa** va vista in
  browser. Prova visiva (login gate → insieme all'utente) accodabile a quella già pendente della
  mappa: 375/768/1280 + dark su Clienti e Prenotazioni.

## 7. Docs

- `design-system.md` §10, voce DataTable: riscritta con le nuove capacità, **nello stesso lavoro**
  (living doc).
- La baseline test attesa cresce (numero esatto nel piano di implementazione).

## 8. Non-goals

- Skeleton di caricamento (feature separata futura, deciso dall'utente).
- Paginazione server-side / modifiche a contratti o API.
- Card-view mobile.
- Composable headless `useTable`.
- Filtri/ricerca nel componente (restano nelle viste: `SearchInput` + `SegmentedControl` in toolbar).
