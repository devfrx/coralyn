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

## 5. Sospensione abbonamento (D-013, implementata e MERGIATA)

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

## 6. Cessione/subentro abbonamento (D-013, implementata e MERGIATA)

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

## 7. Assenze comunicate: consenso → release → carve giorno-singolo → rivendita (D-035 S1+S2, implementata)

Un abbonato comunica (per ora **all'operatore**, che lo registra; il canale self-service è S3+S4, deferito)
di essere **sicuro di non essere presente** in uno specifico giorno del proprio abbonamento; **solo** dietro
consenso esplicito e attivo l'operatore registra una **release** che apre la rivendita di quel giorno. Agisce
**solo sull'occupazione di un giorno singolo** (`BookingCoverage`), mai sullo span di contratto né sulla
cassa dell'abbonato: nessun rimborso, nessun credito. Vedi la
[spec](../superpowers/specs/2026-07-09-assenze-comunicate-release-operatore-design.md),
[ADR-0048](../architecture/decisions/0048-assenze-comunicate-release-occupazione.md) (compensazione = rinuncia
al diritto, non mancato utilizzo), [ADR-0046](../architecture/decisions/0046-occupazione-a-intervalli-coverage.md)
(coverage, riusata), [ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md) (incasso, non
toccato).

**Decisione operatore** (admin) sulla Scheda cliente, azioni adiacenti a "Disdici"/"Sospendi"/"Cedi":

```mermaid
flowchart TD
    A0[Abbonamento confermato, non disdetto] --> AC{Consenso<br/>'assenze comunicate' attivo?}
    AC -->|No| GA["Attiva assenze<br/>PATCH absence-consent consent=true"]
    GA --> AC
    AC -->|Sì| SA["Segnala assenza<br/>POST absence-releases date, reason?"]
    SA --> G{Guardie}
    G -->|non subscription o non confirmed| E1[422]
    G -->|disdetto| E2[422]
    G -->|consenso non attivo| E3[422 NO_CONSENT]
    G -->|date fuori start,end| E4[422 BAD_DATE]
    G -->|date nel passato| E5[422 PAST_DATE]
    G -->|release attiva già presente per quel giorno| E6[409 ALREADY_RELEASED]
    G -->|giorno non coperto da questo Booking| E7[422 NO_COVERAGE]
    G -->|tutte superate| W["Carve giorno-singolo su BookingCoverage<br/>+ AbsenceRelease.create source=operator"]
    W --> H["Buco rivendibile — mappa mostra<br/>l'ombrellone disponibile quel giorno"]
    H --> RV["Rivendita = prenotazione giornaliera<br/>indipendente, flusso esistente"]
    H --> AN["Annulla release<br/>POST absence-releases/:rid/cancel"]
    AN --> GC{Guardie}
    GC -->|già annullata| E8[409 ALREADY_CANCELED]
    GC -->|giorno già rivenduto| E9[409 RESOLD — vincolante]
    GC -->|non rivenduto| RC["Ricopre date,date +<br/>canceledAt = now"]
    RC --> H2[Mappa torna occupata dall'abbonato]
```

**Meccanica del carve giorno-singolo** (dentro la transazione, tenant-scoped — mirror del carve-chiuso
sospensione, a un solo giorno `D`):

```mermaid
flowchart LR
    subgraph Prima
        P1["Coverage: [start .......... end]"]
    end
    subgraph "Release del giorno D"
        C1["[start, D-1] testa<br/>(solo se D > start)"] --- C2["buco [D, D] LIBERO<br/>rivendibile"] --- C3["[D+1, end] coda<br/>(solo se D < end)"]
    end
    P1 -->|"delete coverage C che copre D,<br/>create testa+coda"| C1
```

> **Invarianti chiave** (§6 spec): tipo `subscription`, stato `confirmed`, non disdetto (422); **consenso
> attivo** (`absenceConsentAt !== null`, altrimenti 422 `NO_CONSENT` — è il gate dell'invariante "nessuna
> presunzione d'assenza"); `date ∈ [startDate, endDate]` (422 `BAD_DATE`); `date ≥ oggi` (422 `PAST_DATE`,
> futuro e stesso-giorno ammessi, passato no); nessuna release attiva già presente per quel giorno (409
> `ALREADY_RELEASED`); il giorno deve essere attualmente coperto da questo Booking (422 `NO_COVERAGE`, mirror sospensione — non
> si libera ciò che è già libero). Annullo: release esistente per quel booking (404), non già annullata (409
> `ALREADY_CANCELED`), **giorno non ancora rivenduto** (409 `RESOLD` — stesso predicato
> `dateRangesOverlap`+`slotsOverlap` di rivendita/`reactivate`; se rivenduto l'annullo è vietato, la release è
> **vincolante**). `Booking.amountCollected`/`refundedAmount` **invariati** dopo la release (ADR-0048); la
> rivendita è una `Booking type=daily` indipendente col suo incasso a sé, nessun endpoint dedicato.

## 8. Macchina a stati dei CTA abbonamento — matrice guardie (D-013 + D-035, hardening implementato)

I sette CTA del ciclo abbonamento — i quattro di D-013 (`terminate`/disdici, `suspend`/sospendi, `reactivate`
/riattiva, `transfer`/cedi) e i tre di D-035 (`setAbsenceConsent`/consenso, `releaseAbsence`/segnala assenza,
`cancelAbsenceRelease`/annulla release) — erano stati costruiti e testati **in isolamento** su un abbonamento
pulito. Solo due archi cross-famiglia avevano una guardia (`suspend-open → transfer` 409; il ciclo interno
`suspend → reactivate`); tutte le altre combinazioni erano non guardate. Questo hardening chiude la macchina a
stati: ogni CTA è lecito **solo** negli stati in cui i suoi effetti su span/occupazione/cassa sono corretti. Vedi
la [spec](../superpowers/specs/2026-07-09-audit-macchina-stati-cta-abbonamento-design.md),
[ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md),
[ADR-0046](../architecture/decisions/0046-occupazione-a-intervalli-coverage.md),
[ADR-0047](../architecture/decisions/0047-cessione-subentro-titolarita-incasso.md),
[ADR-0048](../architecture/decisions/0048-assenze-comunicate-release-occupazione.md) (nessun nuovo ADR:
correttezza additiva sui quattro sopra).

**Stati distinguibili di un `Booking` abbonamento** (le stesse dimensioni delle sezioni 5-7, viste come macchina
a stati unica): **active** (`confirmed`, `!terminatedAt`, `endDate ≥ oggi`, nessuna sospensione aperta),
**suspended-open** (esiste una `BookingSuspension` con `endDate = null`), **suspended-closed** (solo sospensioni
chiuse nello storico), **terminated** (`terminatedAt` valorizzato), **cancelled** (`status = 'cancelled'`).
**expired** (`confirmed`, `endDate < oggi`) si comporta come **active** per le guardie di stato — sono i
controlli di data pre-esistenti di ogni CTA (`effectiveDate`/`returnDate`/`date` dentro lo span) a rifiutare da
sé le operazioni prive di senso, nessuna guardia dedicata. Ortogonali (non stati a sé): **consenso attivo**
(`absenceConsentAt`) e **release attiva** (`AbsenceRelease` non annullata/non rivenduta) — cfr. §3 della spec.

```mermaid
stateDiagram-v2
    [*] --> active
    active --> suspended_open: suspend (aperta)
    active --> suspended_closed: suspend (chiusa)
    active --> terminated: terminate
    active --> cancelled: cancel
    suspended_open --> suspended_closed: reactivate
    suspended_open --> cancelled: cancel
    suspended_closed --> suspended_open: suspend (aperta)
    suspended_closed --> suspended_closed: suspend (chiusa)
    suspended_closed --> terminated: terminate
    terminated --> [*]
    cancelled --> [*]

    note right of active
        expired si comporta come active
        (guardie di data pre-esistenti, non di stato)
    end note

    note right of suspended_open
        terminate/transfer → 409 OPEN_SUSPENSION (D1)
        release/annulla-release → 422 OPEN_SUSPENSION (C2)
        consenso grant/revoke → 200 (C1, indipendente dall'occupazione)
        reactivate → 200, unico arco lecito verso l'occupazione
        cancel → cancelled senza guardia (path pericoloso chiuso da D2 lato reactivate)
    end note

    note right of suspended_closed
        reactivate → 409 NO_OPEN (nessuna sospensione aperta da riattivare)
        terminate → 200, carve per-frammento head+coda (D3)
        transfer/consenso/release/annulla-release → 200
    end note

    note right of terminated
        reactivate → 422 TERMINATED (D2)
        annulla-release → 422 TERMINATED (D5)
        terminate/suspend/transfer/consenso/release → 409/422, stato terminale
    end note

    note right of cancelled
        reactivate → 422 NOT_CONFIRMED (D2)
        annulla-release → 422 NOT_CONFIRMED (D5)
        terminate/suspend/transfer/consenso/release → 409/422, stato terminale
    end note
```

**Matrice guardie stato × CTA** (✓ lecito · ✗ rifiutato con codice; **grassetto** = guardia chiusa in questo
hardening, copiata da spec §5):

| Stato | terminate | suspend | reactivate | transfer | consenso grant/revoke | release | annulla release |
|---|---|---|---|---|---|---|---|
| **active** | ✓ | ✓ | ✗ NO_OPEN 409 | ✓ | ✓ | ✓ (se consenso) | ✓ (se release) |
| **suspended-open** | ✗ **OPEN_SUSPENSION 409 (D1)** | ✗ OPEN_EXISTS 409 | ✓ | ✗ OPEN_SUSPENSION 409 | **✓ (C1)** | ✗ **OPEN_SUSPENSION 422 (C2)** | ✗ **OPEN_SUSPENSION 422 (C2)** |
| **suspended-closed** | ✓ *(D3 multi-frammento)* | ✓ | ✗ NO_OPEN 409 | ✓ | ✓ | ✓ | ✓ |
| **terminated** | ✗ ALREADY_TERMINATED 409 | ✗ TERMINATED 422 | ✗ **TERMINATED 422 (D2)** | ✗ TERMINATED 422 | ✗ TERMINATED 422 | ✗ TERMINATED 422 | ✗ **TERMINATED 422 (D5)** |
| **cancelled** | ✗ NOT_CONFIRMED 422 | ✗ NOT_CONFIRMED 422 | ✗ **NOT_CONFIRMED 422 (D2)** | ✗ NOT_CONFIRMED 422 | ✗ NOT_CONFIRMED 422 | ✗ NOT_CONFIRMED 422 | ✗ **NOT_CONFIRMED 422 (D5)** |

> **Invarianti chiave** (§8 spec): `BookingCoverage` di un abbonamento non contiene mai range invertiti
> (`startDate > endDate`) né frammenti che eccedono `endDate` del `Booking` (stati non-disdetti) o `lastValid`
> (disdetti) — `terminate` tronca **per frammento** (D3: `startDate > lastValid` → delete, `endDate > lastValid`
> → clamp a `lastValid`, altrimenti invariato), corretto anche dopo una sospensione chiusa (head+coda) o una
> release attiva (C3: nessuna guardia di blocco, i frammenti `≤ lastValid` restano rivendibili, quelli oltre
> perdono effetto ma la riga `AbsenceRelease` resta storia). `refundedAmount` è un **ledger cumulativo** non
> decrescente lungo tutto il ciclo (D4: `terminate` usa `increment` sul residuo `amountCollected −
> refundedAmount`, come già `suspend`/`reactivate`, mai un SET assoluto). Il consenso (`absenceConsentAt`) è
> **indipendente dall'occupazione** (C1: gate solo `confirmed` + `!terminatedAt`, mai dalla sospensione — risolve
> il "incastrato su ON" del toggle FE).
>
> **Aggregati di cassa derivati (§4.3).** «Da incassare» — KPI `outstanding` del report e «Saldo aperto» della
> Scheda cliente — è il credito ancora **esigibile**: `Σ (totalPrice − amountCollected)` sulle prenotazioni
> **né annullate né disdette** (`status ≠ 'cancelled'` **e** `terminatedAt = null`). Un disdetto resta
> `confirmed` ma il contratto è sciolto → il suo residuo **non** è più esigibile (esclusione simmetrica agli
> annullati). Gli **scaduti** (`endDate < oggi`) non incassati **restano inclusi**: sono crediti reali, non
> debito estinto. «Incassato» (Scheda cliente) è **netto dei rimborsi**: `Σ (amountCollected − refundedAmount)`,
> coerente col ledger cumulativo `refundedAmount` (disdetta + sospensione).

> **Canale cliente (D-035 S4, implementata).** Lo stesso flusso sopra (carve giorno-singolo, guardie,
> invarianti) è ora raggiungibile **anche** dal cliente, dal proprio device, via `POST
> /customer/subscriptions/:bookingId/absence-releases[/:rid/cancel]` (app `web-customer`,
> [ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md) addendum S4). La
> meccanica è **identica** (`AbsenceRelease.create`, stesse guardie 422/409, zero cassa); cambiano solo **due**
> cose: l'attore (cliente autenticato invece di operatore admin) e `AbsenceRelease.source`, che vale
> `'customer'` invece di `'operator'` — impostato dal **controller** in base al canale, mai da un campo del
> body. Il consenso (`absenceConsentAt`) resta gestito **solo** dall'operatore (nessun self-service sul
> consenso); l'ownership cliente-nel-tenant (`actingCustomerId`) è un vincolo aggiuntivo assente sul canale
> operatore. Mockup: [web-customer-segnala-assenza.html](mockups/web-customer-segnala-assenza.html),
> [web-customer-storico.html](mockups/web-customer-storico.html).

## 9. Auth del canale cliente: provisioning → attivazione → sessione rotante (D-035 S3, implementata)

L'operatore (admin) **provisiona** l'accesso self-service del cliente dalla sua prenotazione-abbonamento; il
cliente attiva one-time+PIN e ottiene una sessione device-bound rotante. È la **fondazione auth** del canale
cliente (S3): la feature release `source='customer'` e l'app `web-customer` sono S4. Il tenant è **derivato
dal token** (denormalizzato sulle tabelle fuori-RLS), così `forTenant`/RLS restano invariati a valle. Vedi la
[spec](../superpowers/specs/2026-07-10-canale-cliente-self-service-d035-s3-s4-design.md),
[ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md) (accesso provisioned +
tenant pubblico), [ADR-0026](../architecture/decisions/0026-identita-rls-utente.md) (fuori-RLS),
[ADR-0042](../architecture/decisions/0042-trasporto-email-e-consegna-credenziali.md) (token opaco hashato).

**Flusso end-to-end** (operatore admin → cliente sul proprio device):

```mermaid
flowchart TD
    OP["Operatore (admin): POST /bookings/:id/customer-access"] --> PROV["Genera enrollment token opaco + PIN 6 cifre<br/>(solo-hash a riposo) · invalida enrollment/sessioni vivi precedenti"]
    PROV --> LINK["activationUrl (token nel QR/link) + PIN mostrato UNA volta"]
    LINK --> ACT["Cliente: POST /customer/activate {enrollmentToken, pin}"]
    ACT --> GA{Guardie}
    GA -->|token inesistente/scaduto/revocato/già attivato| E401a[401 generico]
    GA -->|PIN errato| INC["pinAttempts++ ; lock a soglia"]
    INC --> E401b[401 generico]
    GA -->|token valido + PIN ok| OK["claim one-time atomico (activatedAt) +<br/>CustomerSession.create (refresh) + access JWT"]
    OK --> SESS["{ accessToken 30m, refreshToken device-bound }"]
    SESS --> USE{Uso}
    USE -->|GET /customer/me + Bearer JWT| ME["CustomerJwtGuard: req.tenantId dal claim → profilo"]
    USE -->|POST /customer/refresh| ROT["Rotazione (vedi sotto)"]
    USE -->|POST /customer/logout| LO["Revoca la sessione (dal refresh)"]
    OP -.->|POST /bookings/:id/customer-access/revoke| REV["Revoca enrollment + sessioni vive del cliente"]
```

**Macchina a stati dell'enrollment** (`CustomerEnrollmentToken`; stato esposto dal `CustomerAccessStatusDTO`
per la Scheda cliente: `none | issued | active | revoked`):

```mermaid
stateDiagram-v2
    [*] --> issued: provision (POST customer-access)<br/>tokenHash+pinHash, expiresAt
    issued --> active: activate ok (token+PIN)<br/>activatedAt, one-time consumato
    issued --> revoked: PIN oltre soglia (lock) ·<br/>expire · revoca operatore · ri-provisioning
    active --> revoked: revoca operatore · ri-provisioning
    revoked --> [*]
    note right of issued
        activate con token già attivato → 401
        (one-time: claim atomico activatedAt:null)
    end note
    note right of active
        emette la 1a CustomerSession;
        i refresh successivi rotano la sessione,
        non ri-consumano l'enrollment
    end note
```

**Rotazione della sessione + theft-detection** (`CustomerSession`, D-026):

```mermaid
flowchart LR
    R0["POST /customer/refresh {refreshToken}"] --> F{Lookup refreshTokenHash}
    F -->|non trovato| X1[401 generico]
    F -->|trovato, revokedAt != null| THEFT["RIUSO di un refresh già ruotato = furto<br/>→ revoca l'INTERA catena (enrollmentTokenId)"]
    THEFT --> X2[401 generico]
    F -->|scaduto| X3[401 generico]
    F -->|vivo| ROT["revoca il corrente (rotatedInto) +<br/>crea nuovo refresh (rotatedFromId) + nuovo access JWT"]
    ROT --> OUT["{ accessToken, refreshToken nuovo }"]
```

> **Invarianti chiave** (spec §5, [ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md)):
> segreti **mai in chiaro** a riposo (token `sha256`, PIN argon2id); attivazione **one-time** (claim atomico
> `updateMany` con `activatedAt: null` → race-safe) + **PIN** come 2° fattore con **lock** a
> `CUSTOMER_PIN_MAX_ATTEMPTS`; ogni fallimento è un **401 generico identico** (no enumeration, D-029); il
> **tenant** è quello del **claim** (`establishmentId`), popolato in `req.tenantId` dal `CustomerJwtGuard`, mai
> da header/path; ownership a due assi (RLS = tenant, principal = cliente-nel-tenant); refresh **device-bound
> rotante** con **theft-detection** (riuso di un refresh ruotato ⇒ revoca dell'intera catena della sessione,
> D-026); revoca operatore e ri-provisioning invalidano enrollment + sessioni vive; rate-limit
> **controller-scoped** su `/customer/*` (`CUSTOMER_THROTTLE_LIMIT`/60s, D-027), non un guard globale.

**UI operatore del provisioning (D-051, realizzata 2026-07-15).** L'azione `OP["POST /bookings/:id/customer-access"]`
in cima al diagramma è ora azionabile **dall'interfaccia**, non solo via API diretta: la Scheda cliente in
`web-staff` mostra una card **«Accesso cliente»** con lo stato corrente dell'enrollment
(`none | issued | active | revoked`, letto da un nuovo `GET /bookings/:id/customer-access` → `CustomerAccessStatusDTO`,
admin-only) e le azioni **Genera**/**Rigenera** (chiama `POST /bookings/:id/customer-access`, poi rivela QR + link +
PIN **una volta** in un modale di reveal, con copia) e **Revoca** (chiama `POST /bookings/:id/customer-access/revoke`,
dietro conferma). Nessuna nuova macchina a stati: la card riflette 1:1 quella di `CustomerEnrollmentToken` sopra.

