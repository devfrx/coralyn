# ADR-0001: Adottare gli Architecture Decision Records (ADR)

- **Status:** Accepted
- **Data:** 2026-06-27
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0002](0002-decision-rubric.md)

## Context

Il progetto è un gestionale SaaS per lidi balneari, pensato come prodotto
commerciale e quindi destinato a evolvere nel tempo e potenzialmente a essere
mantenuto da più persone. Le decisioni architetturali e di dominio prese senza
traccia scritta tendono a essere dimenticate, ridiscusse o violate
inconsapevolmente. Serve un meccanismo leggero ma rigoroso per registrare
**cosa** è stato deciso e soprattutto **perché**, incluse le decisioni rimandate
e i cambi di rotta.

## Decision

Adottiamo gli **Architecture Decision Records (ADR)** in stile MADR-lite.

- Ogni decisione significativa è un file numerato e **immutabile** in
  `docs/architecture/decisions/`, con nome `NNNN-titolo-kebab.md`.
- Il formato segue [il template](0000-template.md): Status, Context, Decision,
  Consequences, Alternatives considered, Rubric check.
- Gli stati ammessi sono: `Proposed`, `Accepted`, `Deprecated`, `Superseded`.
- Un **cambio di rotta non si cancella**: si crea un nuovo ADR che *supersedes*
  il precedente. Il vecchio viene marcato `Superseded by ADR-NNNN` con link
  bidirezionale, preservando storia e motivazioni.
- Le **decisioni rimandate** vivono in `docs/architecture/deferred.md` finché non
  vengono affrontate; a quel punto diventano un ADR.
- La **vista d'insieme aggiornata** vive in `docs/architecture/README.md`, che
  linka agli ADR per i "perché".
- Ogni decisione architetturale prende un commit git atomico dedicato.

## Consequences

### Positive
- Storia delle decisioni tracciabile e motivata.
- Onboarding di nuovi sviluppatori più rapido.
- I cambi di rotta restano comprensibili anche a distanza di tempo.

### Negative / Trade-off
- Richiede disciplina: ogni decisione rilevante va scritta prima di procedere.
- Leggero overhead di scrittura.

### Neutre / Note
- Gli ADR documentano *decisioni*, non *istruzioni operative*: il "come si fa" sta
  nel codice e nei README di modulo.

## Alternatives considered

- **Nessuna documentazione formale** — scartata: porta a perdita di contesto e
  debito decisionale, in contrasto con l'obiettivo del progetto.
- **Un unico documento di architettura monolitico** — scartato: diventa
  ingestibile, non traccia bene i cambi nel tempo e i conflitti di merge crescono.
- **Wiki esterna (Notion/Confluence)** — scartata per ora: separa le decisioni dal
  codice e dal versionamento; gli ADR nel repo restano accanto a ciò che descrivono.

## Rubric check

1. **Professionalità** — gli ADR sono una pratica consolidata e raccomandata in
   contesti senior.
2. **Convenzioni** — segue lo standard MADR/Nygard, ampiamente adottato.
3. **Modularità** — un file per decisione: massima granularità, nessun
   accoppiamento tra decisioni.
4. **Zero debito** — riduce il debito decisionale anziché crearlo; nessun
   compromesso da registrare.
