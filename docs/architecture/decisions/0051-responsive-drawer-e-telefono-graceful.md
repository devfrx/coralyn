# ADR-0051: Responsive `web-staff` — nav a drawer sotto `lg`, telefono target graceful (emenda ADR-0019/ADR-0004)

- **Status:** Accepted
- **Data:** 2026-07-21
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0004](0004-form-factor-e-delivery.md) (form factor, emendato),
  [ADR-0019](0019-app-shell-e-ux.md) (app-shell, emendato nella parte responsive),
  [ADR-0017](0017-design-system-frontend.md) (ui-kit), [ADR-0033](0033-astrazione-componenti-frontend.md)

## Context

Il 2026-07-21 `web-staff` è stata resa **responsive app-wide** (spec
[2026-07-21-web-staff-responsive-design](../../superpowers/specs/2026-07-21-web-staff-responsive-design.md),
mergiata in `main` fino a `f7d71ed`): contratto di breakpoint semantico **`< lg` (1024px) = compatto**
/ **`≥ lg` = esteso**, nav compatta come **drawer off-canvas** sinistro (`NavDrawer` ui-kit su
primitivo Dialog reka-ui, hamburger in topbar), griglie che collassano, `DataTable` scrollabile,
pannello mappa **impilato** sotto la mappa. Il layout compatto funziona anche **sotto 768px**
(telefono).

Questo diverge dalla strategia responsive **documentata**:

- [ADR-0019](0019-app-shell-e-ux.md) prevedeva su tablet la sidebar collassata a **rail di icone**
  (espandibile) e il pannello mappa come **bottom-sheet** trascinabile;
- [ADR-0004](0004-form-factor-e-delivery.md) metteva lo smartphone **fuori MVP** («consultazioni
  rapide»);
- `design-system.md` §9 definiva il token `--sidebar-rail: 64px` (mai implementato).

La scelta del drawer è stata presa **con l'utente** durante il brainstorming della feature, ma senza
consultare i documenti che governavano proprio quella scelta — la divergenza è emersa a lavoro
mergiato. Questo ADR **ratifica esplicitamente** lo shippato (scelta confermata dall'utente il
2026-07-21) invece di lasciare i doc a mentire.

## Decision

**Ratifichiamo il comportamento shippato.** La strategia responsive di `web-staff` è:

- **Due stati, un breakpoint**: `< lg` (1024px) = **compatto** (tablet portrait + telefono),
  `≥ lg` = **esteso** (tablet landscape + desktop). Nessun terzo stato intermedio.
- **Nav compatta = drawer off-canvas** (`NavDrawer` ui-kit, hamburger in topbar; chiusura su cambio
  route e al ritorno `≥ lg`). Il **rail di icone è abbandonato**: il token `--sidebar-rail` viene
  rimosso da `design-system.md` §9.
- **Telefono (< 768px) = target graceful**: il layout compatto deve restare **funzionante e senza
  debiti** anche a larghezza telefono, ma densità, flussi e verifiche di design restano tarati su
  desktop + tablet (che rimangono i contesti primari di [ADR-0004](0004-form-factor-e-delivery.md)).
- **Pannello mappa su compatto = impilato** sotto la mappa. Il bottom-sheet trascinabile resta una
  possibile miglioria futura, tracciata in [D-054](../deferred.md).

Portata dell'emendamento — **emenda, non supera**:

- di [ADR-0019](0019-app-shell-e-ux.md) cambia **solo** la sezione *Responsive desktop ↔ tablet*;
  restano validi app-shell a sezioni, layout a card, drawer contestuale della mappa e routing;
- di [ADR-0004](0004-form-factor-e-delivery.md) cambia **solo** la posizione sul telefono (da
  «fuori MVP» a «target graceful»); restano validi web + PWA e desktop + tablet come contesti primari.

## Consequences

### Positive

- Nessun rework di lavoro già mergiato, revisionato e verde (413/413, typecheck pulito).
- **Un solo contenuto di navigazione** (`SidebarNav`) montato dal guscio desktop o dal drawer: il
  rail avrebbe richiesto una seconda resa (icone sole + tooltip + stato espanso) da mantenere.
- Accessibilità del drawer gratuita dal primitivo Dialog (focus-trap, Esc, `aria-modal`), come già
  per `Modal`/`Drawer` ([ADR-0017](0017-design-system-frontend.md)).
- Il telefono è utilizzabile davvero (consultazione *e* operatività), non solo «degrado accettabile».

### Negative / Trade-off

- Su tablet la nav richiede **un tap in più** (drawer nascosto) rispetto al rail sempre visibile;
  accettato: la nav si usa a cambi di sezione, non di continuo, e il drawer libera larghezza utile.
- Il bottom-sheet della mappa resta non fatto ([D-054](../deferred.md)): sul tablet il dettaglio
  ombrellone impilato richiede scroll.

### Neutre / Note

- Densità touch della mappa (`--cell-size-touch`, target ≥ 44px) **invariata**: resta come da
  [ADR-0019](0019-app-shell-e-ux.md)/[ADR-0020](0020-resa-mappa.md), fuori dallo scope di questo ADR.
- Lezione di processo (registrata anche nell'handoff 2026-07-21): quando una modifica tocca una
  scelta già documentata, l'esplorazione deve includere **i doc di design/ADR**, non solo il codice.

## Alternatives considered

- **Riallineare il codice ai doc** (rail di icone + bottom-sheet) — scartata: costo di rifare
  lavoro mergiato e revisionato; con 6+ voci di nav il rail a sole icone è ambiguo senza etichette;
  il drawer con hamburger è pattern consolidato nei gestionali responsive.
- **Rail su tablet + drawer solo sotto 768px** (tre stati) — scartata: due pattern di nav da
  mantenere e testare per lo stesso prodotto, contro il contratto semplice a due stati; YAGNI senza
  un segnale reale dagli operatori su tablet.

## Rubric check

1. **Professionalità** — drawer off-canvas su hamburger è il pattern dominante per la nav sotto
   soglia nei gestionali SaaS; a11y su primitivo headless, non reinventata.
2. **Convenzioni** — segue le convenzioni interne (reka-ui solo dietro ui-kit, token semantici,
   default Tailwind `lg` senza breakpoint custom) e quelle di mercato.
3. **Modularità** — contenuto nav in un solo componente (`SidebarNav`); `NavDrawer` è un primitivo
   ui-kit riusabile; il guscio desktop e il drawer sono montaggi alternativi dello stesso contenuto.
4. **Zero debito** — niente lavoro buttato né token morti (`--sidebar-rail` rimosso); l'unico
   compromesso (bottom-sheet mappa) è tracciato in [D-054](../deferred.md) con trigger esplicito.
