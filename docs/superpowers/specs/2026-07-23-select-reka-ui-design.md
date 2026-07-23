# 5.2 — Select di ui-kit su reka-ui (con componente Option)

- **Data:** 2026-07-23 · **Branch:** `feat/select-reka-ui`
- **Origine:** handoff 2026-07-23 §5.2. Decisioni utente (brainstorming): (a) architettura **custom su
  reka-ui** (non fix minimo del nativo); (b) migrazione **big-bang in un branch** con SDD e reviewer
  per task; niente periodo con due Select.

## 1. Problema

[Select.vue](../../../packages/ui-kit/src/components/Select.vue) è un `<select>` nativo di 15 righe:
la freccia attaccata al bordo è quella del browser (assenza di stile, non stile), il menu è quello
dell'OS e le option non sono stilabili. Non esiste un componente per le option: si passano `<option>`
nativi via slot o la prop `options`. L'utente vuole entrambe le cose che il nativo non può dare:
un componente `Option` e una resa propria del design system.

## 2. Architettura

**`Select.vue` riscritto su primitive reka-ui** (`SelectRoot/Trigger/Value/Portal/Content/Viewport`),
stesso pattern headless-dietro-wrapper di `Popover`/`Modal` (reka-ui resta dipendenza SOLO di ui-kit).
**Nuovo `Option.vue`** (`SelectItem` + `SelectItemText` + `SelectItemIndicator`) esportato da ui-kit.

**API preservata per i consumatori:**
- `defineModel<string>()` — il modello resta una stringa, `''` compreso (vedi §3).
- prop `options?: { value: string; label: string; disabled?: boolean }[]` — resa interna con `Option`.
- slot default per option custom: il contenuto passa da `<option>` nativi a `<Option value="…">testo</Option>`
  (unico cambio di contratto, ed è il punto della migrazione).
- `$attrs` inoltrati al trigger (`data-test*`, `class` di larghezza tipo `min-w-[170px]`);
  `disabled` gestito esplicitamente e passato a `SelectRoot`.

**Resa** (dichiarata nel nuovo `Select.spec.ts`, che asserisce le classi esatte come oggi):
- Trigger: le stesse classi del select attuale (`w-full rounded-[var(--radius-md)] border-[1.5px]
  border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] …` + focus
  ring) più layout flex con **chevron-down staccata dal bordo** (icona ui-kit, `text-muted`).
- Content: `position="popper"` a larghezza del trigger (`w-[var(--reka-select-trigger-width)]`),
  pannello `bg-surface` con `border-input`, `radius-md`, ombra, `z` sopra i Modal (i Select vivono
  anche dentro Modal/Drawer portalati); item con stato highlight (`bg-warm-025`-like via token
  esistenti), indicatore `check` sull'item selezionato. Nessun hex nuovo fuori `theme.css`.

## 3. Il vincolo dei valori vuoti (decisione tecnica chiave)

reka-ui 2.10.1 **lancia** su `SelectItem value=""` (verificato in `dist/Select/SelectItem.js:89`),
mentre 10+ consumatori usano `<option value="">` come stato reale selezionabile («Scegli…»,
«Nessun pacchetto», «Tutte») legato a `ref('')`, spesso con guardie `v-if`/`enabled` su stringa
vuota. **La mappatura resta interna a ui-kit**: una sentinella non vuota (costante privata del
modulo, condivisa da `Select` e `Option`) rappresenta `''` dentro reka-ui; il wrapper converte in
entrambe le direzioni su `modelValue`. I consumatori continuano a scrivere `value=""` e a ricevere
`''`: zero cambi di semantica nelle viste. La sentinella non appare mai nel DOM dei consumatori né
nei payload.

Nota resa: come col nativo, il testo mostrato a valore vuoto è **la label dell'option vuota**
(«Tutte», «Scegli…»), non un placeholder separato: nessuna prop `placeholder` (YAGNI).

## 4. Migrazione (big-bang, stesso branch)

- **15 file** importano `Select` da ui-kit (~29 istanze): RenewalsView (2), MapView (3),
  PricingView (6, incluse le righe equipaggiamento), EstablishmentView (1), StepStructure (3),
  StepRates (1), RentalsView (3), RentalCatalogView (1), UmbrellaGeneratorForm (1), e i pannelli
  Cantiere BeachPanel (2), MultiPanel, SectorCreatePanel, SectorPanel, UmbrellaCreatePanel,
  UmbrellaPanel, RowCreatePanel (1 ciascuno). Ogni `<option>` → `<Option>`.
- **+1 dichiarato fuori inventario**: `TransferSubscriptionModal.vue:87` usa un `<select>` nativo
  con classi locali (incoerenza pre-esistente): migra allo stesso `Select` di ui-kit nel branch.
- **Spec delle viste**: ~8 file di spec interagiscono col nativo (`HTMLSelectElement`, `.value` +
  `dispatchEvent('change')`, `querySelectorAll('select')`). Nuovo **helper condiviso** in
  `apps/web-staff/src/test/utils.ts` (es. `await selectOption(scopeOrTestId, valueOrLabel)`) che
  apre il trigger e clicca l'item nel portal (`document.body`), col modello ResizeObserver/portal
  già collaudato in `Popover.spec.ts`/`Modal.spec.ts`. Gli spec migrano all'helper: niente accesso
  diretto al DOM di reka-ui sparso nei test.
- `form-sync.spec.ts` (sync per id) e gli spec dei pannelli leggono il **valore** del select: col
  nuovo componente si legge il testo del trigger (o il modello), non `.value` del nativo.

## 5. Test e verifica

- `Select.spec.ts` **riscritto deliberatamente** (è il punto in cui si dichiara la nuova resa):
  classi esatte del trigger, apertura/selezione via portal, `options` prop e slot `Option`,
  `disabled`, round-trip del valore vuoto `''`, attributi inoltrati.
- Nuovo `Option.spec.ts` minimo (resa, disabled, indicatore).
- Suite complete (una alla volta): web-staff (include ui-kit), poi typecheck monorepo. Le altre app
  non consumano `Select` (verificato: import solo in web-staff).
- `docs/design/design-system.md` §10: voce Select aggiornata (componente composto, Option, popper).
- Verifica visiva finale: richiede il login dell'utente (gotcha noto), da chiedere esplicitamente.

## 6. Fuori scope

- `Combobox`/ricerca nelle option, multi-select, gruppi con label (`SelectGroup`): nessun
  consumatore li usa oggi.
- Gli `<input type="date">` e ogni altro controllo (item 5.3 e successivi).
