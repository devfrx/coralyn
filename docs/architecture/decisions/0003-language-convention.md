# ADR-0003: Convenzione linguistica — codice EN, dominio IT, docs IT

- **Status:** Accepted
- **Data:** 2026-06-27
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0002](0002-decision-rubric.md), [glossario](../glossary.md)

## Context

Il prodotto opera in un dominio fortemente italiano (lidi balneari): termini come
*ombrellone, fila, abbonamento, cabina, stabilimento, bagnino* sono il linguaggio
reale del business. Allo stesso tempo, codice e strumentazione tecnica seguono per
convenzione l'inglese. Scegliere a caso, o mischiare in modo incoerente, genera
debito di rinomina e attrito cognitivo. La decisione va presa una volta e applicata
ovunque.

## Decision

- **Codice tecnico in inglese**: nomi di variabili, funzioni, classi
  infrastrutturali, file, branch, commit message, API tecniche, commenti.
- **Termini di dominio in italiano**, preservati come *ubiquitous language* (DDD):
  le entità e i concetti di business mantengono il nome italiano quando tradurli
  ne snaturerebbe il significato. Esempi: `Ombrellone`, `Abbonamento`, `Fila`,
  `Stabilimento`, `Cabina`. Questi termini sono trattati come nomi propri del
  dominio, non tradotti.
- **Documentazione (ADR, spec, README) in italiano.**
- Un **glossario** ([`glossary.md`](../glossary.md)) mantiene la mappatura e la
  definizione canonica di ogni termine di dominio, così l'uso resta coerente.

Regola pratica per i casi misti: l'inglese è il default; si passa all'italiano solo
per un concetto di dominio presente nel glossario. Es. `class Ombrellone`,
`ombrelloneRepository`, `getOmbrelloneById()`.

## Consequences

### Positive
- Fedeltà al dominio e al linguaggio reale degli utenti (riduce errori di analisi).
- Codice infrastrutturale allineato alle convenzioni internazionali.
- Confine chiaro su quando usare quale lingua, grazie al glossario.

### Negative / Trade-off
- Code-mixing inglese/italiano nello stesso identificatore (es.
  `getOmbrelloneById`): leggermente inusuale, ma intenzionale e regolato.
- Richiede manutenzione del glossario man mano che il dominio cresce.

### Neutre / Note
- Eventuale internazionalizzazione dell'interfaccia utente (i18n) è un tema
  separato dalla lingua del codice e sarà oggetto di un ADR dedicato se/quando
  servirà. Per ora la UI è in italiano.

## Alternatives considered

- **Tutto in inglese (dominio tradotto)** — scartata: la traduzione di termini come
  *ombrellone/abbonamento* perde sfumature e impone traduzione mentale costante tra
  business e codice.
- **Tutto in italiano (anche il codice tecnico)** — scartata: fuori convenzione,
  attrito con librerie/strumenti anglofoni, percepito come poco professionale in
  un prodotto destinato alla vendita.

## Rubric check

1. **Professionalità** — adotta l'ubiquitous language del DDD, pratica riconosciuta.
2. **Convenzioni** — rispetta la convenzione inglese per il codice tecnico e quella
   DDD per il dominio; la deroga (dominio in IT) è motivata dal valore di dominio.
3. **Modularità** — il glossario centralizza le definizioni, evitando duplicazioni
   e divergenze terminologiche tra moduli.
4. **Zero debito** — fissando ora la regola si evita il debito di rinomina futuro;
   nessun compromesso aperto.
