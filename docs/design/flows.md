# Flussi principali del Core

Fonte di verità dei flussi operativi. Vedi
[ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md).

## 1. Setup iniziale (admin dello stabilimento)

```mermaid
flowchart TD
    A[Crea Stabilimento] --> B[Definisci Settori e File]
    B --> C[Genera Ombrelloni nelle File]
    C --> D[Definisci Pacchetti<br/>dotazione personalizzabile]
    D --> DF[Definisci Fasce<br/>default: Giornata intera]
    DF --> E[Crea Stagione]
    E --> F[Crea Listino della Stagione]
    F --> G[Inserisci Tariffe<br/>tipo x posizione x pacchetto x fascia x periodo]
    G --> H[Pronto all'operativo]
```

## 2. Operativo giornaliero (staff)

```mermaid
flowchart TD
    S[Seleziona data] --> M[Mappa colora gli stati<br/>libero/abbonato/giornaliero/prenotato]
    M --> K[Clic su Ombrellone]
    K --> D[Drawer contestuale]
    D --> A{Azione}
    A -->|Nuova prenotazione| P1[Scegli/crea Cliente]
    P1 --> P2[Scegli Pacchetto + fascia + periodo]
    P2 --> P3[Pricing engine calcola il prezzo]
    P3 --> P4{Ombrellone libero<br/>nel periodo e fascia?}
    P4 -->|Sì| P5[Conferma Prenotazione]
    P4 -->|No| W[Proponi Lista d'attesa]
    A -->|Assegna abbonamento| AB[Cliente + Ombrellone<br/>per l'intera Stagione]
    A -->|Registra presenza| RP[Aggiorna stato del giorno]
```

## 3. Stati della Prenotazione

```mermaid
stateDiagram-v2
    [*] --> Bozza
    Bozza --> Confermata: conferma
    Bozza --> Annullata: scarta
    Confermata --> Annullata: annulla
    Confermata --> Conclusa: fine periodo
    Annullata --> [*]
    Conclusa --> [*]
```

> Nota: lo stato "opzione/hold" temporaneo con scadenza automatica è rimandato
> ([D-006](../architecture/deferred.md)); nell'MVP la Lista d'attesa è promossa
> manualmente a Prenotazione.

## 4. Rinnovo abbonamento (inizio stagione)

Vedi [ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md).

```mermaid
flowchart TD
    L[Lista abbonati stagione precedente] --> R[Clic 'Rinnova' su un abbonato]
    R --> C[Copia cliente + ombrellone + pacchetto]
    C --> P[Pricing engine: prezzo sul nuovo Listino]
    P --> V{Ombrellone libero<br/>nella nuova stagione?}
    V -->|Sì| N[Crea Prenotazione tipo=abbonamento<br/>link a precedente]
    V -->|No| F[Segnala conflitto allo staff]
```

> La **prelazione automatica** (scadenze, rilascio del posto, priorità per anzianità)
> è rimandata ([D-011](../architecture/deferred.md)); nell'MVP la campagna rinnovi è
> guidata ma manuale.

## 5. Sospensione abbonamento (D-013, *in design*)

Un abbonato libera un periodo del proprio abbonamento (rivendita abilitata nel buco) e poi riprende. Agisce
**solo sull'occupazione** (`BookingCoverage`), mai sullo span di contratto: prezzo, rinnovo, prelazione e
seniority restano invariati. Vedi la
[spec](../superpowers/specs/2026-07-08-subscription-suspension-design.md),
[ADR-0046](../architecture/decisions/0046-occupazione-a-intervalli-coverage.md) (occupazione a intervalli),
[ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md) (rimborso).

**Decisione operatore** (ammin.) sulla Scheda cliente, bottoni adiacenti:

```mermaid
flowchart TD
    A[Abbonamento confermato, non disdetto,<br/>copertura futura] --> Q{Il cliente lascia<br/>o si assenta?}
    Q -->|Lascia definitivamente| DIS[Disdici — tronca span+copertura, permanente]
    Q -->|Assenza con ripresa,<br/>ritorno noto| CH[Sospendi CHIUSA S..R-1]
    Q -->|Assenza con ripresa,<br/>ritorno ignoto| AP[Sospendi APERTA S..∞]
    CH --> CHc[Buco S..R-1 rivendibile ·<br/>coda R..fine riservata all abbonato]
    AP --> APc[Coda S..fine libera a tempo indeterminato]
    APc --> RE[Riattiva R]
    RE --> REc{Coda R..fine libera<br/>da walk-in?}
    REc -->|Sì| OK[Ricopre R..fine · rimborso sui giorni reali]
    REc -->|No| C409[409 — rientro in conflitto,<br/>scegli un R più avanti]
```

**Macchina a stati del record `BookingSuspension`** (discriminatore = `endDate IS NULL`):

```mermaid
stateDiagram-v2
    [*] --> Chiusa: Sospendi chiusa S..R-1<br/>(endDate = R-1)
    [*] --> Aperta: Sospendi aperta S..∞<br/>(endDate = NULL, max 1 per abbonamento)
    Aperta --> Conclusa: Riattiva(R)<br/>fissa endDate=R-1, reactivatedAt, rimborso
    Chiusa --> Conclusa: passato il ritorno R<br/>(nessuna azione, coda già riservata)
    Conclusa --> [*]
    note right of Aperta
        coda S..fine libera,
        walk-in vendibili nel buco
    end note
    note right of Chiusa
        buco S..R-1 libero,
        coda R..fine mai ceduta
    end note
```

**Meccanica del carve sulla copertura** (dentro la transazione, tenant-scoped):

```mermaid
flowchart LR
    subgraph Prima
        P1["Coverage: [start .......... end]"]
    end
    subgraph "Chiusa [S, R-1]"
        C1["[start, S-1]"] --- C2["buco [S, R-1] LIBERO"] --- C3["[R, end] riservato"]
    end
    subgraph "Aperta [S, …) poi Riattiva R"
        A1["[start, S-1]"] --- A2["[S, …) TRONCATO"]
        A1b["[start, S-1]"] --- A2b["buco [S, R-1]"] --- A3b["[R, end] ricoperto"]
    end
    P1 -->|carve chiusa| C1
    P1 -->|carve aperta| A1
    A2 -.->|Riattiva R:<br/>pre-check anti-overlap 409| A1b
```

> **Invarianti chiave** (§6 spec): `S ≥ oggi`; solo `type=subscription`, `status=confirmed`, non disdetto;
> `[S,…]` dentro una copertura **futura** (non un buco già libero → 422); **una sola** sospensione aperta per
> abbonamento (409); la **chiusa** richiede un ritorno **entro** la stagione (`R-1 < endDate`, altrimenti 422
> "usa la disdetta" — invariante server, non nudge FE); il rimborso è discrezione dell'operatore
> (suggerimento pro-rata **solo FE**, il server valida i bound), aggregato su `Booking.refundedAmount`.

## 6. Cessione/subentro abbonamento (D-013, *in design*)

Un abbonato cede il posto a un altro cliente, che eredita il contratto — stesso ombrellone, stessa stagione,
**stessa anzianità e prelazione**. Agisce **solo sulla titolarità** (`Booking.customerId`), mai
sull'occupazione (`BookingCoverage`) né sullo span di contratto: prezzo, rinnovo, prelazione e seniority
seguono automaticamente il subentrante. Vedi la
[spec](../superpowers/specs/2026-07-08-subscription-cession-design.md),
[ADR-0047](../architecture/decisions/0047-cessione-subentro-titolarita-incasso.md) (trasferimento titolarità
+ riconciliazione incasso), [ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md) (incasso
base), [ADR-0046](../architecture/decisions/0046-occupazione-a-intervalli-coverage.md) (coverage, non
toccata).

**Decisione operatore** (admin) sulla Scheda cliente, bottone adiacente a "Disdici"/"Sospendi":

```mermaid
flowchart TD
    A[Abbonamento confermato, non disdetto,<br/>senza sospensione aperta] --> B[Cedi/Subentro]
    B --> G{Guardie}
    G -->|tipo≠subscription o stato≠confirmed| E1[422]
    G -->|già disdetto| E2[422]
    G -->|sospensione aperta| E3[409]
    G -->|subentrante inesistente nel tenant| E4[404]
    G -->|subentrante anonimizzato o = titolare attuale| E5[422 SAME_HOLDER]
    G -->|effectiveDate fuori [start,end]| E6[422 BAD_DATE]
    G -->|bound cassa violati| E7[422 BAD_REFUND / BAD_COLLECT / OVER_TOTAL]
    G -->|tutte superate| W[Scrivi in transazione]
    W --> W1[BookingTransfer.create<br/>previousCustomerId=A, newCustomerId=B, effectiveDate, movimenti lordi]
    W --> W2["Booking.update<br/>customerId=B, amountCollected=netto, paymentStatus"]
    W1 --> R[BookingDTO aggiornato]
    W2 --> R
    R --> N[Scheda di B: nuovo titolare + storico transfers<br/>Scheda di A: sezione 'Cessioni effettuate']
```

**Riconciliazione incasso** (dentro la transazione, tenant-scoped — vedi
[ADR-0047](../architecture/decisions/0047-cessione-subentro-titolarita-incasso.md) per la motivazione):

```mermaid
flowchart LR
    S0["amountCollected corrente"] --> M["netto = amountCollected<br/>− refundToPrevious + collectedFromNew<br/>clamp [0, totalPrice]"]
    M --> P["paymentStatus derivato<br/>(unpaid/partial/paid)"]
    M --> B["Booking.amountCollected = netto"]
    S0 -.->|"refundedAmount"| X["INVARIATO<br/>(trasferimento, non perdita di ricavo)"]
```

> **Invarianti chiave** (§6 spec): tipo `subscription`, stato `confirmed`, non disdetto (422); **nessuna
> sospensione aperta** (409 — si cede un contratto "pulito"); subentrante = `Customer` esistente nel tenant
> (404), non anonimizzato ([ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md)),
> diverso dal titolare attuale (422 `SAME_HOLDER`); `effectiveDate ∈ [start, end]` (422 `BAD_DATE`, **nessun**
> vincolo `≥ oggi` — si può registrare una cessione anche per una data passata); bound cassa
> `0 ≤ refundToPrevious ≤ amountCollected` (422 `BAD_REFUND`), `collectedFromNew ≥ 0` (422 `BAD_COLLECT`),
> netto `≤ totalPrice` (422 `OVER_TOTAL`). Il suggerimento pro-rata che pre-compila i due importi è **solo
> FE**, nessun endpoint di preview; il server valida solo i bound. **Occupazione (`BookingCoverage`)
> invariata**: la mappa mostra l'ombrellone occupato con continuità prima e dopo la cessione.

