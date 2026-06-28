# ADR-0016: Tipologia ombrellone e aderenza alla realtà fisica (numerazione, file, speciali)

- **Status:** Accepted
- **Data:** 2026-06-28
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0005](0005-modello-mappa.md) (estende), [ADR-0014](0014-setup-mappa-strutturato.md) (raffina numerazione/setup), [ADR-0006](0006-dominio-prenotazioni-e-pricing.md) (pricing per posizione, invariato), [D-005](../deferred.md), [D-018](../deferred.md), [D-019](../deferred.md)

## Context

Gli ombrelloni dei lidi reali sono **già fisicamente numerati e piazzati**: il software deve
**adattarsi** alla situazione esistente, non imporre una propria numerazione o disposizione.
Dalle interviste di validazione con i gestori emergono tre realtà che il modello mappa
([ADR-0005](0005-modello-mappa.md)) e il suo setup ([ADR-0014](0014-setup-mappa-strutturato.md))
non coprono in modo **esplicito**:

1. **Numerazione** — di norma numeri semplici che seguono l'ordine delle file (es. `1..N`),
   ma **non è universale**: esistono buchi, schemi per settore, etichette non puramente numeriche.
2. **Tipi di ombrellone** — accanto al "normale" esistono tipi diversi (es. *mini‑palma*, *palma*),
   spesso **allineati alle file** (es. mini‑palma in prima/seconda fila vicino alla riva, il resto
   normali) ma **non sempre**.
3. **Ombrelloni speciali** — pochi esemplari (es. 2–4 palme) **fuori dalla disposizione** a file.

ADR‑0005 separa già la posizione *logica* (`ordine_logico`) dalla *presentazione*, e
`Ombrellone.etichetta` è una stringa libera: la fondazione regge. Mancano però la **semantica
esplicita dell'etichetta**, un concetto di **tipo** ortogonale alla posizione, e il **pattern per
gli speciali**.

## Decision

Estendiamo il modello mappa con tre precisazioni, **senza** riscrivere ADR‑0005 né il pricing per
posizione ([ADR-0006](0006-dominio-prenotazioni-e-pricing.md)).

### 1. `etichetta` = identificatore fisico reale

- `Ombrellone.etichetta` è il **numero/identificativo fisico reale** dell'ombrellone: **stringa
  libera** (`"1"`, `"47"`, `"A1"`, `"12bis"`).
- **Unicità: per Stabilimento** (così "ombrellone 47" è non ambiguo). Resta **disaccoppiata** da
  `ordine_logico` (numero ≠ posizione in fila) e dalla tipologia.
- L'auto‑generazione del setup ([ADR-0014](0014-setup-mappa-strutturato.md)) è una **comodità**:
  le etichette sono **modificabili singolarmente** e i **buchi sono ammessi**. Il software si
  adatta alla numerazione esistente, non viceversa.

### 2. `Tipologia` come classificazione ortogonale alla posizione

- Introduciamo l'entità **`Tipologia`** (per Stabilimento: `nome`, `ordine`) e il riferimento
  **`Ombrellone.tipologia_id` (nullable)**.
- `NULL` = ombrellone **standard/normale**: il gestore definisce solo i tipi che ha davvero
  (Mini‑palma, Palma, …).
- La tipologia serve a **mostrare il tipo**, **farlo scegliere al cliente** e calcolare la
  **disponibilità per tipo** ("quante palme libere?").
- **Il prezzo resta per posizione** (Settore/Fila, [ADR-0006](0006-dominio-prenotazioni-e-pricing.md)):
  nel caso reale il tipo coincide con la fila/zona, e gli speciali stanno in un settore dedicato col
  proprio prezzo. Il **prezzo‑per‑tipologia** (tipi a prezzo diverso *nella stessa* fila) è
  **rimandato** ([D-018](../deferred.md)).

### 3. Ombrelloni speciali come Settore/Fila dedicato

- Gli speciali fuori griglia si modellano come un **Settore dedicato** (es. "Speciali"/"Aree
  speciali") con una o più **File**; ogni speciale è un `Ombrellone` con la sua `tipologia`
  (es. Palma) ed `etichetta`, e prende il **prezzo dal settore**.
- Nessun cambio di schema: ADR‑0005 prevede già le "aree speciali"; la **collocazione visiva
  libera** arriverà con l'editor planimetria ([D-005](../deferred.md)).
- Nell'MVP **ogni `Ombrellone` resta dentro una `Fila`**; il supporto a ombrelloni *standalone*
  (senza fila) è **rimandato** ([D-019](../deferred.md)).

## Consequences

### Positive

- Il software **si adatta alla realtà fisica** (numeri esistenti, buchi, tipi, speciali) invece di
  imporre una struttura.
- `Tipologia` è **additiva e ortogonale**: abilita disponibilità/scelta per tipo senza toccare il
  pricing.
- Nessuna riscrittura: estende ADR‑0005, riusa il pricing per posizione, sfrutta il layer di
  presentazione già previsto.

### Negative / Trade-off

- Due assi (posizione e tipo) da tenere coerenti in setup e UI; mitigato dal default
  `tipologia_id = NULL`.
- Il prezzo‑per‑tipo nella stessa fila non è esprimibile finché [D-018](../deferred.md) non viene
  affrontato (accettabile: caso raro nei lidi target).

### Neutre / Note

- L'unicità di `etichetta` è per Stabilimento; un'eventuale riduzione a per‑Settore (lidi che
  riusano i numeri tra zone) è un rilassamento futuro del vincolo, non una riscrittura.

## Alternatives considered

- **Tipologia come dimensione di prezzo subito** (tipo come `ambito` della `TARIFFA`) — scartata
  ora: estende il pricing engine ([ADR-0006](0006-dominio-prenotazioni-e-pricing.md)) per un caso
  (tipi a prezzo diverso nella stessa fila) atipico nei lidi target; rimandata come
  [D-018](../deferred.md).
- **Nessun tipo esplicito** (tipo implicito nella Fila) — scartata: non permette di nominare/filtrare
  per tipo né di gestire tipi non allineati alle file (palme fuori griglia).
- **`Ombrellone` standalone senza Fila** per gli speciali — scartata nell'MVP: il Settore/Fila
  dedicato copre il caso senza cambi di schema; rimandata come [D-019](../deferred.md).
- **Numerazione imposta dal software** (sequenziale rigida) — scartata: contraddice il requisito di
  adattarsi alla numerazione fisica esistente.

## Rubric check

1. **Professionalità** — modella il dominio reale (tipi, numeri fisici, aree speciali) come fanno i
   gestionali di settore seri, senza forzature.
2. **Convenzioni** — riusa il modello a settori/file e il pricing per posizione già adottati;
   `Tipologia` è un classico *lookup* per‑tenant.
3. **Modularità** — separa **identità** (`etichetta`), **posizione** (`Settore`/`Fila`,
   `ordine_logico`) e **tipo** (`Tipologia`): tre responsabilità ortogonali.
4. **Zero debito** — tutto additivo; i compromessi (prezzo‑per‑tipo, standalone) sono tracciati in
   [D-018](../deferred.md)/[D-019](../deferred.md); nessuna scelta silenziosa.

## Addendum (2026-06-28)

In coordinamento con [ADR-0020](0020-resa-mappa.md) (resa della mappa) e con
`packages/contracts` (`TipologiaDTO.icona`), la `Tipologia` porta un campo **`icona`**
opzionale (nullable): una chiave del registry icone del `ui-kit` che fornisce il *marker di
tipo* sulla cella di mappa. È un attributo di **presentazione persistito per tipo**
(configurato dal gestore), **additivo** e con fallback senza icona; non altera la decisione
principale (Tipologia = classificazione ortogonale, non dimensione di prezzo). Riflesso nel
[data-model](../design/data-model.md).
