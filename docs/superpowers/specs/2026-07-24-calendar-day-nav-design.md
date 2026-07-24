# 5.3 — Navigazione tra giorni con popup calendario tematizzato (design)

> **Data:** 2026-07-24 · **Stato:** design approvato in brainstorming (decisioni utente raccolte).
> **Tipo:** slice FE-only. Nessun cambio di dominio, dati, flusso o macchina a stati.
> **Stampo:** identico al Select 5.2 (primitive reka-ui dietro wrapper ui-kit, confine a sentinella).

## 1. Problema e driver

La Topbar di `web-staff` ha già la navigazione per giorno ([Topbar.vue](../../../apps/web-staff/src/app/Topbar.vue)):
due chevron `shiftDay(±1)` e un `<input type="date">` nativo reso invisibile (`opacity-0`, `absolute inset-0`) sopra
l'etichetta della data.

**Difetto osservato (utente, 2026-07-24):** cliccando l'etichetta **non si apre alcun calendario** — si può solo
avanzare/indietreggiare di un giorno con le frecce. Causa (da codice): in Chromium il picker di `<input type="date">`
si apre **solo** cliccando l'icona-indicatore (`::-webkit-calendar-picker-indicator`), non il corpo del campo; qui
l'indicatore è invisibile (`opacity-0`) e schiacciato all'estremo destro dei 128px, e non c'è nessun handler che chiami
`showPicker()`. In pratica l'affordance "salta a una data qualsiasi" è **rotta**: resta solo lo step ±1 giorno.

**Driver:** l'utente ha scelto in brainstorming **coerenza visiva** (un popup tematizzato coi token dell'app al posto
del calendario nativo, fuori tema e incoerente tra OS/browser). Alla luce del difetto sopra, 5.3 è **anche un fix
funzionale**: ripristina la selezione di una data arbitraria, oggi non raggiungibile. La soluzione è la stessa in
entrambe le letture: un `Popover` + `Calendar` che si apre in modo affidabile al click, con la **stessa** navigazione a
chevron. **Nessuna nuova funzione oltre al ripristino** (niente scorciatoie: vedi §2).

Non è un fix minimo dell'attuale controllo: la decisione (già annotata nell'handoff 2026-07-24 §5.3, ora confermata
in brainstorming) è di introdurre un `Calendar` riusabile in `ui-kit`. Lo split è fissato: **`ui-kit` possiede il
Calendar riusabile** (griglia-mese, ISO in/out); **la Topbar possiede il navigatore locale** (Popover + pill + chevron),
unico consumatore oggi.

## 2. Decisioni raccolte (utente)

1. **Approccio A** — un solo `Calendar.vue` composto in `ui-kit`, `v-model` come **stringa ISO `yyyy-mm-dd`**. Scartati
   B (esporre le sotto-parti reka-ui: superficie inutile, la Topbar conoscerebbe `CalendarDate`) e C (DatePicker completo
   con trigger incorporato: violerebbe lo split, il trigger reale è la pill bespoke della Topbar).
2. **Parità stretta col nativo**: solo la griglia-mese, **nessuna scorciatoia** (niente "Oggi", niente salti).
   La griglia reka-ui già evidenzia "oggi" e naviga i mesi, come il nativo.
3. **Calendario libero**: **nessun `min`/`max`**, parità col nativo che oggi non vincola le date selezionabili.
4. **Dipendenza diretta approvata**: `@internationalized/date` diventa dipendenza diretta di `packages/ui-kit`
   (vedi §6). Nessun nuovo ADR: additiva, dentro la regola già ratificata "reka-ui solo in `ui-kit`", stessa natura
   dell'ADR-implicito del Select.
5. **Follow-up tracciati** (fuori da questo slice): scorciatoie "Oggi + salti" (inizio/fine stagione, ±7); migrazione
   dei 16 `<input type="date">` sparsi in modali/form.

## 3. Architettura

### 3.1 `Calendar.vue` (nuovo, `ui-kit`)

Unità riusabile: griglia-mese tematizzata, `v-model` **stringa ISO `yyyy-mm-dd`**. Assembla internamente le primitive
reka-ui `CalendarRoot > CalendarHeader[CalendarPrev · CalendarHeading · CalendarNext] > CalendarGrid[CalendarGridHead ·
CalendarGridBody[CalendarGridRow · CalendarCell · CalendarCellTrigger]]`.

**Confine ISO ↔ CalendarDate** (stesso pattern-sentinella del Select `''`↔`SELECT_EMPTY`). Il modello dei consumatori
è una stringa ISO; dentro reka-ui viaggia un `CalendarDate` di `@internationalized/date`:

```ts
const model = defineModel<string>();
const inner = computed({
  get: () => (model.value ? parseDate(model.value) : undefined),
  set: (v) => { model.value = v ? v.toString() : ''; },
});
```

`parseDate('2026-07-15')` produce un `CalendarDate` **senza fuso**; `CalendarDate.toString()` restituisce
`'2026-07-15'`. Nessuna aritmetica in ora locale: coerente con `addDays`/`todayIso` di
[dates.ts](../../../apps/web-staff/src/lib/dates.ts) e con ADR-0031. `parseDate` e `CalendarDate` sono verificati
esportati da `@internationalized/date@3.12.2`.

**Props di `CalendarRoot` usate:**

- `locale="it-IT"` — mesi e weekday in italiano, settimana da **lunedì** (reka-ui deriva `weekStartsOn` dal locale).
- `weekday-format="short"` — intestazioni `lun mar mer …` (leggibili; il default `narrow` darebbe `L M M`).
- `prevent-deselect` — un click sul giorno già selezionato non azzera il modello (per una nav vogliamo sempre un
  giorno selezionato).
- `calendar-label="Scegli data"` — nome accessibile della griglia.
- **Nessun** `min-value`/`max-value` (decisione §2.3).

**Styling — solo token esistenti, niente hex fuori da `theme.css`.** Le celle si stilano con le varianti dei
data-attribute reali di `CalendarCellTrigger` (verificati nella dist reka-ui 2.10.1): `data-selected`, `data-today`,
`data-outside-view`, `data-disabled`, `data-unavailable`, `data-focused`.

- giorno selezionato (`data-selected`) → sfondo `--color-brand`, testo su brand, `font-semibold`;
- "oggi" non selezionato (`data-today` senza `data-selected`) → testo `--color-brand` + `font-semibold` (nessuno
  sfondo: si distingue dal selezionato che è pieno);
- giorno fuori-mese (`data-outside-view`) → `--color-text-muted`;
- cella disabilitata/non disponibile (`data-disabled`/`data-unavailable`) → `opacity-50`, non cliccabile;
- hover cella (non selezionata) → sfondo `--color-raised`;
- focus visibile (`data-focused`) → `[box-shadow:var(--ring-focus)]`.

`CalendarCellTrigger` rende un `role="button"` e seleziona su **click** (verificato: handler `onClick`).

Esportato da [packages/ui-kit/src/index.ts](../../../packages/ui-kit/src/index.ts). **Non** serve un componente figlio
esportato (a differenza di `Option` per il Select): le celle sono interne alla griglia.

### 3.2 `Popover.vue` (modifica mirata, `ui-kit`)

Oggi [Popover.vue](../../../packages/ui-kit/src/components/Popover.vue) espone solo `default-open` (non controllato).
Per **chiudere il popup alla selezione** senza hack, aggiungo il supporto a **`v-model:open`** (open controllato):
passthrough di `:open`/`@update:open` a `PopoverRoot`. Miglioria piccola, retro-compatibile (chi usa solo
`default-open` non cambia) e riusabile: è un miglioramento legittimo del componente condiviso su cui stiamo lavorando.

### 3.3 `Topbar.vue` (modifica, `web-staff`)

Il navigatore resta **composizione locale bespoke**, invariato nell'aspetto: la pill
`[chevron ‹] [etichetta-data] [chevron ›]` nello stesso contenitore attuale.

- Il blocco `<label><input type="date"></label>` diventa un `Popover` di `ui-kit` (`v-model:open` locale) con
  **l'etichetta-data come trigger** (un `<button>` con `aria-label="Scegli data"`, parità con l'`aria-label` del vecchio
  input — chiude anche lo spirito del follow-up a11y per questo controllo) e `<Calendar v-model="session.activeDate">`
  nel contenuto.
- Alla selezione: `@update:model-value` del Calendar → set `session.activeDate` **e** chiusura del popover
  (`open = false`).
- I due chevron `shiftDay(±1)` restano identici. La funzione `onPickDate` viene rimossa (non più necessaria).
- `dateLabel` (formattazione etichetta in UTC) resta invariata.

## 4. Testing (barra no-debt)

Le spec di `ui-kit` vivono in `packages/ui-kit/src/components/*.spec.ts` e sono incluse dal vitest di `web-staff`
(`include: ['src/**/*.spec.ts', '../../packages/ui-kit/src/**/*.spec.ts']`); gli stub jsdom (`ResizeObserver`,
pointer-capture, `scrollIntoView`) sono globali in [setup.ts](../../../apps/web-staff/src/test/setup.ts).

1. **Nuovo `packages/ui-kit/src/components/Calendar.spec.ts`** (stampo di `Select.spec.ts`, ma **senza portal**: montato
   diretto, le celle vivono nel wrapper). Casi:
   - render della griglia-mese per un `v-model` dato (mese corretto nell'heading);
   - selezione di un giorno → emette la **stringa ISO** attesa (`update:modelValue`);
   - round-trip: `v-model` ISO → `CalendarDate` interno → ISO invariato;
   - la cella "oggi" porta `data-today`; la cella del valore porta `data-selected`;
   - `prevent-deselect`: click sul giorno selezionato non azzera il modello.
2. **Helper `pickCalendarDay(root, giorno)`** in [utils.ts](../../../apps/web-staff/src/test/utils.ts), gemello di
   `selectOption`: apre il Popover (click sul trigger), trova il `CalendarCellTrigger` col numero-giorno dato **non**
   `data-outside-view`, lo clicca. Il contenuto del Popover è **portalato** → le celle vivono in `document.body` solo a
   popover aperto.
3. **`Topbar.spec.ts` aggiornato**: apri il popover → `pickCalendarDay` → `session.activeDate` cambia al giorno atteso
   **e** il popover si chiude. Rispetta la trappola di teardown (smonta il wrapper **prima** di pulire `document.body`,
   come `Select.spec.ts`), perché il Popover pianifica il `setTimeout` di Presence alla chiusura.

**Gate:** intera suite `web-staff` (incl. `ui-kit`) verde, eseguita **da sola** (mai in parallelo con altre suite);
`corepack pnpm -r typecheck` exit 0.

## 5. File toccati

| File | Azione |
|---|---|
| `packages/ui-kit/src/components/Calendar.vue` | nuovo (wrapper composto reka-ui, `v-model` ISO) |
| `packages/ui-kit/src/components/Calendar.spec.ts` | nuovo (test unità) |
| `packages/ui-kit/src/components/Popover.vue` | + `v-model:open` (open controllato) |
| `packages/ui-kit/src/index.ts` | export `Calendar` |
| `packages/ui-kit/package.json` | + dep diretta `@internationalized/date` |
| `apps/web-staff/src/app/Topbar.vue` | input nativo → Popover + Calendar; rimosso `onPickDate` |
| `apps/web-staff/src/app/Topbar.spec.ts` | aggiornato (popover + `pickCalendarDay`) |
| `apps/web-staff/src/test/utils.ts` | + helper `pickCalendarDay` |
| `docs/design/design-system.md` | + sezione Calendar (come §10 Select) |

## 6. Decisione strutturale: `@internationalized/date` diretta in `ui-kit`

**Approvata.** Oggi `@internationalized/date` è presente **solo in modo transitivo** sotto reka-ui e **non è risolvibile
dalla root** (verificato: `Cannot find module` dalla root): è una **dipendenza fantasma**. Usare il Calendar reka-ui in
modo pulito richiede di importarne `parseDate`/`CalendarDate`, quindi va **dichiarata diretta** in
`packages/ui-kit/package.json` (`^3.5.0`, risolve già `3.12.2`, in linea col vincolo di reka-ui). Elimina il debito
fantasma; nessun nuovo ADR (additiva, coerente con "reka-ui solo in `ui-kit`").

## 7. Fuori scope / follow-up

- Scorciatoie "Oggi + salti" (inizio/fine stagione, ±7 giorni) — tracciate come follow-up.
- Migrazione dei 16 `<input type="date">` sparsi in modali/form al nuovo Calendar — follow-up separato.
- Il navigatore resta locale alla Topbar: nessuna generalizzazione a un componente "date-navigator" finché non c'è un
  secondo consumatore.

## 8. Gotcha ereditati rilevanti

- **reka-ui solo dentro `ui-kit`** (2.10.1): la Topbar consuma i wrapper, non importa reka-ui.
- **Niente em dash `—` nel testo mostrato all'utente**: nel nuovo controllo non c'è prosa utente nuova oltre agli
  `aria-label` ("Scegli data", "Giorno precedente/successivo") e all'etichetta data già esistente; nessun em dash.
- **Trappola teardown Presence**: negli spec che montano il Popover, smonta il wrapper prima di pulire `document.body`.
- **`.setValue()` non si applica**: come per il Select, l'interazione è per evento (click sulla cella), non via `value`.
</content>
</invoke>
