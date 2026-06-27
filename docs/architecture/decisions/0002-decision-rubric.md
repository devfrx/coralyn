# ADR-0002: Decision rubric — i quattro filtri di ogni decisione

- **Status:** Accepted
- **Data:** 2026-06-27
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0001](0001-use-adrs.md)

## Context

Per un prodotto destinato alla vendita, la qualità delle decisioni deve essere
verificabile e coerente nel tempo, non lasciata all'intuito del momento. Serve un
criterio esplicito e ricorrente con cui pesare **ogni** decisione — di
architettura, di dominio, di codice e di strumenti.

## Decision

Ogni decisione del progetto deve superare, ed essere valutata esplicitamente
rispetto a, questi **quattro filtri**:

1. **Professionalità** — È una scelta che un team senior difenderebbe? Niente
   soluzioni "che tanto funzionano" se non reggono lo scrutinio professionale.
2. **Convenzioni** — Esiste uno standard o un idioma consolidato (di linguaggio,
   framework, dominio)? Lo seguiamo. Se ce ne discostiamo, va spiegato **perché ne
   vale la pena**, non dato per scontato.
3. **Modularità** — Confini netti, responsabilità singola, basso accoppiamento,
   alta coesione, testabile in isolamento. Una decisione che intreccia
   responsabilità è sospetta.
4. **Zero debito** — Non introduce debito architetturale o di programmazione che
   ci costringerà a riscrivere. Se un compromesso è **inevitabile**, va registrato
   in [`deferred.md`](../deferred.md) con motivazione e piano di rientro: il debito
   consapevole e tracciato è ammesso, quello silenzioso no.

Operativamente: ogni ADR contiene una sezione **"Rubric check"** che risponde ai
quattro punti. Le decisioni minori (non degne di un ADR) seguono comunque la
rubrica come metro di giudizio nelle revisioni.

## Consequences

### Positive
- Decisioni coerenti, difendibili e confrontabili nel tempo.
- Il debito tecnico diventa visibile e gestito, non accidentale.

### Negative / Trade-off
- Rallenta volutamente le scelte: ogni decisione richiede una giustificazione.
- Rischio di over-engineering se la rubrica viene applicata in modo dogmatico;
  va bilanciata con il principio YAGNI (non costruire ciò che non serve ancora).

### Neutre / Note
- I filtri possono entrare in tensione (es. una convenzione che riduce la
  modularità). In tal caso la tensione va resa esplicita nell'ADR e risolta
  argomentando, non ignorata.

## Alternatives considered

- **Nessun criterio formale** — scartata: rende le decisioni incoerenti e il
  debito invisibile.
- **Checklist molto più lunga** — scartata: quattro filtri memorizzabili vengono
  effettivamente usati; una checklist di 30 voci viene ignorata.

## Rubric check

1. **Professionalità** — definire criteri espliciti di decisione è prassi senior.
2. **Convenzioni** — riprende principi consolidati (SOLID, YAGNI, gestione del
   debito tecnico) in forma sintetica.
3. **Modularità** — il filtro 3 rende la modularità un requisito di prima classe.
4. **Zero debito** — è il meccanismo stesso con cui il progetto previene il debito.
