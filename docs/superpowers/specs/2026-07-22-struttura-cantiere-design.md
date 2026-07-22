# Spec — Overhaul editor «Struttura della spiaggia»: il Cantiere (scena Riva + ispettore contestuale) · 2026-07-22

> **Stato:** design approvato in brainstorming (2026-07-22, tutte le sezioni §A-§F confermate dall'utente).
> **Skills attive:** dev-discipline · dev-communication · frontend-design · brainstorming.
> **Mockup approvato:** [`docs/design/mockups/struttura-redesign-esplorazione.html`](../../design/mockups/struttura-redesign-esplorazione.html)
> (direzione «Cantiere» scelta dall'utente; interattivo: pannelli ispettore, stato vuoto, selezione).
> **Ambito:** SOLO `EstablishmentStructureView` (`/establishment/structure`). Impostazioni lido e Mappa fuori
> (la Mappa ha il rework «Riva» fresco del 21/07 — non si ritocca; resta il suo refactor strutturale, tracciato a parte).

## 1. Contesto & problema

L'editor struttura (spec [2026-07-04](2026-07-04-stabilimento-configura-struttura-design.md)) è funzionale ma
in debito UX profondo: **ogni azione passa da 5 modali** (nessun inline), feedback incoerente (toast solo su
generate/nuova-fila), **contatori overview stale** (le mutation non invalidano `establishmentOverview`),
empty-state scarni («setup guidato» promesso nel sottotitolo ma inesistente), e **disallineamento visivo con
la Mappa**: l'editor mostra chip grigi tondi mentre la Mappa ha la scena «Riva» e la Tessera. Per svuotare una
fila oggi servono N delete singoli, ognuno con ConfirmDialog.

Priorità utente (brainstorming): **anteprima viva della spiaggia** · **meno modali, più inline** ·
**operazioni bulk** («svuotare le file subito, non ripetere le operazioni all'infinito»).

## 2. Decisioni risolte (brainstorming 2026-07-22)

- **Modello d'interazione = canvas + ispettore** («Cantiere»): la scena Riva a riposo è l'editor, l'ispettore
  laterale ospita form e azioni contestuali. Scartati: WYSIWYG puro (form densi mutilati nei popover → debito),
  liste+anteprima (pigra: doppia rappresentazione, editor ancora astratto).
- **Tipologie nell'ispettore-radice «Spiaggia»** (pannello di default a selezione vuota). La toolbar naviga la
  spiaggia, non gestisce entità.
- **Bulk = endpoint backend dedicati** (no iterazione FE di delete singoli: N richieste, niente atomicità).
  Semantica «salta i protetti» speculare al `generate`.
- **Multi-select = modalità «Seleziona» esplicita in toolbar + scorciatoia Maiusc+clic** (la sola scorciatoia
  è invisibile su touch e non scopribile).
- **Il paradigma resta «per form + numerazione automatica»** (ADR-0014 non contraddetto): cambia *dove* vivono
  i form (ispettore in scena, non modali), non il modello. Niente drag&drop/planimetria (D-005/D-038 restano).
- Vincoli di dominio invariati (ADR-0016): label = numero fisico reale unico per stabilimento, buchi ammessi;
  tipologia ortogonale, `null` = Normale non creabile/eliminabile; **niente prezzi nell'editor** (prezzo per
  posizione, D-018 resta); guardie di cancellazione block-409, mai cascade.

## 3. §A — Layout della vista

- Rotta e gating invariati (admin-only, guard esistente).
- Header snello: back «‹ Stabilimento», titolo, **riga-meta contatori live** («2 settori · 3 file · 26
  ombrelloni · 2 tipologie»). Le 4 Card contatore attuali **rimosse** (ridondanti con meta + pannello-radice).
- Shell `lg+`: grid `[1fr 320px]` — scena + **ispettore** (colonna `--color-raised`, bordo sinistro).
- **Sotto `lg`: ispettore in `Drawer` overlay** (ui-kit) aperto alla selezione, chiuso = deselezione.
  Coerente con ADR-0019/0051 (stesso pattern del dettaglio mappa).
- Loading: skeleton-scena con `useDelayedLoading`, `aria-busy` su wrapper non-hidden, contenuto in
  `v-else-if` (regole design-system §10).

## 4. §B — La scena «Cantiere»

- **Riuso dei mattoni di `map-scene.css`** (mare+velature, bagnasciuga, sabbia con grana, toolbar vetro
  sticky). Stili editor-specifici in file affiancato (`structure-scene.css`), zero duplicazione dei blocchi Riva.
- **Toolbar**: tab settori con conteggio posti (niente occupazione: qui non esistono prenotazioni), tab ghost
  «+ Settore», toggle **«Seleziona»** (`aria-pressed`).
- **Tessera «a riposo»**: stessa anatomia della cella mappa (40px, radius 12, `--shadow-sun`, glare, badge
  tipologia) con riempimento neutro `--color-warm-025`, ink `--color-ink-700`. **Implementazione: estensione
  additiva di `UmbrellaCell`** — `slotStates` opzionale; omesso → resa «rest». Un'unica fonte dell'anatomia
  Tessera: l'editor non può driftare dalla Mappa. (I 6+ spec della cella si estendono, non si riscrivono.)
- **Fila**: rail sinistro (`FILA n` cliccabile, conteggio, azioni rapide su hover: genera ⚡ / rinomina ✎ /
  svuota-elimina 🗑 — scorciatoie delle stesse azioni del pannello ispettore), celle al centro, **ghost «+»**
  in coda alla fila.
- **Ghost-affordance** (creazione in-place): cella «+» → pannello «Nuovo ombrellone» su quella fila; fascia
  tratteggiata «+ Nuova fila» in coda al settore; tab «+ Settore». Tratteggio `--color-border-input`, hover
  coral (`--color-coral-050` + `--color-brand-ink`).
- **Selezione**: cella → anello coral identico alla mappa (outline `--color-brand` + alone tint); fila →
  inset ring sul blocco; settore → tab attiva. Click sulla sabbia nuda → deseleziona (pannello «Spiaggia»).
- **Settore Speciali**: è un tab come gli altri (contesto di *editing*, un settore alla volta; la Mappa
  mantiene la sua convenzione del blocco in coda — contesti diversi). NB: la Mappa discrimina «Speciali» per
  nome-stringa (`MapView` ~L52) invece che per `kind` — difetto pre-esistente, fuori scope qui, tracciato in §10.

## 5. §C — L'ispettore

Un pannello visibile alla volta (eyebrow + titolo + crumb «Settore X · …»):

| Pannello | Contenuto |
|---|---|
| **Spiaggia** (default) | Stat 2×2 (settori/file/ombrelloni/tipologie), lista **Tipologie** con CRUD inline nel pannello (niente modale), hint d'uso |
| **Settore** | Nome, disposizione (griglia/speciali), danger-zone «Elimina settore» |
| **Fila** | Etichetta, **generatore** (prefisso/da numero/quantità/tipologia + anteprima live, clamp 1..60 invariato), danger-zone «**Svuota fila (N)**» + «Elimina fila» |
| **Ombrellone** | Etichetta (hint «numero fisico reale, unico»), tipologia, Salva, Elimina |
| **Selezione multipla** | Conteggio + chip etichette (aria-live polite), «Assegna tipologia a tutti», «Elimina N» |
| **Nuovo settore / Nuova fila / Nuovo ombrellone** | Form di creazione; «Nuova fila» conserva il compose crea-fila + generate (due chiamate, guardia anti doppio-create invariata) |

Trasversali:
- Salvataggio **esplicito** (Enter = submit del form del pannello), pending con `:loading` sul bottone.
- **Toast su ogni esito** (crea/rinomina/elimina/bulk — chiude l'incoerenza attuale). Errori 409/422/404 →
  toast del server (default `mutationResource`, invariato).
- **Invalidazione: `establishmentStructure` + `establishmentOverview`** su ogni mutation (chiude i contatori
  stale della pagina Stabilimento — era previsto dalla spec 07-04 §6 e mai implementato).
- `ConfirmDialog` **solo** per il distruttivo: elimina settore/fila/ombrellone/tipologia, svuota fila,
  elimina bulk. Tutto il resto è inline senza interruzioni.

## 6. §D — Selezione multipla e bulk

**FE**: in modalità «Seleziona» il click su una cella aggiunge/toglie dalla selezione (`aria-pressed` per
cella); Esc esce e svuota; Maiusc+clic attiva la modalità al volo. La selezione vive nello stato della vista
(non persiste al cambio settore).

**Backend (additivo, convenzioni del modulo `establishment/`, tutto `@Roles(Role.Admin)` + `forTenant`)**:

```ts
// contracts (additivo)
export interface BulkDeleteUmbrellasInput { ids: string[] }          // 1..200, uuid v4 each
export interface BulkDeleteUmbrellasResultDTO { deleted: number; skipped: number }
export interface BulkAssignUmbrellaTypeInput { ids: string[]; umbrellaTypeId: string | null }
export interface BulkAssignUmbrellaTypeResultDTO { updated: number }
```

- **`POST /establishment/umbrellas/bulk-delete`** → elimina in **una transazione** gli ombrelloni del tenant
  senza prenotazioni (`booking.count == 0`); quelli protetti vengono **saltati** (mai 409 sul batch: la
  semantica è «fai il possibile e riporta», speculare al generate). Id estranei al tenant → ignorati nel
  conteggio skipped. Risposta `{ deleted, skipped }`.
- **`POST /establishment/umbrellas/bulk-assign-type`** → assegna `umbrellaTypeId` (null = Normale) agli id
  del tenant; tipologia estranea → 422 (come il create singolo). Risposta `{ updated }`.
- **«Svuota fila» = bulk-delete con tutti gli id della fila** (FE): un solo endpoint per svuota-fila e
  multi-select, niente API per-fila ad hoc.
- Toast riepilogo: «Eliminati 5 · saltati 1 (con prenotazioni)» / «Tipologia assegnata a 4 ombrelloni».

## 7. §E — Setup guidato ed empty-state

- **Spiaggia vuota** (0 settori): 3 card-passo sulla sabbia — 1. Crea un settore · 2. Aggiungi una fila ·
  3. Genera gli ombrelloni — stato derivato dall'albero (passi completati/attivi/futuri); il passo attivo
  apre il pannello di creazione corrispondente. La scena (mare/sabbia) resta visibile: si costruisce *sulla*
  spiaggia. Mantiene la promessa «setup guidato».
- Settore senza file → ghost-fila con hint; fila senza ombrelloni → ghost-cella con hint. Niente wizard
  separato: la scena guida.

## 8. §F — Architettura FE e scomposizione

Il monolite (424 righe, 5 flussi CRUD + 5 modali) si scompone nella cartella feature:

- `EstablishmentStructureView.vue` — shell: query, stato selezione (`selection: {kind, id[]} | null`),
  layout 2 colonne / drawer.
- `StructureScene.vue` — scena (mare/toolbar/sabbia), tab settori, modalità Seleziona; emette gli intenti.
- `StructureRow.vue` — rail + celle + ghost della singola fila.
- `panels/` — un SFC per pannello ispettore (`BeachPanel`, `SectorPanel`, `RowPanel`, `UmbrellaPanel`,
  `MultiPanel`, `SectorCreatePanel`, `RowCreatePanel`, `UmbrellaCreatePanel`).
- `useEstablishmentStructure.ts` — +2 mutation bulk; **tutte** le mutation invalidano anche l'overview.
- ui-kit: `UmbrellaCell` con `slotStates?` (resa «rest» se omesso) — estensione additiva, API invariata
  per i chiamanti mappa.

## 9. A11y

- Celle: `<button aria-label="Ombrellone A3, fila Fila 1, settore Centro">`, `aria-pressed` (selezione).
- Multi-select: conteggio in `aria-live="polite"`; toggle «Seleziona» con `aria-pressed`.
- Pannelli ispettore: `region` con heading; sotto `lg` il Drawer porta focus-trap/Esc dal primitivo.
- Ghost: label esplicite («Aggiungi ombrellone alla fila 1»). Focus ring `--ring-focus` ovunque.
- Skeleton scena: `aria-busy` su wrapper non-hidden (design-system §10).

## 10. Test & doc (stesso lavoro, ADR-0009)

- **FE**: i 18 spec di `EstablishmentStructureView` si riscrivono per componente (cambia il paradigma:
  selezione→ispettore al posto di bottoni→modali); nuovi spec per pannelli, scena, multi-select, setup
  guidato, bulk (MSW). Spec `UmbrellaCell` estesi con la resa «rest». Regola cross-file: intera suite
  web-staff + typecheck.
- **API**: unit per `bulk-delete` (skip prenotati, tenant-scope, transazione) e `bulk-assign-type` (422
  estranea); e2e matrice 401/403/400/404 + semantica skip. Suite api completa (RolesGuard globale).
- **Docs**: nuovo **ADR-0052 «Editor Cantiere»** (canvas+ispettore; per-form confermato; bulk semantics);
  design-system.md — sezione nuova «L'editor Struttura (Cantiere)» + aggiornamento voce UmbrellaCell (§13.1)
  e nota sull'estensione; questo spec linkato.
- **Verifica visiva finale** in browser (scena, ispettore, drawer <lg, selezione, guidato): login utente.

**Fuori scope, tracciati**: riordino drag (D-038), re-parent fila/ombrellone, planimetria pixel (D-005),
prezzo-per-tipo (D-018), refactor `MapView` 533 righe (booking fuori dalla mappa) e fix della discriminazione
«Speciali» per nome anziché `kind` in MapView — da battezzare come follow-up a sé.

## 11. Sequencing / DoD

- Baseline da non regredire: web-staff **501/501** · web-platform 17/17 · web-customer 25/25 · api suite
  verde · typecheck pulito sui 4 workspace (post `3cdb53c`).
- Nessuna migrazione DB (il modello dati non cambia). Contracts additivi.
- Ordine di build atteso (per il piano): contracts+api bulk → ui-kit UmbrellaCell rest → scena+shell →
  pannelli → multi-select+bulk FE → guidato/empty → docs. Ogni task verde sull'intera suite del pacchetto.
- Merge su `main` = FF con ok esplicito, prova visiva utente prima del merge.
