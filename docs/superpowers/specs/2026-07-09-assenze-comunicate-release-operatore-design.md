# Spec — Assenze comunicate: release registrata dall'operatore, con gate di consenso (D-035, sotto-slice S1+S2 — apre il modulo)

> Design **CONFERMATO** in brainstorming con l'utente (2026-07-09). **Prima** sotto-slice del **modulo D-035**
> ("servizio clienti parallelo + assenze comunicate"). D-035 è stato decomposto in **S1→S2** (lato operatore,
> questa spec) e **S3→S4** (canale cliente: auth + PWA/QR — spec future, portano dentro il tenant-routing
> pubblico e le voci security-gated). Qui l'operatore (1) cattura il **consenso "assenze comunicate"**
> sull'abbonamento e (2) registra una **release** per `(abbonamento, giorno)` che apre la **rivendita** di quel
> posto — **solo** se il consenso è attivo. **Fonte della release = l'operatore che registra la segnalazione
> esplicita del cliente** (telefonata/SMS); il canale self-service è S4. **NON FE-only**: schema + migration +
> contracts + api + FE. **Additiva su `Booking`/`BookingCoverage`** (riusa il carve della sospensione). Introduce
> un **ADR-0048** per il principio economico. Prossima azione dopo l'ok utente sulla spec: `writing-plans` (TDD).

---

## 1. Problema

In un lido la maggioranza si **abbona**, quindi la "presenza" NON è catturabile dall'operatore (appello a
200-300 persone = utopico) né deducibile (l'abbonato non avvisa se salta un giorno). Il bottone «Presenza» sulla
mappa è stato **rimosso** proprio per questo. Risultato: i giorni in cui un abbonato **non viene** restano
**invenduti** — l'ombrellone è fisicamente libero ma il sistema lo considera occupato dall'abbonamento, e
l'operatore non può rivenderlo.

Il dato di assenza può esistere **solo se lo fornisce il cliente stesso**. Questa slice costruisce il primo
anello: il cliente comunica (per ora **all'operatore**, che lo registra) di essere **SICURO di non essere
presente** in uno specifico giorno del suo abbonamento; **solo** a fronte di quella segnalazione esplicita
l'operatore può rivendere quel posto per quel giorno.

**Invariante di dominio irrinunciabile:** in assenza di segnalazione esplicita registrata nel sistema, **anche
se il cliente di fatto non si presenta, l'operatore NON può rivendere** — **nessuna presunzione d'assenza**.

Perché la registrazione lato-operatore **non** è il ritorno dell'appello rifiutato: l'appello era *presenza*
(polling di tutti = utopico); la release è *assenza dichiarata* (iniziativa del cliente, sparsa). L'operatore
qui è solo il **tramite** della segnalazione esplicita del cliente, finché S4 non gli dà il canale self-service.

## 2. Modello di dominio (confermato)

Le due dimensioni ortogonali già stabilite in D-013 restano invariate: **span di contratto** su `Booking` vs
**occupazione fisica** a intervalli su `BookingCoverage` ([ADR-0046]). La release agisce come la sospensione —
**scava un buco nell'occupazione senza toccare lo span** — ma a granularità **giorno singolo** e con **semantica
economica opposta**.

- **Granularità: la fascia che l'abbonato possiede, per un giorno scelto** (Opzione 1 del brainstorming). Se
  l'abbonamento è "intera giornata" libera l'intera giornata; se è "mattina" libera la mattina. La fascia della
  release **coincide** con quella del `Booking` (implicita), quindi il buco è un carve **lungo l'asse delle
  date** — la versione a giorno-singolo del carve sospensione. **Nessuna estensione del modello coverage** (il
  sub-slot più fine della fascia dell'abbonamento è deferito — vedi §14).
- **Span di contratto intatto.** `Booking.startDate/endDate` **non** cambiano: l'abbonato tiene l'intero
  contratto (prezzo, seniority, prelazione, rinnovo). Rinuncia **all'uso** di un giorno, non al diritto.
- **Zero movimento di cassa sull'abbonato** (il cuore di ADR-0048, §5). `amountCollected` e `refundedAmount`
  dell'abbonamento **invariati**. La rivendita è una **prenotazione giornaliera indipendente** col suo incasso a
  sé.
- **Consenso di prima classe, revocabile.** Il consenso "assenze comunicate" è lo **stato corrente** su
  `Booking` (`absenceConsentAt`); grant/revoke lo settano/annullano. Nessuna release è possibile senza consenso
  attivo.
- **Release di prima classe, con storia auditabile.** `AbsenceRelease` (figlia di `Booking`, mirror di
  `BookingSuspension`) porta la **storia** (quale giorno, quando, da quale fonte, se annullata); il buco
  nell'occupazione vive su `BookingCoverage`.

## 3. Decisioni (CONFERMATE con l'utente)

1. **Prima spec = S1 (consenso) + S2 (release + rivendita) fusi**, lato operatore. Il consenso da solo non ha
   comportamento (peso morto); la release ha senso solo dietro consenso → una sola slice coerente e verificabile.
   S3/S4 (canale cliente) restano spec separate dopo.
2. **Ordine del modulo confermato: S1→S2 prima, S3→S4 dopo** (valore e rischio prima, canale client per ultimo).
   S1+S2 sbloccano il recupero-incasso girando **dentro web-staff+api esistenti**, senza toccare
   pubblicazione/dominio/auth pubblica.
3. **Granularità release = la propria fascia dell'abbonato, per un giorno** (Opzione 1): riuso del carve
   sospensione, zero cambi strutturali su coverage.
4. **Nessun movimento di cassa sull'abbonato** (ADR-0048): la compensazione segue la **rinuncia al diritto**
   (sospensione: rimborso; cessione: movimento netto), **non il mancato utilizzo**. La release non tocca lo span
   → nessun rimborso, nessun credito. La rivendita è una prenotazione giornaliera indipendente.
5. **Consenso revocabile in qualsiasi momento** (grant/revoke dall'operatore, admin-only), con timestamp per
   accountability (stile `terminatedAt`/`anonymizedAt`). La revoca **blocca nuove** release ma **non annulla**
   quelle già registrate/rivendute. L'audit *chi* ha cambiato il consenso è **[D-047]** (come per
   `BookingSuspension`/`BookingTransfer`, senza `createdBy`).
6. **`AbsenceRelease.source` (`operator|customer`, default `operator`)** registra un **fatto vero** già in slice
   1 (ogni release qui è genuinamente operator-sourced) e rende S4 **puramente additivo** (stessa tabella, cambia
   solo la fonte). Non è machinery speculativa: in S4 serve distinguere la segnalazione del cliente da quella
   inserita dall'operatore per accountability.
7. **Annullo release (`canceledAt`, soft) solo se non ancora rivenduta.** L'operatore sbaglia giorno → re-copre
   il buco. Se il buco è **già stato rivenduto** (esiste coverage confirmed di altra booking su
   ombrellone+fascia+data) → **409**: l'abbonato ha perso il giorno, è **vincolante**. Mirror del `reactivate`
   sospensione (frammentazione coverage accettata, nessun merge — identico all'esistente).
8. **Tre endpoint admin-only** (coerente con terminate/suspend/transfer; prudente perché D-035 è
   security-sensitive). L'accesso `staff` alla registrazione release è un raffinamento futuro se serve
   operativamente (§14).

## 4. Modello dati (additivo)

**Campo su `Booking`** (stato corrente del consenso):
```prisma
// Consenso "assenze comunicate" (D-035 S1). null = nessun consenso; valorizzato = consenso attivo.
// Grant/revoke via PATCH admin-only. L'audit chi/quando dei cambi è D-047 (come suspension/transfer).
absenceConsentAt DateTime?
```

**Nuova tabella figlia `AbsenceRelease`** (un abbonamento libera N giorni nel tempo):
```prisma
model AbsenceRelease {
  id              String    @id @default(uuid()) @db.Uuid
  bookingId       String    @db.Uuid
  establishmentId String    @db.Uuid          // RLS FORCE tenant-scoped
  date            DateTime  @db.Date          // il giorno liberato (fascia = quella del Booking, implicita)
  source          AbsenceReleaseSource @default(operator)  // operator|customer → S4 additivo
  canceledAt      DateTime?                   // annullo (soft) prima della rivendita; null = attiva
  reason          String?
  createdAt       DateTime  @default(now())

  booking       Booking       @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  establishment Establishment @relation(fields: [establishmentId], references: [id])
  @@index([bookingId])
  @@index([establishmentId])
}

enum AbsenceReleaseSource {
  operator
  customer
}
```
- **RLS ENABLE + FORCE ROW LEVEL SECURITY + policy `tenant_isolation`** su `establishmentId`
  (`nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId"`), come le altre tabelle di
  dominio; `onDelete: Cascade` dalla `Booking`.
- **Nessun `createdByUserId`**: l'audit dell'attore admin resta in **[D-047]** (come `BookingSuspension`).
- **Pura storia/accountability**: nessuna colonna denormalizzata per constraint (il carve dell'occupazione vive
  su `BookingCoverage`, che ha già il suo anti-overlap).

Relazioni inverse aggiunte: `Booking.absenceReleases AbsenceRelease[]`,
`Establishment.absenceReleases AbsenceRelease[]`.

## 5. Semantica economica (ADR-0048) — perché zero cassa

**Principio:** *la compensazione segue la rinuncia al diritto, non il mancato utilizzo.*

| Evento | Il diritto contrattuale (span) | Cassa sull'abbonato |
|---|---|---|
| **Disdetta** (D-013) | ceduto: `endDate` troncata | rimborso pro-rata su `refundedAmount` |
| **Sospensione** (D-013) | ceduto per un intervallo: buco nello span-occupazione | rimborso su `refundedAmount` |
| **Cessione** (ADR-0047) | trasferito a B: `customerId` A→B | movimento netto su `amountCollected` |
| **Release "assenza"** (questa slice) | **intatto**: l'abbonato tiene tutto il contratto | **nessuna** |

La release è la versione **dichiarata** di un no-show, che oggi non viene comunque rimborsato. L'abbonamento è un
**forfait** stagionale (contesto [D-034]: la periodica è a giornata, l'abbonamento è a forfait): non esiste un
"prezzo del giorno D" pulito da rimborsare; rimborsare imporrebbe di **inventare una decomposizione per-giorno di
un forfait** → debito e incoerenza. Tenere `amountCollected`/`refundedAmount` **intatti** mantiene l'invariante
`netto = amountCollected − refundedAmount` come fonte unica (identico allo spirito di ADR-0047 per la cessione).
Il valore recuperato vive **interamente** sulla prenotazione giornaliera di rivendita, che ha il suo incasso.

**Nessun doppio-uso fisico:** la release è vincolante ("sono SICURO di non venire") → su quel giorno l'ombrellone
è occupato dal cliente della rivendita, **non** dall'abbonato. Non si vende un posto a due persone
contemporaneamente: si riempie una **vacanza dichiarata**.

## 6. Meccanismo (dentro la tx tenant-scoped, admin-only)

### 6a. Consenso — `PATCH /bookings/:id/absence-consent` `{ consent: boolean }`
Guardie: booking esiste (404) · `subscription` (422) · `confirmed` (422) · **non disdetto** (`terminatedAt ===
null`, 422). Effetto: `absenceConsentAt = consent ? now() : null` (idempotente). Ritorna `BookingDTO`.
*(La revoca non tocca le release già registrate — §3.5.)*

### 6b. Release — `POST /bookings/:id/absence-releases` `{ date, reason? }`
Guardie (mirror della sospensione, `bookings.service.ts::suspend`):
- 404 booking inesistente · 422 non-`subscription` · 422 non-`confirmed` · 422 disdetto (`terminatedAt !== null`);
- **422 `NO_CONSENT`** se `absenceConsentAt === null` — *è il gate dell'invariante: nessuna release senza
  consenso esplicito attivo*;
- 422 `BAD_DATE` se `date ∉ [startDate, endDate]`;
- 422 `PAST_DATE` se `date < oggi` (futuro e stesso-giorno ammessi — *"anche con anticipo"*; passato no);
- 409 `ALREADY_RELEASED` se esiste già una release **attiva** (`canceledAt === null`) per quel `date`;
- 422 `NO_COVERAGE` se quel giorno **non** è attualmente coperto da questo Booking (già buco per sospensione/altra
  release, o fuori dei frammenti coverage) → non si libera ciò che è già libero.

Carve (= carve-chiuso sospensione a giorno singolo, `day = 24*60*60*1000`):
```
D = toDbDate(date)
C = coverages.find(c => c.startDate <= D && D <= c.endDate)      // il frammento che copre D
tx.bookingCoverage.delete(C)
if (D > C.startDate) create coverage [C.startDate, D - day]      // testa
if (D < C.endDate)   create coverage [D + day,   C.endDate]      // coda
// (se C = giorno singolo, entrambe vuote → il giorno resta senza copertura = buco rivendibile)
tx.absenceRelease.create({ bookingId, establishmentId, date: D, source: 'operator', reason })
```
`Booking` **non** viene aggiornato (nessun campo cassa/span cambia). Il constraint `coverage_no_overlap` resta
backstop di sola-race. Ritorna `BookingDTO`.

### 6c. Annullo — `POST /bookings/:id/absence-releases/:rid/cancel`
Guardie: release esiste per quel booking (404) · non già annullata (`canceledAt === null`, 409 `ALREADY_CANCELED`)
· **409 `RESOLD`** se il giorno è già rivenduto (esiste `BookingCoverage` confirmed di **altra** booking sullo
stesso ombrellone con fascia sovrapposta e `date` dentro il suo intervallo — stesso predicato
`dateRangesOverlap` + `slotsOverlap` usato nella rivendita/`reactivate`).
Effetto: ri-copre `[date, date]` per questo booking (nuova riga coverage; frammentazione accettata, come
`reactivate`; il trigger `coverage_fill_slot_minutes_trg` riempie i minuti dalla fascia del Booking) +
`canceledAt = now()`. Ritorna `BookingDTO`.

### 6d. Rivendita — nessun endpoint nuovo
Il buco rende l'ombrellone disponibile per `date`+fascia → l'operatore prenota con il **flusso giornaliero
esistente** (mappa/disponibilità leggono da `BookingCoverage`), che ha il suo incasso a sé. La prenotazione di
rivendita è una `Booking` `type=daily` indipendente.

Dispatch errori mirror `terminate`/`suspend`: `NotFoundException` (404), `UnprocessableEntityException` (422),
`ConflictException` (409).

## 7. Contracts (additivo, non breaking)
```ts
export type AbsenceReleaseSource = 'operator' | 'customer';

export interface AbsenceReleaseDTO {
  id: string;
  date: string;                 // ISO yyyy-mm-dd
  source: AbsenceReleaseSource;
  canceledAt: string | null;    // ISO datetime | null (attiva)
  resold: boolean;              // derivato in projection: il giorno è occupato da altra booking → annullo vietato
  reason?: string;
  createdAt: string;            // ISO datetime
}
// CustomerBookingDTO += absenceConsentAt: string | null;   // stato consenso
// CustomerBookingDTO += absenceReleases: AbsenceReleaseDTO[];   // sempre presente ([] se nessuna)

export interface SetAbsenceConsentInput { consent: boolean; }

export interface ReleaseAbsenceInput {
  date: string;                 // ISO yyyy-mm-dd, ∈ [start, end], ≥ oggi
  reason?: string;
}
```
- `BookingDTO` **non** cambia (mappa/disponibilità non ne hanno bisogno — coerente con suspensions/transfers, su
  `CustomerBookingDTO`). `@coralyn/contracts` va **ricompilato** (`dist/`).
- **`resold`** è derivato dalla projection (query occupazione per ombrellone+fascia+data), così il FE sa se
  mostrare "Annulla" senza un secondo round-trip.

Endpoint (tutti `@Roles(Role.Admin)`, su `Booking`, ritornano `BookingDTO` aggiornato; il FE invalida la query
Scheda → `CustomerBookingDTO` rifetchato riflette consenso + `absenceReleases[]`):
- **`PATCH /bookings/:id/absence-consent`** — `SetAbsenceConsentInput`.
- **`POST /bookings/:id/absence-releases`** — `ReleaseAbsenceInput`.
- **`POST /bookings/:id/absence-releases/:rid/cancel`** — nessun body.

## 8. UI — Scheda cliente `CustomerSubscriptionsCard` (accanto a "Disdici"/"Sospendi"/"Cedi")
- **Azione consenso** sull'abbonamento (solo admin, pattern `isAdmin` già in card): un `Button`
  **"Attiva/Revoca assenze comunicate"** con `ConfirmDialog` (coerente con Disdici/Sospendi, non un componente
  toggle inesistente in ui-kit) → `useSetAbsenceConsent`. Mostra stato + data di attivazione (`absenceConsentAt`).
- Abbonamento confermato/non-disdetto **con consenso attivo** → azione **"Segnala assenza"** →
  `AbsenceReleaseModal`:
  - **data** (`min = max(startDate, oggi)`, `max = endDate`; disabilita/esclude le date con release attiva o
    già sospese);
  - **motivo** (opzionale).
  - Se il consenso **non** è attivo, l'azione è disabilitata con hint "attiva il consenso assenze comunicate".
- Sezione **"Assenze comunicate"** (read-only) sotto l'abbonamento: elenco `absenceReleases` — "Assente il
  {date}" · fonte · stato (**attiva** / **rivenduta** / **annullata**), con azione **Annulla** dove lecito
  (`canceledAt === null && !resold`). Mirror delle righe sospensione/"cessioni effettuate".
- Hook `useReleaseAbsence` / `useCancelAbsenceRelease` con **doppia invalidazione** (bookings + Scheda cliente),
  come `useTransferSubscription`; handler MSW.
- Riusa `Modal`/`Field`/`Input`/`Textarea`/`Button`/`ConfirmDialog` esistenti; **nessun nuovo componente
  ui-kit**.

## 9. Impatto per file (indicativo — dettaglio nel piano)
- **`apps/api/prisma/schema.prisma`** + **migration** (`…_absence_release`): `model AbsenceRelease` + enum
  `AbsenceReleaseSource` + `Booking.absenceConsentAt` + relazioni inverse (`Booking`/`Establishment`), RLS FORCE +
  policy tenant.
- **`packages/contracts/src/index.ts`**: `AbsenceReleaseDTO`, `AbsenceReleaseSource`,
  `CustomerBookingDTO.absenceConsentAt`/`.absenceReleases`, `SetAbsenceConsentInput`, `ReleaseAbsenceInput`.
  Rebuild `dist/`.
- **`apps/api/src/bookings/bookings.controller.ts`**: `@Patch(':id/absence-consent')`,
  `@Post(':id/absence-releases')`, `@Post(':id/absence-releases/:rid/cancel')`, tutti `@Roles(Role.Admin)`.
- **`apps/api/src/bookings/dto/`** (nuovi): `set-absence-consent.dto.ts` (`@IsBoolean consent`),
  `release-absence.dto.ts` (`@IsCalendarDate date`, `@IsOptional @IsString @MaxLength(500) reason`).
- **`apps/api/src/bookings/bookings.service.ts`**: `setAbsenceConsent(id, input)`,
  `releaseAbsence(id, input)` (invarianti §6b + carve giorno-singolo), `cancelAbsenceRelease(id, rid)`
  (invarianti §6c + re-cover). Riuso helper esistenti (`toDbDate`, `todayInRome`, `dateRangesOverlap`,
  `slotsOverlap`).
- **`apps/api/src/bookings/customer-booking.projection.ts`** + query `listByCustomer`: carica `absenceReleases`
  + `absenceConsentAt`, calcola `resold` per riga (occupazione ombrellone+fascia+data da altra booking), mappa
  `toAbsenceReleaseDTO`.
- **spec api**: unit (guardie 422/409/404 dei tre endpoint; carve giorno-singolo testa/coda/giorno-isolato;
  `amountCollected`/`refundedAmount` **invariati** dopo release; `resold` gate sull'annullo) + e2e (admin happy:
  consenso→release→buco→rivendita giornaliera nel buco→annullo-se-non-rivenduto; 403 staff; 404 tenant altrui;
  `NO_CONSENT` 422; `PAST_DATE`/`BAD_DATE` 422; doppia-release 409; cancel-dopo-rivendita 409; occupazione della
  mappa mostra il buco disponibile).
- **`apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue`**: toggle consenso (admin) + azione
  "Segnala assenza" + azione consenso (Button+ConfirmDialog) + sezione "Assenze comunicate".
- **`apps/web-staff/src/features/customers/AbsenceReleaseModal.vue`** (nuovo).
- **`apps/web-staff/src/features/customers/useCustomers.ts`**: `useSetAbsenceConsent`, `useReleaseAbsence`,
  `useCancelAbsenceRelease` (doppia invalidazione).
- **spec FE**: card (azione consenso admin-only, "Segnala assenza" disabilitata senza consenso, sezione release
  con stati/annullo),
  modale (bound date, esclusione date, payload), invalidazione. **`apps/web-staff/src/mocks/server.ts`** + seed:
  handler dei tre endpoint per i test FE.

## 10. Cosa NON cambia
- **Span di contratto / prezzo / seniority / prelazione / rinnovo**: intatti — la release non tocca `Booking`
  (nessun campo span/cassa) né la catena `previousBookingId`.
- **`amountCollected` / `refundedAmount` / netto**: **invariati** sull'abbonato (ADR-0048). Il valore recuperato
  è sulla prenotazione di rivendita, indipendente.
- **Modello occupazione `BookingCoverage` / constraint `coverage_no_overlap` / trigger minuti**: **riusati**, non
  modificati. Il carve è la versione a giorno-singolo di quello della sospensione; nessuna colonna nuova su
  coverage (il sub-slot è deferito, §14).
- **Disdetta / sospensione / cessione** (D-013): invariate; la release le rispetta (no release su disdetto; una
  data già in buco → `NO_COVERAGE`).
- **Flusso di prenotazione giornaliera / mappa / disponibilità**: invariati — la rivendita usa il flusso
  esistente.

## 11. Verifiche pre/post
- **Buco creato**: dopo `release`, `BookingCoverage` dell'abbonamento ha un buco su `date`+fascia; la mappa
  mostra l'ombrellone **disponibile** quel giorno per quella fascia. Coperto da unit + e2e.
- **Cassa abbonato invariata**: `amountCollected` e `refundedAmount` dell'abbonamento **identici** prima/dopo la
  release; netto invariato. Coperto da unit + e2e.
- **Rivendita indipendente**: una `Booking` `type=daily` nel buco ha il suo `amountCollected`; l'abbonamento non
  ne è toccato.
- **Vincolo dell'annullo**: annullo su release non-rivenduta ri-copre il giorno (mappa torna occupata); annullo
  su release **rivenduta** → 409. Coperto da e2e.
- **Gate consenso**: release senza consenso attivo → 422; dopo revoca del consenso, nuove release → 422, ma le
  release già registrate restano. Coperto da e2e.

## 12. Test / baseline (da non regredire)
Baseline `main` `c7e9d06`: api unit **223** · api e2e **273** (`--runInBand`) · web-staff **348** · ui-kit **111**
· web-platform **16** · typecheck pulito. Gotcha: rebuild `@coralyn/contracts` prima di typecheck/e2e; gate
typecheck FE reale = `corepack pnpm --filter @coralyn/web-staff run typecheck` (`vue-tsc -b`), **non**
`vue-tsc --noEmit`; **ogni** `.spec.ts` importa da `vitest`; `migrate deploy` a **dev E test** (env alla radice
repo, `dotenv-cli`), mai `db push`; e2e ts-jest **type-checka** → `--runInBand`; purge azzera Prisma client
(rigenerare); migrazione con RLS FORCE + policy (nessun backfill: tabella nuova vuota; `absenceConsentAt`
nullable → nessun backfill).

## 13. Rubric check ([ADR-0002])
1. **Professionalità** — sblocca il recupero-incasso rispettando l'invariante "nessuna presunzione d'assenza"
   (release esplicita, consenso-gated, vincolante); la semantica economica è motivata da un principio esplicito
   (rinuncia-al-diritto), non da un'intuizione.
2. **Convenzioni** — mirror esatto di `suspend`/`reactivate` (admin-only, tx `forTenant`, invarianti →
   422/409/404, carve su `BookingCoverage`, `toBookingDTO`); tabella figlia RLS FORCE come `BookingSuspension`;
   `PATCH` idempotente per il toggle consenso (REST-corretto vs i comandi-POST irreversibili); consenso
   single-timestamp come `terminatedAt`.
3. **Modularità** — `AbsenceRelease` è pura storia; consenso, occupazione e release restano concetti separati; la
   rivendita è una prenotazione indipendente (nessun accoppiamento di cassa con l'abbonamento); `source`
   incapsula l'estensione S4 senza toccare il resto.
4. **Zero debito** — `amountCollected`/`refundedAmount` non sporcati (ADR-0048 motiva il perché); il sub-slot
   più fine e l'audit-attore sono **tracciati** (§14, [D-047]) non silenziosi; `source` non è speculativo
   (registra un fatto vero e prepara S4 senza retrofit/backfill); nessuno stato duplicato (il buco vive solo su
   coverage, la storia solo su `AbsenceRelease`).

## 14. Fuori scope / deferito
- **Canale cliente self-service (S3 auth cliente + S4 PWA/QR)**: le prossime sotto-slice di D-035. Portano il
  tenant-routing pubblico (sottodominio/path/QR), l'auth cliente (D-026/027/028/029), il `401` FE (D-037). La
  fonte `customer` su `AbsenceRelease` è già predisposta.
- **Release di una sotto-fascia più fine della fascia dell'abbonamento** (Opzione 2 del brainstorming, es.
  abbonamento "intera giornata" che libera solo la mattina): richiederebbe minuti-fascia indipendenti per riga
  `BookingCoverage` → estensione strutturale. Additiva in futuro se emerge la domanda.
- **Audit dell'attore admin** (chi ha dato/revocato il consenso, chi ha registrato/annullato la release):
  **[D-047]**, coerente con l'assenza di `createdBy` su `BookingSuspension`/`BookingTransfer`.
- **Accesso `staff` (non-admin) alla registrazione release**: raffinamento operativo futuro; slice 1 è admin-only
  per coerenza e prudenza.
- **Notifiche / lista d'attesa sul posto liberato** (avvisare l'operatore o candidati alla rivendita): lega a
  **[D-006]**; fuori scope.
- **Rettifica di una release rivenduta** (l'abbonato "torna" dopo la rivendita): impossibile per costruzione (il
  posto è di un altro) — è il senso di "vincolante".

## 15. ADR
Nuovo **[ADR-0048] "Assenze comunicate: release dell'occupazione senza compensazione (rinuncia all'uso ≠
rinuncia al diritto)"** — decide: (a) una release è un **carve a giorno-singolo** su `BookingCoverage` (mirror
sospensione) che **non tocca lo span** né la cassa dell'abbonato; (b) il principio *compensazione = rinuncia al
diritto, non mancato utilizzo* che distingue release (zero cassa) da sospensione (rimborso) e cessione (movimento
netto); (c) la release è **consenso-gated** e **vincolante** (nessuna presunzione d'assenza), con `AbsenceRelease`
come storia RLS-FORCE e `source` predisposto per il canale cliente. Additivo su [ADR-0046] (coverage) e [ADR-0011]
(incasso base); non tocca [ADR-0047].

## 16. Prossimi passi
0. **Design docs ([ADR-0009], con questa spec):** `docs/design/data-model.md` — ER += `AbsenceRelease` (+ nota
   `Booking.absenceConsentAt`); `docs/design/flows.md` — flusso consenso→release→carve→rivendita + guardie;
   `docs/design/mockups/absence-release-modal.html` — la modale. (Assenze comunicate marcate *design, non ancora
   implementate*.)
1. **Ok utente su questa spec.**
2. `writing-plans` (TDD; ordine per layer: schema+migration+contracts → service `setAbsenceConsent`/
   `releaseAbsence`/`cancelAbsenceRelease` + invarianti + carve → controller + e2e → FE card (toggle + azione +
   sezione release) + modale + mock → ADR-0048 + design docs).
3. `subagent-driven-development` + review a due stadi + whole-branch (opus) → verifica LIVE su Docker →
   presentare e attendere conferma per il merge FF (push su `main` **solo** con ok esplicito).
4. Al merge: aggiornare [`deferred.md`] — **D-035** avanzato (S1+S2 fatte; aprire/segnare le sotto-slice S3/S4
   con la decomposizione concordata); prossimo D libero **D-049**, prossimo ADR libero **0049**.

[ADR-0002]: ../../architecture/decisions/0002-decision-rubric.md
[ADR-0009]: ../../architecture/decisions/0009-documentazione-di-design.md
[ADR-0011]: ../../architecture/decisions/0011-incasso-base-nel-core.md
[ADR-0046]: ../../architecture/decisions/0046-occupazione-a-intervalli-coverage.md
[ADR-0047]: ../../architecture/decisions/0047-cessione-subentro-titolarita-incasso.md
[D-006]: ../../architecture/deferred.md
[D-034]: ../../architecture/deferred.md
[D-047]: ../../architecture/deferred.md
[`deferred.md`]: ../../architecture/deferred.md
