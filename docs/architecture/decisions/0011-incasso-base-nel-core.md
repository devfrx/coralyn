# ADR-0011: Registrazione incasso "base" nel Core

- **Status:** Accepted
- **Data:** 2026-06-27
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0006](0006-dominio-prenotazioni-e-pricing.md), [D-004](../deferred.md), [D-009](../deferred.md)

## Context

Il modulo Cassa completo è rimandato (modulo 2). Tuttavia un gestionale che non sa
dire *se una prenotazione è pagata* non è realmente utilizzabile per gestire una
giornata: lo staff dovrebbe tracciare i pagamenti a parte. Serve capire quanto della
"cassa" è indispensabile nell'MVP senza invadere il modulo dedicato né il fiscale.

## Decision

Includiamo nel Core la **registrazione incasso "base"**, come **stato della
Prenotazione** di proprietà del modulo `prenotazioni`:

- Campi sulla `Prenotazione`: `stato_pagamento` ∈ {`non_pagato`, `parziale`,
  `saldato`}, `importo_incassato`, `metodo_pagamento` (contanti/carta/bonifico/altro),
  `data_incasso`.

**Esplicitamente fuori** (restano al modulo Cassa, modulo 2):
- Ricevute/scontrini, chiusura cassa giornaliera, riconciliazione.
- **Conformità fiscale** (corrispettivi telematici) → [D-004](../deferred.md).
- Processing pagamenti elettronici / POS.
- Entità `Pagamento` ricca (acconti multipli, rimborsi, storni) → [D-009](../deferred.md).

## Consequences

### Positive
- L'MVP diventa **usabile per davvero**: lo staff sa chi ha pagato e quanto.
- Confine netto: lo *stato di pagamento* è una proprietà della prenotazione; la
  *gestione cassa* è un modulo a parte.

### Negative / Trade-off
- Quando arriverà l'entità `Pagamento` completa ([D-009](../deferred.md)), i campi
  base sulla Prenotazione verranno migrati/estesi: migrazione contenuta e prevista,
  non debito silenzioso.

## Alternatives considered

- **Nessun pagamento nel Core** — scartata: MVP non utilizzabile per gestire una
  giornata reale; lo staff terrebbe i pagamenti su carta accanto al software.
- **Entità `Pagamento` completa già nell'MVP** — scartata (YAGNI): introduce acconti,
  ricevute e fiscale, cioè il modulo Cassa; over-scope per l'MVP.

## Rubric check

1. **Professionalità** — tracciare lo stato di pagamento è operatività di base attesa.
2. **Convenzioni** — stato di pagamento come attributo della prenotazione è prassi
   comune; la cassa/fiscale come modulo separato pure.
3. **Modularità** — campi minimi in `prenotazioni`; ricevute/chiusura/fiscale isolati
   nel modulo Cassa.
4. **Zero debito** — niente cassa completa improvvisata nel Core; l'evoluzione verso
   `Pagamento` è tracciata in [D-009](../deferred.md).
