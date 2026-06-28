# Design del prodotto

Diagrammi e mockup **versionati e tenuti aggiornati** (vedi
[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)).

- [data-model.md](data-model.md) — modello dati / ER (Mermaid) + invarianti.
- [flows.md](flows.md) — flussi principali e stati (Mermaid).
- [design-system.md](design-system.md) — token (primitive → semantic) e linguaggio dei
  componenti del FE (`ui-kit`): spec d'implementazione di ADR-0017–0020.
- [mockups/](mockups/) — snapshot HTML delle schermate:
  [frontend-app-shell](mockups/frontend-app-shell.html) — **design FE corrente** (app-shell + mappa, ADR-0017–0020) ·
  [main-screen](mockups/main-screen.html) — *storico* (direzione Core iniziale, superato dal precedente per il FE).

I diagrammi mostrano lo **stato corrente** del design; il **perché** delle scelte sta
negli [ADR](../architecture/decisions/). Aggiornare questi file fa parte della
Definition of Done di ogni modifica che tocca dominio o UI.
