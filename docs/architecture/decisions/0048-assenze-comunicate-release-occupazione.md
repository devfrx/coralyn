# ADR-0048: Assenze comunicate — release dell'occupazione senza compensazione (rinuncia all'uso ≠ rinuncia al diritto)

- **Status:** Accepted
- **Data:** 2026-07-09
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0046](0046-occupazione-a-intervalli-coverage.md) (**additivo**: la release riusa
  il modello di occupazione a intervalli su `BookingCoverage` e il meccanismo di carve introdotto per la
  sospensione, a granularità giorno-singolo), [ADR-0011](0011-incasso-base-nel-core.md) (**additivo**: la
  release **non** movimenta l'incasso della `Booking` — nessun `amountCollected`/`refundedAmount` toccato,
  a differenza di disdetta/sospensione). **Non tocca** [ADR-0047](0047-cessione-subentro-titolarita-incasso.md)
  (cessione): titolarità e riconciliazione incasso restano un asse ortogonale. Spec:
  [2026-07-09-assenze-comunicate-release-operatore-design.md](../../superpowers/specs/2026-07-09-assenze-comunicate-release-operatore-design.md)
  (D-035, sotto-slice S1+S2 — apre il modulo).

## Context

In un lido la maggioranza dei posti è **abbonata**, quindi la "presenza" non è catturabile dall'operatore
(appello a 200-300 persone = utopico) né deducibile (l'abbonato non avvisa se salta un giorno). Il bottone
«Presenza» sulla mappa era stato rimosso proprio per questo motivo. Risultato: i giorni in cui un abbonato
non viene restano **invenduti** — l'ombrellone è fisicamente libero ma il sistema lo considera occupato
dall'abbonamento, e l'operatore non può rivenderlo.

Il dato di assenza può esistere **solo se lo fornisce il cliente stesso**. Questa slice (S1+S2, lato
operatore) costruisce il primo anello: il cliente comunica (per ora **all'operatore**, che lo registra, in
attesa del canale self-service S3+S4) di essere **sicuro di non essere presente** in uno specifico giorno del
proprio abbonamento; **solo** a fronte di quella segnalazione esplicita l'operatore può rivendere quel posto
per quel giorno.

**Invariante di dominio irrinunciabile:** in assenza di segnalazione esplicita registrata nel sistema, anche
se il cliente di fatto non si presenta, l'operatore **non può rivendere** — nessuna presunzione d'assenza.

Serve quindi decidere (a) come modellare il "buco" di occupazione senza intaccare il contratto dell'abbonato,
(b) se e come questo buco genera un movimento di cassa sull'abbonato, e (c) come garantire che la release sia
sempre un atto esplicito e vincolante, mai un automatismo.

## Decision

### (a) Una release è un carve a giorno-singolo su `BookingCoverage`, mirror della sospensione

`AbsenceRelease` (figlia di `Booking`, mirror strutturale di `BookingSuspension`/`BookingTransfer`) porta la
**storia** (quale giorno, quando, da quale fonte, se annullata); il buco nell'occupazione vive, come sempre,
su `BookingCoverage`. La granularità è **la fascia che l'abbonato possiede, per un giorno scelto**: se
l'abbonamento è "intera giornata" la release libera l'intera giornata; se è "mattina" libera la mattina — la
fascia della release **coincide** con quella del `Booking` (implicita, nessuna estensione del modello
coverage). Il carve è quindi la versione a giorno-singolo del carve-chiuso della sospensione: si individua il
frammento di `BookingCoverage` che copre la data `D`, lo si elimina, e lo si ricrea come **testa**
`[start, D-1]` (se `D > start`) e **coda** `[D+1, end]` (se `D < end`) — se `D` è un frammento a giorno
singolo entrambe sono vuote e il giorno resta senza copertura, quindi rivendibile. `Booking.startDate/endDate`
(lo **span di contratto**) **non** cambiano: l'abbonato tiene l'intero contratto (prezzo, seniority,
prelazione, rinnovo intatti). La rivendita **non** introduce un endpoint nuovo: usa il flusso di prenotazione
giornaliera esistente, che legge la disponibilità da `BookingCoverage` come sempre.

### (b) Compensazione = rinuncia al diritto, non mancato utilizzo (zero cassa sull'abbonato)

**Principio:** *la compensazione segue la rinuncia al diritto, non il mancato utilizzo del diritto.*

| Evento | Il diritto contrattuale (span) | Cassa sull'abbonato |
|---|---|---|
| **Disdetta** (D-013) | ceduto: `endDate` troncata | rimborso pro-rata su `refundedAmount` |
| **Sospensione** (D-013) | ceduto per un intervallo: buco nello span-occupazione | rimborso su `refundedAmount` |
| **Cessione** ([ADR-0047](0047-cessione-subentro-titolarita-incasso.md)) | trasferito a B: `customerId` A→B | movimento netto su `amountCollected` |
| **Release "assenza"** (questa slice) | **intatto**: l'abbonato tiene tutto il contratto | **nessuna** |

Disdetta e sospensione rimborsano perché l'abbonato **rinuncia al diritto** (tronca o buca lo span). La
cessione muove un **netto** perché il diritto passa a un altro titolare. La release non fa nessuna delle due
cose: lo span resta intatto, l'abbonato **non rinuncia a nulla del contratto**, comunica solo che non userà
un giorno che comunque tiene. È la versione **dichiarata** di un no-show, che oggi non viene comunque
rimborsato. L'abbonamento è un **forfait** stagionale (D-034: la periodica è a giornata, l'abbonamento è a
forfait): non esiste un "prezzo del giorno D" pulito da rimborsare; rimborsare imporrebbe di **inventare una
decomposizione per-giorno di un forfait**, un debito che questo ADR evita esplicitamente.
`Booking.amountCollected`/`refundedAmount` restano **invariati** dalla release, mantenendo l'invariante
`netto = amountCollected − refundedAmount` come fonte unica ([ADR-0011](0011-incasso-base-nel-core.md)), nello
stesso spirito di [ADR-0047](0047-cessione-subentro-titolarita-incasso.md) per la cessione. Il valore
recuperato vive **interamente** sulla prenotazione giornaliera di rivendita (`type=daily`), che ha il suo
incasso a sé — nessun doppio-uso fisico: la release è vincolante, quindi sul giorno rivenduto l'ombrellone è
occupato dal cliente della rivendita, non dall'abbonato.

### (c) La release è consenso-gated e vincolante; nessuna presunzione d'assenza

Il consenso "assenze comunicate" è lo **stato corrente** su `Booking.absenceConsentAt` (`null` = nessun
consenso; valorizzato = consenso attivo), settato/annullato via `PATCH /bookings/:id/absence-consent`
(admin-only, idempotente, mirror `terminatedAt`). **Nessuna release è possibile senza consenso attivo** —
`POST /bookings/:id/absence-releases` risponde `422 NO_CONSENT` altrimenti: è il gate che rende operante
l'invariante "nessuna presunzione d'assenza". La revoca del consenso blocca **nuove** release ma **non
annulla** quelle già registrate.

Una volta registrata, la release è **vincolante**: l'annullo (`POST .../absence-releases/:rid/cancel`) è
ammesso solo se il giorno **non** è già stato rivenduto (nessuna `BookingCoverage` confirmed di un'altra
`Booking` sovrapposta a ombrellone+fascia+data) — altrimenti `409 RESOLD`. L'abbonato che ha comunicato
un'assenza e viene "smentito" dal fatto (rivendita già avvenuta) ha perso quel giorno: mirror esatto del
`reactivate` della sospensione (frammentazione coverage accettata, nessun merge).

`AbsenceRelease.source` (`operator | customer`, default `operator`) registra un **fatto vero** già in questa
slice (ogni release qui è genuinamente inserita dall'operatore su segnalazione del cliente via
telefono/SMS) e predispone il campo per il canale cliente self-service (S3+S4, deferite): quando il cliente
potrà segnalare direttamente, `source='customer'` distinguerà l'accountability senza retrofit sulla stessa
tabella.

## Consequences

### Positive
- **Recupero-incasso senza violare l'invariante di dominio**: il posto abbonato non usato torna vendibile
  solo dietro un atto esplicito e tracciato (consenso + release), mai per inferenza o default.
- **Zero interazione con contratto e cassa dell'abbonato**: `Booking.startDate/endDate`,
  `amountCollected`/`refundedAmount`, `previousBookingId` (seniority/prelazione) restano del tutto estranei
  alla release — nessun rischio di corrompere gli invarianti già consolidati da disdetta/sospensione/cessione.
- **Riuso totale del meccanismo di carve**: nessuna estensione strutturale di `BookingCoverage` o del
  constraint `coverage_no_overlap`; la release è "la sospensione a un giorno", stesso codice mentale, stesso
  pattern di transazione tenant-scoped.
- **S4 additiva per costruzione**: `AbsenceRelease.source` è già pronto a distinguere la fonte
  cliente/operatore senza migrazione né retrofit quando il canale self-service arriverà.

### Negative / Trade-off
- **Nessun rimborso su una release**, anche se l'abbonato di fatto rinuncia a un giorno intero: accettato
  perché l'alternativa (decomporre il forfait per-giorno) introdurrebbe un debito di modellazione più grande
  del beneficio — l'abbonamento resta, per design, un forfait indivisibile a fini di rimborso.
- **Granularità limitata alla fascia dell'abbonamento**: un abbonamento "giornata intera" non può liberare
  solo la mattina in questa slice (richiederebbe minuti-fascia indipendenti per riga `BookingCoverage`,
  un'estensione strutturale) — deferito, additivo se emerge la domanda (spec §14).
- **Nessun audit dell'attore admin** che ha dato/revocato il consenso o registrato/annullato la release in
  v1: mitigato — coerente con `BookingSuspension`/`BookingTransfer` esistenti, deferito esplicitamente a
  D-047.
- **Accesso registrazione release limitato ad admin** in v1 (non `staff`): prudente per una funzionalità
  security-sensitive appena introdotta; raffinamento operativo futuro se serve.

### Neutre / Note
- La rivendita non introduce un nuovo endpoint: usa il flusso di prenotazione giornaliera esistente, che già
  legge la disponibilità da `BookingCoverage`.
- Il dispatch errori (`404`/`422`/`409`) è mirror esatto di `terminate`/`suspend`/`transfer`.

## Alternatives considered

- **Rimborso pro-rata del giorno liberato** (trattare la release come una micro-sospensione con
  compensazione) — scartata: l'abbonamento è un forfait stagionale senza un "prezzo del giorno D" pulito;
  decomporlo per rimborsare un singolo giorno introdurrebbe un debito di modellazione (come farebbe emergere
  una `unit`/prezzo-giorno mai voluta, vedi D-034) per un evento che, semanticamente, non è una rinuncia al
  diritto ma solo al suo uso in un giorno specifico.
- **Presunzione d'assenza automatica** (es. l'ombrellone risulta libero se l'abbonato non si presenta entro
  un orario) — rifiutata categoricamente: viola l'invariante di dominio esplicito raccolto dall'utente
  ("nessuna presunzione d'assenza"); è il motivo stesso per cui il bottone «Presenza» era stato rimosso
  (l'appello a 200-300 persone è utopico e comunque non prova un'assenza futura dichiarata).
  Il dato di assenza può esistere **solo** se il cliente lo fornisce esplicitamente.
- **Release non consenso-gated** (chiunque abbonato può essere liberato senza un opt-in preventivo) —
  scartata: renderebbe la release un comando unilaterale dell'operatore invece che il canale di una
  segnalazione del cliente, con rischio concreto di rivendere un posto senza che il cliente lo sappia o lo
  abbia acconsentito. Il consenso di prima classe (`absenceConsentAt`, revocabile) rende esplicito e
  auditabile chi ha aperto la porta.

## Rubric check ([ADR-0002](0002-decision-rubric.md))

1. **Professionalità** — sblocca il recupero-incasso rispettando l'invariante "nessuna presunzione
   d'assenza" (release esplicita, consenso-gated, vincolante); la semantica economica è motivata da un
   principio esplicito (rinuncia-al-diritto, non mancato-utilizzo), non da un'intuizione ad-hoc.
2. **Convenzioni** — mirror esatto di `suspend`/`reactivate`: admin-only, transazione tenant-scoped,
   invarianti → 422/409/404, carve su `BookingCoverage`, `toBookingDTO` di ritorno; tabella figlia RLS FORCE
   come `BookingSuspension`/`BookingTransfer`; `PATCH` idempotente per il toggle consenso (REST-corretto
   rispetto ai comandi-`POST` irreversibili); consenso a singolo timestamp come `terminatedAt`.
3. **Modularità** — `AbsenceRelease` è pura storia; consenso, occupazione e release restano concetti
   separati; la rivendita è una prenotazione indipendente (nessun accoppiamento di cassa con l'abbonamento);
   `source` incapsula l'estensione S4 senza toccare il resto del meccanismo.
4. **Zero debito** — `amountCollected`/`refundedAmount` non sporcati (questo ADR motiva esplicitamente il
   perché); il sub-slot più fine e l'audit dell'attore admin sono **tracciati** (spec §14, D-047), non
   silenziosi; `source` non è machinery speculativa (registra un fatto vero già oggi e prepara S4 senza
   retrofit/backfill); nessuno stato duplicato (il buco vive solo su `BookingCoverage`, la storia solo su
   `AbsenceRelease`).
