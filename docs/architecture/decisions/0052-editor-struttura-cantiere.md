# ADR-0052: Editor struttura «il Cantiere» — canvas + ispettore sulla scena Riva a riposo

- **Status:** Accepted
- **Data:** 2026-07-22
- **ADR correlati:** [ADR-0005](0005-modello-mappa.md) (modello mappa), [ADR-0014](0014-setup-mappa-strutturato.md)
  (confermato, non superato), [ADR-0016](0016-tipologia-ombrellone.md) (vincoli di dominio, invariati),
  [ADR-0019](0019-app-shell-e-ux.md)/[ADR-0051](0051-responsive-drawer-e-telefono-graceful.md) (drawer
  contestuale sotto `lg`), [ADR-0020](0020-resa-mappa.md) (anatomia `UmbrellaCell`)
- **Spec:** [2026-07-22-struttura-cantiere-design.md](../../superpowers/specs/2026-07-22-struttura-cantiere-design.md)

## Context

L'editor struttura (`EstablishmentStructureView`, spec [2026-07-04](../../superpowers/specs/2026-07-04-stabilimento-configura-struttura-design.md))
era funzionale ma in debito UX: ogni azione passava da un modale (nessun inline), il feedback era
incoerente (toast solo su generate/nuova-fila), i contatori dell'overview restavano stale (le
mutation non invalidavano `establishmentOverview`), l'empty-state prometteva un «setup guidato» mai
implementato, e l'editor era visivamente disallineato dalla Mappa (chip grigi tondi contro la scena
«Riva» e la Tessera del rework [2026-07-21](../../superpowers/specs/2026-07-21-map-redesign-riva-design.md)).
Svuotare una fila richiedeva N delete singoli, ognuno con `ConfirmDialog`.

Le priorità emerse in brainstorming erano: anteprima viva della spiaggia, meno modali/più inline,
operazioni bulk.

## Decision

**Modello d'interazione = canvas + ispettore («il Cantiere»).** La scena «Riva» **a riposo** (stessi
mattoni di `map-scene.css`: mare, bagnasciuga, sabbia, toolbar vetro sticky) è l'editor stesso; un
ispettore laterale ospita form e azioni contestuali per la selezione corrente. Scartate in
brainstorming: WYSIWYG puro (form densi mutilati in popover), liste+anteprima (doppia
rappresentazione, editor ancora astratto).

- **Il paradigma resta «per form + numerazione automatica» — [ADR-0014](0014-setup-mappa-strutturato.md)
  confermato, non contraddetto**: cambia *dove* vivono i form (ispettore in scena, non modali), non
  il modello. Niente drag&drop/planimetria: restano deferiti ([D-005](../deferred.md),
  [D-038](../deferred.md)).
- **Tipologie nell'ispettore-radice «Spiaggia»** (pannello di default a selezione vuota, CRUD
  inline). La toolbar della scena naviga la spiaggia (tab settori, ricerca implicita via selezione),
  non gestisce entità.
- **Bulk con semantica «salta e riporta»**, speculare al `generate` esistente: **mai 409 sul
  batch**. Due endpoint dedicati nel modulo `establishment/umbrellas` (`@Roles(Role.Admin)` +
  `forTenant`, transazionali):
  - `POST /establishment/umbrellas/bulk-delete` — elimina gli ombrelloni del tenant senza
    prenotazioni; quelli con prenotazioni (o id estranei al tenant, mai trovati) vengono **saltati**
    e conteggiati in `skipped`. Risposta `{ deleted, skipped }`.
  - `POST /establishment/umbrellas/bulk-assign-type` — assegna `umbrellaTypeId` (`null` = Normale)
    agli id del tenant; tipologia estranea → 422 (come il create singolo). Risposta `{ updated }`.
  - «Svuota fila» **riusa** `bulk-delete` con tutti gli id della fila lato FE: nessun endpoint
    per-fila ad hoc, un solo punto di verità per lo svuotamento bulk.
- **Multi-select = modalità «Seleziona» esplicita** in toolbar (`aria-pressed`) **+ Maiusc+clic**
  che attiva la modalità al volo (la sola scorciatoia da tastiera non è scopribile né disponibile su
  touch). `Esc` esce e svuota la selezione, **con guardia**: se un `ConfirmDialog`/dialog è aperto
  sopra il pannello, `Esc` annulla solo la conferma (gestita dal primitivo reka-ui) e non collassa
  anche pannello/selezione sottostanti. La selezione non persiste al cambio settore/vista.
- **`ConfirmDialog` riservato al distruttivo**: elimina settore/fila/ombrellone/tipologia, svuota
  fila, elimina in blocco. Tutto il resto (rinomina, salva forma, crea, genera, assegna tipologia in
  blocco) è inline senza interruzioni, salvataggio **esplicito** (submit del form del pannello, non
  autosave), con `:loading` sul bottone e **toast su ogni esito** — crea/rinomina/elimina/bulk,
  chiudendo l'incoerenza di feedback della v1. Ogni mutation invalida sia `establishmentStructure`
  sia `establishmentOverview`, chiudendo i contatori stale della pagina Stabilimento.
- **Layout responsive coerente con [ADR-0051](0051-responsive-drawer-e-telefono-graceful.md)**:
  `lg+` grid a due colonne (scena + ispettore fisso in colonna `--color-raised`); sotto `lg`
  l'ispettore vive nel `Drawer` ui-kit in overlay, aperto alla selezione e chiuso = deselezione —
  stesso pattern del dettaglio mappa.

Vincoli di dominio invariati (ADR-0016): label = numero fisico reale unico per stabilimento (buchi
ammessi), tipologia ortogonale, `null` = Normale non creabile/eliminabile, niente prezzi
nell'editor (prezzo per posizione resta [D-018](../deferred.md)), guardie di cancellazione
block-409 (mai cascade) — invariate anche nel bulk-delete, che *salta* invece di 409-are.

## Consequences

### Positive

- **Un solo punto di verità per l'anatomia della Tessera**: `UmbrellaCell.slotStates` diventa
  **opzionale** (estensione additiva, API invariata per i chiamanti Mappa) — omesso/`null` → resa
  «rest» (riempimento neutro `--color-warm-025`, ink `--color-ink-700`, nessuno stato). L'editor non
  può driftare visivamente dalla Mappa perché usa lo stesso componente.
- **Zero duplicazione dei mattoni Riva**: `structure-scene.css` (editor-specifico) affianca
  `map-scene.css` (mare/bagnasciuga/sabbia/toolbar, riusato cross-feature) invece di reimplementarli.
- **2 endpoint bulk transazionali** sostituiscono N delete singoli senza atomicità: «svuota fila» e
  multi-select condividono `bulk-delete`.
- Contatori dell'overview sempre coerenti con la struttura (invalidazione sistematica).
- Empty-state con setup guidato reale (card «Crea un settore · Aggiungi una fila · Genera gli
  ombrelloni» sulla sabbia visibile); dopo il primo settore, la guida prosegue **in scena** tramite
  le affordance ghost (fila/cella tratteggiate con hint), non un wizard separato.

### Negative / Trade-off

- Il monolite `EstablishmentStructureView` (spec 07-04, 424 righe / 5 flussi CRUD / 5 modali) si
  scompone in shell + `StructureScene` + `StructureRow` + 8 pannelli ispettore + composable esteso:
  più file da orientarsi, ma ciascuno a responsabilità singola (l'estrazione tracciata in
  [D-040](../deferred.md) è di fatto realizzata da questo redesign, benché non fosse il suo scopo
  primario).
- L'API di `UmbrellaCell` si espande di un parametro opzionale (`slotStates?`): accettabile, stesso
  pattern di espansione additiva già usato altrove nel design system.
- `bulk-assign-type` non distingue in risposta gli id estranei al tenant (silenziosamente non
  aggiornati, nessun errore) — coerente con la semantica «salta», ma meno esplicito di un conteggio
  dedicato; non è emerso come problema nel dominio (id sempre generati lato client dalla selezione in
  scena, mai digitati).

### Neutre / Note

- [D-005](../deferred.md) (planimetria a coordinate libere) e [D-038](../deferred.md)
  (drag-reorder/re-parent) restano **deferiti**: questo ADR non li tocca, il paradigma per-form +
  numerazione automatica resta la via principale di costruzione della struttura.
- Il settore «Speciali» resta un tab come gli altri nell'editor (contesto di editing, un settore alla
  volta) — diverge deliberatamente dalla convenzione della Mappa (blocco sempre in coda): contesti
  d'uso diversi, non un'incoerenza da correggere.

## Rubric check

1. **Professionalità** — canvas+ispettore è il pattern consolidato per editor «vivi» (Figma-like)
   applicato a un dominio molto più semplice: niente sovra-ingegneria, la scena resta la stessa Riva
   della Mappa.
2. **Convenzioni** — riuso di `map-scene.css`, `Drawer`/`ConfirmDialog` ui-kit, `mutationResource`
   con toast/errore di default, `forTenant` + `@Roles(Role.Admin)` sui nuovi endpoint: nessun pattern
   nuovo introdotto, solo applicato a una superficie nuova.
3. **Modularità** — `UmbrellaCell` resta l'unica sorgente dell'anatomia Tessera (estensione additiva,
   non una seconda implementazione); i due endpoint bulk sono generici (id-based), riusati sia da
   «svuota fila» sia da multi-select, invece di un endpoint per-fila ad hoc.
4. **Zero debito** — chiude tre debiti pregressi della spec 07-04 (feedback incoerente, contatori
   overview stale, setup guidato promesso e mai fatto); i deferiti restano tracciati e con trigger
   espliciti in [deferred.md](../deferred.md).
