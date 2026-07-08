# Spec — Sospensione temporanea dell'abbonamento (D-013, sotto-slice 3/3)

> Design **CONFERMATO** in brainstorming con l'utente (2026-07-08). **Spec 2 di 2** della sotto-slice
> sospensione di **D-013** (la Spec 1 — refactor `BookingCoverage`/[ADR-0046] — è **mergiata** su `main`
> `133cfc7`). Qui la **sospensione vera**: un abbonato libera un periodo del proprio abbonamento (rivendita
> abilitata) e poi riprende. **NON FE-only**: schema + migration + contracts + api + FE. **Additiva su
> `BookingCoverage`** (nessuna modifica al modello d'occupazione, nessun nuovo ADR — la fondazione è già
> decisa). Prossima azione dopo l'ok utente sulla spec: `writing-plans` (TDD).

---

## 1. Problema

Un abbonamento (`Booking type=subscription`) occupa ombrellone+fascia per l'intera stagione. Quando
l'abbonato è via per un periodo (es. una settimana di viaggio), oggi non c'è modo di **liberare quei
giorni per rivenderli** e riconoscere un credito, senza distruggere l'abbonamento. La disdetta ([sotto-slice
1/3](2026-07-06-subscription-termination-refund-design.md)) tronca la **coda** in modo permanente; la
sospensione è un **buco nel mezzo** con ripresa. La Spec 1 ha reso questo esprimibile: l'occupazione fisica
vive su `BookingCoverage` (1..N intervalli), quindi un buco = un carve degli intervalli.

**Invariante di dominio (lega a [D-035](../../architecture/deferred.md)):** rivendere il posto di un
abbonato è lecito **solo su atto esplicito**. La sospensione è quell'atto esplicito e concordato
operatore↔abbonato — quindi la rivendita nel buco **non** viola il principio "niente presunzione d'assenza".

## 2. Modello di dominio (confermato)

Due dimensioni ortogonali, già separate dalla Spec 1 e **invariate** qui:
- **Span di contratto** (`Booking.startDate/endDate`) — cosa ha comprato l'abbonato: guida prezzo, rinnovo,
  **prelazione**, seniority. La sospensione **non lo tocca**: un abbonato sospeso resta un abbonato con tutti
  i diritti di contratto.
- **Copertura effettiva** (`BookingCoverage`) — occupazione fisica: la sospensione ci scava un buco.

**Due modalità** unificate da un'unica `endDate` nullable sul record di sospensione:
- **Chiusa** — l'operatore conosce il ritorno: sospende `[S, R-1]`. La copertura si spezza in
  `[start, S-1]` + `[R, end]`; `[R, end]` resta **riservato** all'abbonato (nessun conflitto al ritorno);
  nessuna azione successiva.
- **Aperta** — ritorno ignoto: sospende `[S, …)`. La copertura si **tronca** a `[start, S-1]`; tutto da `S`
  è libero a tempo indeterminato. Una successiva azione **Riattiva** fissa il ritorno `R` e ri-aggiunge
  `[R, end]`.

## 3. Decisioni (CONFERMATE con l'utente)

1. **Direzione: solo da oggi in avanti** — `S ≥ oggi` (data operativa). Si sospendono solo giorni ancora
   vendibili; nessuna sospensione retroattiva (rivendere il passato è impossibile).
2. **Rimborso operatore-discrezionale** (mirror disdetta [§3.2](2026-07-06-subscription-termination-refund-design.md)):
   il FE **suggerisce** un pro-rata sui giorni sospesi, l'operatore lo **sovrascrive**, il server valida
   **solo i bound**. La formula vive **solo nel FE** (nessun endpoint preview, nessuna duplicazione).
3. **Rimborso dell'aperta: alla riattivazione** — l'apertura non registra rimborso; la Riattiva calcola il
   pro-rata sui giorni **realmente** sospesi `[S, R-1]`. Un solo movimento, sui giorni reali.
4. **Rimborso aggregato su `Booking.refundedAmount`** — ogni rimborso di sospensione **incrementa** il
   totale già scritto dalla disdetta, così il netto `amountCollected − refundedAmount` resta **fonte unica**
   per i report. Il dettaglio per-sospensione vive sul record.
5. **Conflitto di riattivazione (solo aperta) → 409** — al ritorno `R`, se `[R, booking.endDate]` contiene
   prenotazioni confermate (walk-in vendute durante la sospensione aperta), la Riattiva è **rifiutata** con
   messaggio guida. La chiusa non ha mai questo caso (`[R, end]` non è mai stato ceduto). Protegge
   l'invariante anti-double-booking ([ADR-0037]/[ADR-0046]).

## 4. Modello dati (additivo)

Nuova tabella figlia **`BookingSuspension`** (un abbonamento può avere più sospensioni **non
sovrapposte** nel tempo):
```prisma
model BookingSuspension {
  id              String    @id @default(uuid()) @db.Uuid
  bookingId       String    @db.Uuid
  establishmentId String    @db.Uuid          // RLS FORCE tenant-scoped
  startDate       DateTime  @db.Date          // S — primo giorno sospeso
  endDate         DateTime? @db.Date          // R-1 — ultimo giorno sospeso; NULL = aperta (da riattivare)
  refundedAmount  Decimal   @default(0) @db.Decimal(10, 2)  // rimborso di QUESTA sospensione
  reason          String?
  reactivatedAt   DateTime?                    // valorizzato quando un'aperta viene chiusa via Riattiva
  createdAt       DateTime  @default(now())

  booking       Booking       @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  establishment Establishment @relation(fields: [establishmentId], references: [id])
  @@index([bookingId])
  @@index([establishmentId])
}
```
- Discriminatore "in corso / da riattivare" = **`endDate IS NULL`**.
- **RLS FORCE** tenant-scoped su `establishmentId`, come le altre tabelle di dominio; `onDelete: Cascade`.
- Nessuna colonna denormalizzata per un constraint (a differenza di `BookingCoverage`): l'anti-overlap è
  garantito dalla copertura, non dalla sospensione. `BookingSuspension` è pura storia/accountability.

### 4.1 Meccanica del carve su `BookingCoverage` (dentro la tx, tenant-scoped)
- **Sospendi chiusa `[S, R-1]`:** trova l'**unico** intervallo di copertura `C` con `C.start ≤ S` e
  `R-1 ≤ C.end` (altrimenti 422: non si sospende a cavallo di un buco). Elimina `C`; reinserisci
  `[C.start, S-1]` se `S > C.start` e `[R, C.end]` se `R ≤ C.end` (intervalli vuoti omessi). I minuti li
  riempie il trigger; `status='confirmed'`.
- **Sospendi aperta `[S, …)`:** trova `C` con `C.start ≤ S ≤ C.end`; sostituiscilo con `[C.start, S-1]`
  (o eliminalo se `S = C.start`) ed elimina eventuali intervalli interamente `≥ S`.
- **Riattiva `R`:** pre-check anti-overlap su `[R, booking.endDate]` (stesso pattern di `priceAndWrite`,
  contro le coperture di **altre** prenotazioni sullo stesso ombrellone+fascia) → conflitto = **409**;
  altrimenti inserisci copertura `[R, booking.endDate]`; il constraint DB resta backstop.

## 5. Rimborso: suggerimento pro-rata (FE)
```
plannedDays   = (booking.endDate − booking.startDate) + 1      // giorni pianificati, inclusivi
suspendedDays = R − S                                          // = (R-1) − S + 1, giorni di [S, R-1]
suggested     = round2(totalPrice × suspendedDays / plannedDays)
clamp(suggested, 0, amountCollected − refundedAmount)          // non oltre il residuo incassato
```
Per la **chiusa** al momento della sospensione; per l'**aperta** al momento della Riattiva (con `R` scelto
allora). Solo FE; il server non ricalcola (§3.2).

## 6. Invarianti backend (validati in transazione, tenant-scoped RLS, admin-only)
Comuni a `suspend`: **tipo** `subscription` (422); **stato** `confirmed` (422); **non disdetto**
(`terminatedAt === null`, 422); `S ≥ oggi` (422); `[S, …]` cade dentro una copertura **futura** esistente,
non un periodo già libero (422); **una sola sospensione aperta per abbonamento** (`endDate IS NULL` già
presente → 409); rimborso `0 ≤ r ≤ amountCollected − refundedAmount` (422).
- **Chiusa** in più: `S ≤ R-1` e `R-1 < booking.endDate` (dev'esserci un ritorno **entro** la stagione;
  se coincide con la fine stagione → 422 con hint "usa la disdetta"); `[S, R-1]` dentro **un** intervallo di
  copertura (422 altrimenti).
- **Reactivate**: la sospensione esiste ed è **aperta** (`endDate IS NULL`, altrimenti 404/409); `S < R ≤
  booking.endDate` (422); `[R, booking.endDate]` libero da conflitti (409, §3.5-#5); rimborso nei bound (422).

## 7. Contracts (additivo, non breaking)
```ts
export interface SuspensionDTO {
  id: string;
  startDate: string;            // ISO yyyy-mm-dd
  endDate?: string;             // assente = aperta (in corso)
  refundedAmount: number;
  reason?: string;
  reactivatedAt?: string;       // ISO datetime; presente = aperta poi riattivata
}
// CustomerBookingDTO += suspensions: SuspensionDTO[];   // sempre presente ([] se nessuna)

export interface SuspendSubscriptionInput {
  startDate: string;            // S (≥ oggi)
  endDate?: string;             // R-1 per la chiusa; assente = aperta
  refundAmount?: number;        // per la chiusa; assente/0 per l'aperta
  reason?: string;
}
export interface ReactivateSubscriptionInput {
  returnDate: string;           // R
  refundAmount: number;
  reason?: string;
}
```
Endpoint (admin-only, `@Roles(Role.Admin)`), su `Booking`, ritornano `BookingDTO` aggiornato (mirror
`terminate`); il FE invalida la query Scheda → `CustomerBookingDTO` rifetchato mostra `suspensions[]` +
lo stato mappa derivato dalla copertura:
- **`POST /bookings/:id/suspend`** — `SuspendSubscriptionInput`.
- **`POST /bookings/:id/reactivate`** — `ReactivateSubscriptionInput`.

`BookingDTO` **non** cambia (mappa/liste non mostrano le sospensioni). `@coralyn/contracts` va ricompilato.

## 8. UI — Scheda cliente `CustomerSubscriptionsCard` (accanto a "Disdici")
- Abbonamento confermato/non-disdetto con copertura **futura** → **"Sospendi"** (solo admin, pattern
  `isAdmin` già in card) → `SuspendSubscriptionModal`: toggle **Chiusa** (data inizio + data ritorno +
  rimborso suggerito editabile + motivo) / **Aperta** (solo data inizio + motivo). Bound date: `min = oggi`,
  `max = booking.endDate`.
- Sospensione **aperta in corso** (`endDate` assente) → riga "Sospeso dal {S} (in corso)" + **"Riattiva"**
  (admin) → `ReactivateSubscriptionModal`: data ritorno (`min = S+1`, `max = booking.endDate`) + rimborso
  suggerito sui giorni reali + motivo.
- Sospensioni **concluse** → riga storica "Sospeso dal {S} al {R-1} · rimborso €{importo}" (+ motivo).
- Riusa `Modal`/`Field`/`Input`/`Textarea`/`ConfirmDialog` esistenti; **nessun nuovo componente ui-kit**.
  Segmented/toggle per le due modalità con il pattern già in uso.

## 9. Impatto per file (indicativo — dettaglio nel piano)
- **`apps/api/prisma/schema.prisma`** + **migration** (`…_booking_suspension`): `model BookingSuspension`
  (+ relazione `suspensions` su `Booking`, inversa su `Establishment`), RLS FORCE + policy tenant.
- **`packages/contracts/src/index.ts`**: `SuspensionDTO`, `CustomerBookingDTO.suspensions`,
  `SuspendSubscriptionInput`, `ReactivateSubscriptionInput`. Rebuild `dist/`.
- **`apps/api/src/bookings/bookings.controller.ts`**: `@Post(':id/suspend')` / `@Post(':id/reactivate')`
  `@Roles(Role.Admin)`.
- **`apps/api/src/bookings/dto/`** (nuovi): `suspend-subscription.dto.ts`, `reactivate-subscription.dto.ts`.
- **`apps/api/src/bookings/bookings.service.ts`**: `suspend(id, input)` + `reactivate(id, input)` —
  invarianti §6, carve copertura §4.1, `BookingSuspension` create/update, incremento `Booking.refundedAmount`.
- **`apps/api/src/bookings/customer-booking.projection.ts`**: mappa `suspensions[]` sul DTO.
- **spec api**: unit `suspend`/`reactivate` (invarianti 422/409, happy chiusa/aperta, carve, riattiva-conflitto,
  math rimborso/clamp) + e2e (admin happy; 403 staff; 404 tenant altrui; il buco si libera e una nuova
  prenotazione nel buco passa; `[R,end]` resta occupato in chiusa; riattiva-conflitto 409; refund aggregato).
- **`apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue`**: bottoni Sospendi/Riattiva
  (admin) + righe stato sospensione.
- **`apps/web-staff/src/features/customers/SuspendSubscriptionModal.vue`** + **`ReactivateSubscriptionModal.vue`**
  (nuovi).
- **`apps/web-staff/src/features/customers/useCustomers.ts`** (o hook bookings): `useSuspendSubscription` /
  `useReactivateSubscription` (invalidano la query Scheda).
- **spec FE**: card (bottoni admin-only, righe stato), modali (suggerimento calcolato, bound date, toggle
  modalità, payload), invalidazione. **`apps/web-staff/src/mocks/server.ts`** + seed: un abbonamento nella
  Scheda mock + handler `suspend`/`reactivate` per i test FE.

## 10. Cosa NON cambia
- **Report / occupancy**: zero modifiche — l'occupazione legge già `BookingCoverage` (buco = libero,
  walk-in = occupato); il netto usa `Booking.refundedAmount` (ora include anche le sospensioni).
- **Prelazione / rinnovo / prezzo / stagione / GDPR**: intatti — leggono lo span nominale, che la
  sospensione non tocca. **Un abbonato sospeso conserva prelazione e rinnovo.**
- **Disdetta** ([sotto-slice 1/3]): invariata; `suspend` la rispetta (non si sospende un disdetto).

## 11. Verifiche pre/post
- **Buco liberato**: dopo `suspend [S,R-1]`, la mappa mostra libero da `S` a `R-1`; una nuova prenotazione
  in quel buco **passa**; `[R,end]` resta occupato dall'abbonato. Coperto da e2e.
- **Riattiva pulita vs conflitto**: aperta → riattiva senza walk-in nel rientro = ok; con walk-in in
  `[R,end]` = **409**. Coperto da e2e.
- **Storico + diritti**: l'abbonamento sospeso resta nella Scheda con la riga sospensione; **prelazione e
  rinnovo invariati** (regressione verde).
- **Netto**: `amountCollected − refundedAmount` riflette la somma disdetta + sospensioni.

## 12. Test / baseline (da non regredire)
Baseline `main` `133cfc7`: api unit **209** · api e2e **249** (`--runInBand`) · web-staff **316** · ui-kit
**111** · web-platform **16** · typecheck pulito. Gotcha: rebuild `@coralyn/contracts` prima di
typecheck/e2e; `migrate deploy` a dev+test; e2e ts-jest **type-checka**; purge azzera Prisma client
(rigenerare). Migrazione con RLS FORCE + policy (nessun backfill: tabella nuova vuota).

## 13. Rubric check ([ADR-0002])
1. **Professionalità** — sfrutta la fondazione `BookingCoverage` per esprimere un buco correttamente,
   invece di hack (split del `Booking`); l'invariante anti-double-booking è protetto dal carve + constraint +
   il pre-check di riattivazione.
2. **Convenzioni** — mirror esatto della disdetta (admin-only, rimborso discrezionale + suggerimento FE,
   server valida solo bound); tabella figlia RLS FORCE come le altre; carve dentro la tx tenant-scoped.
3. **Modularità** — `BookingSuspension` è pura storia; l'occupazione resta su `BookingCoverage`; contratto
   e occupazione restano separati; la formula rimborso vive solo nel FE.
4. **Zero debito** — le due modalità unificate da `endDate` nullable (niente stato duplicato); nessun nuovo
   ADR (additivo sulla fondazione decisa); il conflitto di riattivazione è gestito esplicitamente, non
   lasciato affiorare come 500. Fuori scope tracciato (§14).

## 14. Fuori scope / deferito
- **Annullo/modifica di una sospensione già registrata** (correzione = supporto dati). Fuori scope v1.
- **Rivendita automatica / notifiche** del buco liberato: la sospensione **libera** il posto; la vendita
  resta manuale (walk-in). L'automazione lega a [D-006](../../architecture/deferred.md) (hold/notifiche) e
  [D-035](../../architecture/deferred.md) (canale cliente).
- **Sospensione retroattiva** (solo-rimborso sul passato): esclusa per scelta (§3.1).
- **Rimborso multi-metodo / nota di credito**: come per la disdetta, fuori scope.
- **Occupancy% sotto sospensioni** nei report analitici: lega a [D-036](../../architecture/deferred.md)
  (già deferito da D-048 §7); l'occupazione istantanea è comunque corretta via copertura.

## 15. Prossimi passi
1. Ok utente su questa spec.
2. `writing-plans` (TDD; ordine per layer: schema+migration+contracts → service `suspend` chiusa + carve +
   invarianti → service aperta + `reactivate` + conflitto → controller+e2e → FE card+modali+mock). **Nessun
   nuovo ADR.**
3. `subagent-driven-development` + review a due stadi + whole-branch (opus) → verifica LIVE → presentare e
   attendere conferma per il merge FF.
4. Al merge: aggiornare [`deferred.md`](../../architecture/deferred.md) — **D-013 sospensione COMPLETA**
   (sotto-slice 3/3); resta deferito di D-013 solo **cessione/subentro**.
