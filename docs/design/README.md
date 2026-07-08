# Design del prodotto

Diagrammi e mockup **versionati e tenuti aggiornati** (vedi
[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)).

- [data-model.md](data-model.md) — modello dati / ER (Mermaid) + invarianti.
- [flows.md](flows.md) — flussi principali e stati (Mermaid); include la **sospensione abbonamento**
  (macchina a stati + carve sulla copertura, D-013).
- [design-system.md](design-system.md) — token (primitive → semantic) e linguaggio dei
  componenti del FE (`ui-kit`): spec d'implementazione di ADR-0017–0020.
- [mockups/](mockups/) — snapshot HTML delle schermate:
  [Coralyn.dc.html](mockups/Coralyn.dc.html) — **design FE corrente** ("Mediterraneo Caldo",
  [ADR-0027](../architecture/decisions/0027-coralyn-linguaggio-visivo.md)); bundle renderizzato:
  [`Coralyn - Gestionale Lidi.html`](../../Coralyn%20-%20Gestionale%20Lidi.html) ·
  [subscription-suspension-modal.html](mockups/subscription-suspension-modal.html) — **sospensione abbonamento**
  (card Scheda + modali Sospendi/Riattiva, D-013; *design, non ancora implementata*) ·
  [frontend-app-shell.html](mockups/frontend-app-shell.html) — *storico* (direzione "Costiero professionale", superato da Coralyn) ·
  [main-screen.html](mockups/main-screen.html) — *storico* (direzione Core iniziale) ·
  [gestionale-lidi-aspirazionale.html](mockups/gestionale-lidi-aspirazionale.html) — **aspirazionale**, *non* lo
  stato corrente: mostra tier di prezzo e badge marketing **rifiutati** (una `Rate` = un prezzo,
  [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md); honesty-pass Slice A), orari fascia
  (→ Slice B) ed equipment custom (→ Slice C) non ancora nel modello.

I diagrammi mostrano lo **stato corrente** del design; il **perché** delle scelte sta
negli [ADR](../architecture/decisions/). Aggiornare questi file fa parte della
Definition of Done di ogni modifica che tocca dominio o UI.
