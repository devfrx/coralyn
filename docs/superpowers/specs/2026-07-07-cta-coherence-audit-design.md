# Design — Audit di coerenza e contestualizzazione CTA (Fase C)

> Fase di **qualità/UX** successiva a Fase A (modali universali) e Fase B (sweep varianti CTA), entrambe su
> `main = 20e36d6`. Nasce dal feedback LIVE dell'utente: alcune CTA sono **enormi rispetto al contesto** (Button `md`
> nelle righe dense), le azioni **solo-icona** sono `Button` boxati invece di `IconButton`, e cluster di 3-4 azioni
> risultano **attaccati/incoerenti** (es. header fila di `EstablishmentStructureView`; drawer `MapView` che andava a capo).
> Workflow [ADR-0009](../../architecture/decisions/0009-documentazione-di-design.md). Branch: `feat/cta-coherence-audit`.
> **Vincolo esplicito dell'utente:** le modifiche di stile devono essere **centralizzate e modulari**, mai per-CTA o
> per-elemento; tutto **universale e riutilizzabile**, sfruttando token e classi esistenti. Direzione scelta (2026-07-07):
> «la soluzione più professionale, coerente al contesto, priva di debiti e meno pigra» → rubrica v2 **+** primitiva ui-kit.

## 1. Contesto
Fase B ha applicato la **variante** giusta per contesto (primary/secondary/ghost/danger, IconButton per alcune icone-sole,
`:loading` per async). Restano tre lacune di coerenza:
- **Dimensione/densità mancante nella rubrica.** Non esiste una regola su quando una CTA è `sm` vs `md`. Risultato: azioni
  di riga/header-card rese `md` (troppo grandi per il contesto denso) — es. "Genera"/"+ Aggiungi"/"+ Nuova fila".
- **Icone-sole come `Button`.** Diversi edit/elimina sono `<Button variant="secondary"><Icon/></Button>` (boxati, `md`)
  invece di `IconButton` — es. `edit-sector`/`delete-sector`/`edit-type`/`delete-type`/`edit-row`/`delete-row` in
  `EstablishmentStructureView`. (In PricingView le icone-sole sono già `IconButton` da Fase B.)
- **Layout dei cluster d'azione decentralizzato.** Ogni gruppo di azioni è un `flex items-center gap-…` scritto a mano
  in ~15-20 punti (header card, azioni di riga, drawer, header pagina). Da qui spaziature incoerenti e i **wrap** (il
  drawer `MapView` a 340px). Non c'è un punto unico che governi gap/allineamento/politica di wrap.

## 2. Obiettivi / Non-obiettivi
**Obiettivi**
- **Rubrica v2**: estendere la rubrica CTA con la dimensione **size-by-context** e la regola **icona-sola = sempre
  `IconButton`**. Documentarla in `docs/design/design-system.md` (fonte di verità) + **ADR-0045**.
- **Primitiva `<ActionBar>`**: un componente ui-kit che incapsula il **layout** dei cluster d'azione (gap/allineamento/
  wrap), gemello non-modale di `ModalFooter`. Sostituisce i `flex items-center gap-…` scritti a mano.
- **Applicare** rubrica v2 + `ActionBar` in **tutte le viste** (web-staff + web-platform), un incremento per vista.
- Non regredire la baseline: ui-kit **107** · web-staff **312** · web-platform **16** · typecheck pulito.

**Non-obiettivi**
- Nessun cambio di dominio/logica/contracts/API/schema. Solo presentazione/interazione.
- Nessun refresh di palette/token colore.
- **Niente stili per-elemento/one-off.** Se manca una leva, si aggiunge **una volta** alla ui-kit (con ADR), non si
  comprime a mano il singolo bottone.
- I controlli **bespoke non-CTA** (celle mappa, chip ombrellone, nav Sidebar, frecce Topbar, segmented slot, valore
  incasso cliccabile, toggle disclosure) **non** vengono forzati a `Button`/`IconButton`: si verificano solo gli stati.
- Fuori scope: i18n, colorblind-safe, i D-0xx di dominio.

## 3. Parte A — Rubrica CTA v2 (size-by-context)
Estende la rubrica Fase B §4 con la dimensione. Tabella normativa (in `design-system.md` + ADR-0045):

| Contesto | Trattamento |
|---|---|
| **CTA primaria di pagina** (header di vista, azione principale) | `Button` **`md`** (default), variante per semantica |
| **Azione in header di card/sezione** (es. "+ Nuovo", "+ Nuova fila") | `Button` **`sm`** |
| **Azione inline in riga/lista** (es. "Genera", "+ Aggiungi") | `Button` **`sm`** (testo) |
| **Solo icona** (edit/elimina/espandi/chiudi/rimuovi…) | **`IconButton`** — mai `Button` con un solo `<Icon>`; variante `ghost`/`subtle`/`danger` per contesto; `size` coerente col cluster |
| **Azione async** (mutation) | `:loading` col pending osservabile (`…isPending.value`) |
| **Azione distruttiva** | `danger` (`Button` o `IconButton`) |

Regola pratica: **la CTA eredita la densità del suo contenitore.** Header di pagina → `md`. Dentro una card, una riga
di lista, una toolbar, un drawer → `sm`. Le icone-sole non usano mai `Button`.

## 4. Parte B — Primitiva `<ActionBar>` (centralizza il layout dei cluster)
**Cos'è:** un wrapper di layout per un gruppo di azioni allineate. Unico punto di verità per gap/allineamento/wrap.

**API (minimale, solo layout — nessuna logica):**
```
<ActionBar
  align="end" | "start" | "between"   // justify-content; default "end"
  gap="sm" | "md"                       // spaziatura da token; default "sm"
  :wrap="false"                          // se true consente il wrap; default false (una riga)
>
  <Button … /> <IconButton … />          // slot default
</ActionBar>
```
- Rende un `flex items-center` con `gap` da token e `justify-*` secondo `align`.
- `:wrap="false"` (default) tiene le azioni su una riga; il **contenitore** decide l'overflow (evita i wrap accidentali).
- **Non** impone la `size` ai figli (Vue non cascata le prop): la size resta sul singolo `Button`/`IconButton` secondo la
  rubrica v2. `ActionBar` governa **solo** la disposizione.
- Gemello non-modale di `ModalFooter` (che resta il cluster specifico dei footer modale). `ModalFooter` **non** viene
  rifattorizzato in questa fase (scope creep).

**Dove si usa (censimento ~15-20 siti):** header card (Settori/Tipologie/PricingView), azioni di riga
(`EstablishmentStructureView` header fila, righe tipologia/settore), header pagina, azioni drawer `MapView`, azioni
utente in `EstablishmentView`, footer non-modale delle liste. Ogni sito passa da `flex items-center gap-…` inline a
`<ActionBar>`.

## 5. Parte C — Audit token/size della ui-kit (on-demand)
Durante l'applicazione si verifica se `Button`/`IconButton` `sm` hanno padding adeguato ai contesti più densi.
**Solo se** una riga ultra-densa lo richiede davvero si valuta l'aggiunta **centralizzata** di un `size="xs"`
(con ADR dedicato), invece di comprimere a mano. Default: `sm`/`md` esistenti bastano. Nessun token colore nuovo.

## 6. Parte D — Applicazione (pipeline vista-per-vista)
Un **task per vista**, esecuzione TDD subagent-driven con doppio review (spec + qualità), verifica LIVE per vista.
Ordine: prima **ui-kit** (`ActionBar` + rubrica in `design-system.md` + ADR-0045), poi le viste.

**Viste in scope** (audit size-by-context + icona-sola→IconButton + ActionBar):
- web-staff: `EstablishmentStructureView` (caso peggiore: header fila con 4 CTA, edit/delete icona-sola→IconButton,
  Genera/Aggiungi/Nuova fila→`sm`, cluster in ActionBar; card Settori/Tipologie idem), `EstablishmentView`
  (azioni utente/edit), `PricingView` (header toolbar + cluster; icone già IconButton da Fase B — verifica size/ActionBar),
  `MapView` (drawer + azioni; consolidare col fix già fatto), `BookingsView`, `CustomersView`, `CustomerDetailView`,
  `RenewalsView`, `ReportView`, shell (`Sidebar`/`Topbar` — solo verifica, bespoke).
- web-platform: `EstablishmentsListView`, `EstablishmentDetailView`, `CreateEstablishmentModal`, `LoginView`.

**Metodo per vista:** censire i cluster e le CTA → applicare rubrica v2 (size) + convertire icone-sole rimaste a
IconButton + avvolgere i cluster in `<ActionBar>` → mantenere/aggiornare gli spec (selettori `data-test`/`data-testid`
reggono per fallthrough) → verifica LIVE.

## 7. Decisioni risolte (con l'utente, 2026-07-07)
1. Centralizzazione: **rubrica v2 + primitiva `<ActionBar>`** (soluzione professionale/modulare, non solo rubrica).
2. Stili sempre **centralizzati** (ui-kit/token/rubrica), mai per-elemento; leve mancanti aggiunte una volta con ADR.
3. `size-by-context`: header pagina = `md`; card/riga/toolbar/drawer = `sm`; icona-sola = `IconButton` sempre.
4. Il fix MapView drawer (card 380px + azioni inline + "Gestisci abbonamento"→Button ghost) è già sul branch (`652d0ad`).

## 8. Test e verifica
- Baseline da non regredire: ui-kit 107 · web-staff 312 · web-platform 16 · typecheck pulito. `ActionBar` aggiunge il
  proprio spec (+N test ui-kit → la baseline sale; l'esecutore conferma i conteggi).
- `web-staff/vitest.config.ts` globa gli spec ui-kit → i test di `ActionBar` contano in entrambe le suite.
- Gli spec di vista selezionano per `data-test`/`data-testid`: reggono al cambio `Button`→`IconButton` e `md`→`sm`
  (fallthrough). Aggiornare solo gli spec che asserivano markup/struttura, verificando comportamento/aria.
- **Verifica LIVE** su Docker rebuildato dal branch (browser ext non affidabile → check demandato all'utente per vista).
  `data-test` strippati nel build prod → verifica comportamentale/visiva.

## 9. Rischi
- **`ActionBar` over-engineering:** mitigato dal censimento (~15-20 siti reali) e dall'API minimale (solo layout). Se in
  applicazione risultasse inutile, si ripiega su rubrica + `flex` uniformato (deciso in fase, non a priori).
- **Churn di massa:** l'audit tocca molte viste → pipeline per-vista con review e LIVE per contenere il rischio; i
  bespoke non-CTA restano intatti (niente over-conversion).
- **Spec che asseriscono size/variant class:** rari; aggiornati per verificare comportamento, non struttura.
