# ADR-0019: App-shell e pattern UX — sezioni, drawer contestuale, responsive

- **Status:** Accepted
- **Aggiornamento (2026-07-21):** la sezione **Responsive desktop ↔ tablet** (rail di icone +
  bottom-sheet) è **emendata da [ADR-0051](0051-responsive-drawer-e-telefono-graceful.md)**: sotto
  `lg` la nav è un **drawer off-canvas** (hamburger) e il telefono è target *graceful*; il pannello
  mappa resta **impilato** (bottom-sheet deferito, [D-054](../deferred.md)). L'impianto dell'app-shell
  (sezioni, card, drawer contestuale della mappa, routing) resta invariato.
- **Data:** 2026-06-28
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0004](0004-form-factor-e-delivery.md) (web+PWA, desktop+tablet), [ADR-0005](0005-modello-mappa.md)/[ADR-0014](0014-setup-mappa-strutturato.md) (Mappa come home), [ADR-0015](0015-osservabilita-e-console-superuser.md) (console superuser), [ADR-0017](0017-design-system-frontend.md) (design system), [ADR-0020](0020-resa-mappa.md) (resa mappa)

## Context

[ADR-0004](0004-form-factor-e-delivery.md) fissa web+PWA responsive **desktop + tablet**; il
design del Core indica un'app **a sezioni** con la **Mappa come home** e un **drawer
contestuale** (mockup `main-screen`). Vanno fissati l'impianto dell'app-shell, il pattern del
drawer e il comportamento responsive, coerenti col design system ([ADR-0017](0017-design-system-frontend.md)).

## Decision

**App-shell a sezioni, layout "a card".**

- **Topbar** (brand/stabilimento, navigatore data, ricerca cliente, utente) + **sidebar** di
  navigazione a sezioni: **Mappa** (home), **Prenotazioni**, **Clienti**, **Listino**,
  **Report**. La **Console superuser** è una voce **separata** in fondo, visibile **solo** al
  ruolo `superuser` ([ADR-0015](0015-osservabilita-e-console-superuser.md)).
- Ogni regione persistente (topbar, sidebar, area contenuto) è una **card** arrotondata su una
  **tela neutra**, con gutter e ombre soft.
- **Drawer contestuale**: pannello **in overlay** sull'area contenuto, **aperto al bisogno**
  (es. clic su un ombrellone), **non** una colonna fissa. Costruito sul primitivo headless
  dialog/drawer ([ADR-0017](0017-design-system-frontend.md), Reka UI): focus trap, ESC, ARIA.
- **Routing**: una rotta per sezione; lo stato del drawer è **effimero** (selezione corrente),
  non una rotta primaria.

**Responsive desktop ↔ tablet:**
- **Desktop**: sidebar piena; drawer come pannello laterale in overlay.
- **Tablet**: la sidebar collassa a **rail di icone** (espandibile); il drawer diventa un
  **bottom-sheet** trascinabile. Densità e breakpoint tarati sui due contesti (cassa fissa /
  spiaggia in movimento, [ADR-0004](0004-form-factor-e-delivery.md)); target di tocco ≥ 44px.

**PWA** ([ADR-0004](0004-form-factor-e-delivery.md)): app installabile, **shell in cache** per
consultazione offline-light; il sync completo è rimandato ([D-008](../deferred.md)).

## Consequences

### Positive
- Un solo impianto per i due contesti d'uso (cassa + spiaggia); navigazione prevedibile.
- Drawer **accessibile** (primitivo headless) che **non spreca spazio** quando non serve.
- Coerente col design system e riusabile dal booking online (stesso pattern di app-shell).

### Negative / Trade-off
- Il layout a card + bottom-sheet su tablet richiede **cura nel responsive** (test sui due
  breakpoint).

### Neutre / Note
- Mockup aggiornato in `docs/design/mockups/` ([ADR-0009](0009-documentazione-di-design.md)).
  La resa specifica della Mappa è in [ADR-0020](0020-resa-mappa.md).

## Alternatives considered

- **Drawer come colonna fissa** (terza colonna sempre presente) — scartata: spreca spazio
  quando nessun ombrellone è selezionato; il drawer è contestuale per natura.
- **Navigazione a tab in alto** invece della sidebar — scartata: con 5+ sezioni più la console
  la sidebar scala meglio e libera la topbar per data/ricerca.
- **Drawer come rotta dedicata** — scartata per l'MVP: la selezione è effimera; una rotta
  aggiunge complessità senza valore (il deep-link al singolo ombrellone è valutabile in futuro).

## Rubric check

1. **Professionalità** — pattern di app-shell standard per i gestionali; drawer accessibile.
2. **Convenzioni** — sezioni + drawer contestuale è prassi consolidata; coerente col mockup
   validato.
3. **Modularità** — app-shell, sezioni e drawer come unità separate; la console superuser è una
   voce **isolata e gated** per ruolo.
4. **Zero debito** — niente colonna fissa sprecata; il drawer poggia su un primitivo headless
   (a11y non reinventata); l'offline completo è tracciato ([D-008](../deferred.md)).
