# ADR-0009: Documentazione di design versionata e tenuta aggiornata

- **Status:** Accepted
- **Data:** 2026-06-27
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0001](0001-use-adrs.md)

## Context

Diagrammi del modello dati, flussi e mockup delle schermate sono prodotti durante la
progettazione e devono essere **salvati e tenuti aggiornati**, non dispersi. I
mockup del companion di brainstorming vivono in `.superpowers/` (ignorato da git):
servono come bozze, ma non sono documentazione di progetto.

## Decision

- I **diagrammi strutturali** (modello dati/ER, flussi, macchine a stati) si scrivono
  in **Mermaid** dentro `docs/design/`. Essendo testo, sono **diff-abili,
  versionabili e si aggiornano insieme al codice**: sono la fonte di verità dello
  stato corrente.
- I **mockup di UI** (schermate) si salvano come **snapshot HTML self-contained** in
  `docs/design/mockups/`, aggiornati quando cambia la direzione UI.
- Le **decisioni** e le loro motivazioni restano negli [ADR](.); i diagrammi mostrano
  il *cosa* corrente, gli ADR il *perché*.
- I file di lavoro del companion (`.superpowers/`) restano ignorati.

## Consequences

### Positive
- "Mappe e modelli" sempre disponibili, versionati e allineati al codice.
- Mermaid si rende ovunque (GitHub, IDE) e ha diff leggibili.

### Negative / Trade-off
- I diagrammi vanno aggiornati con disciplina insieme alle modifiche che li toccano
  (parte della Definition of Done di un cambiamento di dominio/UI).

## Alternatives considered

- **Tenere i mockup solo in `.superpowers/`** — scartata: temporanei e ignorati,
  andrebbero persi.
- **Diagrammi come immagini/binari** — scartata: non diff-abili, si disallineano.
- **Strumento di diagrammi esterno** — scartata: separa i diagrammi dal repo e dal
  versionamento.

## Rubric check

1. **Professionalità** — diagram-as-code è prassi consolidata.
2. **Convenzioni** — Mermaid è lo standard de facto per diagrammi versionati nei repo.
3. **Modularità** — un artefatto per concetto in `docs/design/`, linkati dall'architettura viva.
4. **Zero debito** — testo diff-abile previene il disallineamento tipico dei diagrammi
   binari/esterni.
