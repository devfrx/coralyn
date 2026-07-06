# Spec — Disdetta anticipata dell'abbonamento + rimborso (D-013, sotto-slice 1/3)

> Design **CONFERMATO** in brainstorming con l'utente (2026-07-06). Prima sotto-slice di **D-013**
> (sospensione / cessione / disdetta abbonamento): qui **solo la disdetta anticipata con rimborso**.
> Cessione/subentro e sospensione temporanea restano deferite (sotto-item di D-013). **NON FE-only**:
> schema + migration + contracts + api + FE. **Nessun nuovo ADR** (additivo sul modello `Booking`
> esistente, ADR-0011/ADR-0012/ADR-0037 invariati). Prossima azione dopo l'ok utente sulla spec:
> `writing-plans` (TDD).

---

## 1. Problema

Un abbonamento (`Booking type=subscription`) occupa ombrellone+fascia per l'intera stagione
(`startDate`–`endDate`). Oggi l'unico modo di chiuderlo è `cancel` (DELETE, staff-accessible), che fa
`status=cancelled`: la prenotazione **sparisce dall'intera stagione**, passato incluso. Va bene per
**voidare un errore** ("mai avvenuta"), ma è sbagliato per una **disdetta anticipata** reale — il
cliente *era* un abbonato valido fino a un certo giorno, poi lascia a metà stagione. Con `cancel` si
perde lo storico (l'abbonato scompare del tutto) e non c'è alcuna traccia del **rimborso** della quota
non goduta. Nel registro D-013: *"esigenza concreta (subentri, rimborsi); MVP gestibile a mano
(annulla + ricrea)"* — questo hack è appunto il debito che chiudiamo.

## 2. Modello di dominio (confermato)

Due operazioni **semanticamente distinte**, entrambe legittime, che **restano separate**:

- **Void** (`cancel`, esistente, staff) — la prenotazione non doveva esistere → `status=cancelled`,
  sparisce. **Invariato.**
- **Disdetta anticipata** (`terminate`, nuovo, admin) — un abbonamento **valido** che finisce
  **prima** della fine stagione. Lo storico si preserva; il posto si libera **dal giorno di disdetta in
  poi**; l'eventuale rimborso della quota non goduta è tracciato.

Una disdetta è definita da una **data effettiva** `E` = primo giorno in cui il posto torna libero.
L'abbonato resta valido `startDate … E-1`; il posto è rivendibile `E … stagione`.

## 3. Decisioni (CONFERMATE)

### 3.1 Modello: tronca `endDate` + `terminatedAt` (niente nuovo enum)
Alla disdetta, sul `Booking`:
- `status` **resta `confirmed`** (era ed è un abbonamento valido, solo più corto).
- `endDate` viene **troncata** a `E-1` (ultimo giorno di validità).
- `terminatedAt` (nuovo) = timestamp della disdetta → **marca** la chiusura anticipata, distinguendola
  da un abbonamento nato corto.

**Perché troncare `endDate` invece di aggiungere uno status o filtrare in projection:**
l'occupazione è già **date-ranged** (la mappa/report interrogano le booking che coprono una data). Troncando
`endDate`, il posto si libera per `E …` **senza toccare la projection né la mappa**: la modifica resta
localizzata al `Booking`. Il vincolo DB `booking_no_overlap` (ADR-0037, `daterange [startDate,endDate]`) si
**restringe** → nessun conflitto introdotto, e una nuova prenotazione sulle date liberate non si sovrappone.
**Nessun valore aggiunto a `BookingStatus`** → zero rotture delle mappe esaustive `Record<BookingStatus>`
(gotcha noto evitato).

### 3.2 Rimborso: suggerimento pro-rata (FE), operatore sovrascrive, server valida solo i bound
La quota rimborsata è **discrezione dell'operatore**: ogni lido ha la sua policy (penali, finestre
no-refund, forfait). Quindi **non** esiste un rimborso "autoritativo" imposto dal server.
- Il **FE mostra un suggerimento** pro-rata calcolato dai campi che la Scheda già possiede
  (`totalPrice`, `amountCollected`, `startDate`, `endDate`):
  ```
  plannedDays   = (endDate − startDate) + 1            // giorni pianificati, inclusivi
  servedDays    = E − startDate                        // giorni goduti (startDate … E-1)
  earnedValue   = round2(totalPrice × servedDays / plannedDays)
  suggested     = clamp(amountCollected − earnedValue, 0, amountCollected)
  ```
- L'operatore **modifica liberamente** l'importo. Il server **non ricalcola** il suggerimento (non è un
  prezzo) → **la formula vive solo nel FE**, nessuna duplicazione, nessun endpoint preview.
- Il server valida **solo gli invarianti** (§3.4). Single-source-of-truth non violata: non c'è una
  "verità" server sul rimborso da duplicare.

### 3.3 Persistenza del rimborso (additivo, stile denormalizzato esistente)
I pagamenti sono già denormalizzati su `Booking` (`amountCollected`, `paymentStatus`, `paymentMethod`,
`collectionDate`). Coerentemente aggiungiamo:
- `refundedAmount Decimal @default(0) @db.Decimal(10,2)` — soldi resi (0 = nessun rimborso).
- `terminationReason String?` — nota operatore opzionale.

`paymentStatus` **resta invariato** (riflette l'incasso *in entrata*; il rimborso è denaro *in uscita*).
Il netto incassato = `amountCollected − refundedAmount` (usabile dai report, §7). **Nessun `refundedAt`
separato** (coincide con `terminatedAt`): YAGNI.

### 3.4 Invarianti backend (validati in transazione, tenant-scoped RLS)
- **Tipo**: solo `type === 'subscription'` → altrimenti `422` (daily/periodic usano `cancel`).
- **Stato**: solo `status === 'confirmed'` → `422` se `cancelled`.
- **Non già disdetto**: `terminatedAt === null` → `409` se già disdetto (non idempotente: ri-disdire con
  importi diversi sarebbe ambiguo).
- **Data effettiva**: `startDate < E ≤ endDate` → `422` fuori range. (`E === startDate` = "mai usato" →
  è un void, si usa `cancel`, non la disdetta.)
- **Rimborso**: `0 ≤ refundAmount ≤ amountCollected` → `422` fuori bound (non si rimborsa più di quanto
  incassato).

### 3.5 Contracts (additivo, non breaking)
```ts
// BookingDTO e CustomerBookingDTO (stessi 3 campi):
refundedAmount: number;        // sempre presente (default 0)
terminatedAt?: string;         // ISO datetime; assente = non disdetto
terminationReason?: string;    // assente = nessuna nota

// Nuovo input:
export interface TerminateSubscriptionInput {
  effectiveDate: string;       // ISO yyyy-mm-dd — primo giorno di posto libero (E)
  refundAmount: number;        // importo finale deciso dall'operatore (≥0, ≤ amountCollected)
  reason?: string;
}
```
Endpoint: **`POST /bookings/:id/terminate`** → ritorna `BookingDTO` aggiornata.
`@coralyn/contracts` va ricompilato (`dist/` gitignored) prima di typecheck/e2e.

### 3.6 Autorizzazione: **admin-only** (CONFERMATO dall'utente)
`POST /bookings/:id/terminate` è `@Roles(Role.Admin)` — coerente con le altre azioni consequenziali che
muovono dati/denaro (GDPR delete, gestione staff, rename). Lo staff conserva `cancel` (void di errori) ma
**non** può disdire+rimborsare. Nel FE il bottone "Disdici" è nascosto ai non-admin (pattern `isAdmin`
già in uso in `CustomerDetailView`/`EstablishmentView`).

### 3.7 UI — Scheda cliente → `CustomerSubscriptionsCard`
Casa naturale: la card degli abbonamenti nella Scheda 360. Per ogni abbonamento:
- **Confermato, non disdetto, stagione in corso** → bottone **"Disdici"** (solo admin) → apre
  `TerminateSubscriptionModal`:
  - **Data effettiva** (input date; default `session.activeDate`/oggi; `min = startDate+1`, `max = endDate`).
  - **Rimborso suggerito** (calcolato §3.2, mostrato) in un campo **editabile** (override operatore).
  - **Motivo** (textarea opzionale).
  - Conferma via pattern `ConfirmDialog`/`Modal` esistente → `POST …/terminate` → invalida la query della
    Scheda → la card si aggiorna.
- **Disdetto** (`terminatedAt` valorizzato) → riga di stato **"Disdetto il {data} · rimborso €{importo}"**
  (+ motivo se presente), nessun bottone.

Riusa `Modal`/`Field`/`Input`/`ConfirmDialog` di ui-kit; **nessun nuovo componente ui-kit**.

## 4. Impatto per file (indicativo — dettaglio nel piano)
- **`apps/api/prisma/schema.prisma`** + **migration** (`…_subscription_termination`): `Booking` +=
  `terminatedAt DateTime?`, `terminationReason String?`, `refundedAmount Decimal @default(0) @db.Decimal(10,2)`.
  `migrate deploy` su dev **e** test (mai `db push`).
- **`packages/contracts/src/index.ts`**: 3 campi su `BookingDTO`/`CustomerBookingDTO`; `TerminateSubscriptionInput`.
  Rebuild `dist/`.
- **`apps/api/src/bookings/bookings.controller.ts`**: `@Post(':id/terminate')` `@Roles(Role.Admin)`.
- **`apps/api/src/bookings/dto/terminate-subscription.dto.ts`** (nuovo): validazione input.
- **`apps/api/src/bookings/bookings.service.ts`**: `terminate(id, input)` — invarianti §3.4, troncamento
  `endDate=E-1`, `terminatedAt=now`, `terminationReason`, `refundedAmount`; ritorna DTO. Le projection
  DTO (`toBookingDTO`/`toCustomerBookingDTO`) mappano i 3 nuovi campi.
- **`apps/api/src/bookings/bookings.service.spec.ts`**: invarianti (422/409), happy (troncamento + campi),
  edge math nota: disdetta a `startDate+1` (rimborso ~pieno) / a `endDate` (rimborso ~minimo) / clamp.
- **`apps/api/test/bookings.e2e-spec.ts`**: happy (admin) + `403` (staff) + `404` (tenant altrui) +
  `422/409` (invarianti) + verifica che il posto si liberi dopo `E` (una nuova booking sulle date liberate
  passa; prima della disdetta darebbe `409 booking_no_overlap`).
- **`apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue`**: bottone "Disdici" (admin) +
  riga stato disdetto. Riceve `isAdmin` (già calcolato in `CustomerDetailView`).
- **`apps/web-staff/src/features/customers/TerminateSubscriptionModal.vue`** (nuovo): data effettiva,
  rimborso suggerito editabile, motivo, submit.
- **`apps/web-staff/src/features/customers/useCustomers.ts`** (o hook bookings): `useTerminateSubscription`
  (`invalidates` → query Scheda cliente).
- **spec FE**: card (bottone admin-only / nascosto staff / riga disdetto), modale (suggerimento calcolato,
  bound data, payload submit), invalidazione.
- **`apps/web-staff/src/mocks/server.ts`** + seed: un abbonamento nella Scheda mock + handler
  `POST /bookings/:id/terminate` per i test FE.

## 5. Verifiche pre/post-implementazione
- **Liberazione posto**: dopo disdetta con `E`, la mappa/lista mostra il posto **libero** da `E`; una nuova
  prenotazione sulle date `≥ E` **passa** (prima: `409 booking_no_overlap`). Coperto da e2e.
- **Storico**: l'abbonamento disdetto resta visibile nella Scheda (non sparisce come col `cancel`), con
  `seniority` invariata e la riga "Disdetto il …".
- **Nessuna regressione** su `cancel` esistente (void), su create/renew/quote, sull'occupazione mappa.

## 6. Test / baseline (da non regredire)
Baseline su `main` `a77cd03`: ui-kit **79** · web-staff **273** · web-platform **16** · api unit **205** ·
api e2e **235** (`--runInBand`) · typecheck pulito. Gotcha rilevanti: rebuild `@coralyn/contracts` prima di
typecheck/e2e; `migrate deploy` a dev+test; e2e ts-jest **type-checka**; il purge può azzerare il Prisma
client (rigenerare se i test api falliscono con errori Prisma).

## 7. Fuori scope / deferito
- **Cessione/subentro** e **sospensione temporanea**: le altre due sotto-slice di **D-013** (la sospensione
  in sinergia con **D-035** assenze comunicate, con cui condivide "posto rivendibile in una finestra").
- **Report revenue-netting dei rimborsi**: i report attuali sono su **occupazione/stateMix**, non su
  revenue; il netto `amountCollected − refundedAmount` è pronto nel dato ma la sua aggregazione nei report è
  **deferita** (lega a **D-036** report avanzato).
- **Metodo di rimborso** (`refundMethod`) e ricevuta/nota di credito: fuori scope (si aggiunge se emerge).
- **Riapertura/annullo di una disdetta**: fuori scope (una disdetta è definitiva; correzione = supporto dati).

## 8. Prossimi passi
Registrare in [`deferred.md`](../../architecture/deferred.md) che **D-013 è in corso (sotto-slice 1/3:
disdetta+rimborso)**. `writing-plans` (TDD, ordine per layer: schema+migration+contracts → service+invarianti
→ controller+e2e → FE card/modale/mock) → `subagent-driven-development` → review a due stadi + whole-branch
(opus) → verifica LIVE (api + web-staff) → presentare e attendere conferma per il merge FF.
