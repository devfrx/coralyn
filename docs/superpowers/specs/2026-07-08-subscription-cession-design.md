# Spec — Cessione / Subentro dell'abbonamento (D-013, sotto-slice cessione — chiude D-013)

> Design **CONFERMATO** in brainstorming con l'utente (2026-07-08). Ultima sotto-slice funzionale di **D-013**
> (disdetta 1/3 e sospensione 3/3 già mergiate su `main`). Qui il **passaggio di titolarità** di un abbonamento
> esistente da un cliente A (cedente) a un cliente B (subentrante). **NON FE-only**: schema + migration +
> contracts + api + FE. **Additiva su `Booking`** (nessuna modifica al modello d'occupazione `BookingCoverage`).
> Introduce un **ADR-0047** per la semantica di trasferimento titolarità + riconciliazione incasso. Prossima
> azione dopo l'ok utente sulla spec: `writing-plans` (TDD).

---

## 1. Problema

Un abbonamento (`Booking type=subscription`) è intestato a un cliente (`Booking.customerId`). Nel mondo reale
capita che l'abbonato **ceda il posto** a un'altra persona (subentro), che deve **ereditare il contratto** —
stesso ombrellone, stessa stagione, e soprattutto **anzianità e prelazione** (è il motivo per cui il subentro
ha valore: il subentrante entra nella catena di rinnovo del cedente, non riparte da zero). Oggi non c'è modo di
farlo: si potrebbe solo disdire A e creare una prenotazione nuova per B, ma così **si perdono seniority e
prelazione** e si spezza l'identità del contratto.

La cessione tocca **il titolare, non l'occupazione**: l'ombrellone resta occupato con continuità (B prende il
posto di A senza buchi). Quindi — a differenza di disdetta e sospensione — **`BookingCoverage` non si tocca**;
cambia il riferimento al cliente sulla `Booking` e si concilia l'incasso.

## 2. Modello di dominio (confermato)

Le due dimensioni ortogonali già stabilite (span di contratto su `Booking` vs occupazione fisica su
`BookingCoverage`) restano invariate. La cessione agisce su una **terza** dimensione, finora implicita:
**la titolarità** (`Booking.customerId`).

- **Una sola `Booking`, identità preservata.** Il subentro **non splitta** e **non crea** una nuova
  prenotazione. Cambia `customerId` da A a B a una **`effectiveDate`**.
- **Span, ombrellone, prezzo, `seniority` (catena `previousBookingId`), `prelazione` invariati e seguono B**
  automaticamente, perché sono agganciati alla `Booking`, non al cliente. *Ereditare anzianità e prelazione è
  l'essenza del subentro.*
- **`BookingCoverage` intatta.** L'occupazione è continua: nessun carve, nessun buco, nessuna interazione con
  l'anti-overlap (`coverage_no_overlap`). Coerente con l'invariante "la cessione tocca il titolare, non
  l'occupazione".
- **La cessione è un evento di dominio di prima classe**, con storico auditabile su una tabella figlia
  (mirror di `BookingSuspension`): `Booking` porta lo **stato corrente** (titolare = B), `BookingTransfer`
  porta la **storia** (chi→chi, quando, con quali movimenti di cassa).

## 3. Decisioni (CONFERMATE con l'utente)

1. **Passaggio di titolarità puro sulla stessa `Booking`** (non disdetta+nuova prenotazione): `customerId`
   A→B, tutto il resto del contratto invariato. B eredita seniority e prelazione.
2. **Riconciliazione incasso senza debito — modello "movimento netto su `amountCollected`", `refundedAmount`
   intatto** (vedi §5 e ADR-0047). La cessione registra due movimenti **opzionali e indipendenti**:
   - **`refundToPrevious`** — quanto il lido restituisce al cedente A;
   - **`collectedFromNew`** — quanto il lido incassa dal subentrante B.

   Entrambi agiscono come **movimento netto su `Booking.amountCollected`**
   (`amountCollected − refundToPrevious + collectedFromNew`, clampato in `[0, totalPrice]`); `paymentStatus`
   ricalcolato dall'enum; **`Booking.refundedAmount` NON si tocca** (resta puro: "perdita di ricavo da
   disdetta/sospensione"). Il netto `amountCollected − refundedAmount` resta **fonte unica** e intatto. Il
   dettaglio **lordo** dei due movimenti vive sul record `BookingTransfer` per l'accountability.
3. **Tre scenari di cassa, un solo meccanismo:** _lido processa_ (rimborsa A e incassa da B → `amountCollected`
   invariato se i due importi coincidono), _regolamento privato A↔B_ (entrambi 0 → `amountCollected` invariato,
   A e B si regolano fuori sistema), _rinegoziato_ (importi diversi → `amountCollected` cambia della differenza,
   `paymentStatus` riflette onestamente un eventuale scoperto). Vedi tabella §5.
4. **Suggerimento residuo pro-rata (solo FE)**, mirror disdetta/sospensione: il FE **suggerisce** un pro-rata
   sul residuo `[effectiveDate, end]` come pre-compilazione di **entrambi** i campi importo (handover pulito →
   `amountCollected` invariato); l'operatore li **sovrascrive** (azzera per il privato, ritocca per il
   rinegoziato); il server valida **solo i bound** (§6). Formula solo nel FE, nessun endpoint preview.
5. **Subentrante = `Customer` esistente del tenant** (mirror creazione prenotazione: si sceglie un cliente
   già in anagrafica). Deve esistere, essere tenant-scoped, **non anonimizzato** ([ADR-0043] GDPR) e **diverso**
   dal titolare attuale. La creazione inline di un nuovo cliente è fuori scope (l'admin lo crea prima).
6. **`effectiveDate` è informativa + base del pro-rata, non splitta il contratto.** `Booking.customerId` passa
   interamente a B; il periodo `[start, effectiveDate-1]` di A resta registrato **nella storia**
   (`BookingTransfer.previousCustomerId` + `effectiveDate`), non sulla riga `Booking` (che riflette il titolare
   **corrente**). Bound: `effectiveDate ∈ [start, end]` (422 altrimenti); **nessun vincolo `≥ oggi`** (una
   cessione può essere registrata anche per una data già passata, es. "B è subentrato lunedì scorso").
7. **Niente sospensione aperta al momento della cessione → 409** (scelta di coerenza): si cede un contratto in
   stato "pulito". Una sospensione **aperta** (ritorno ignoto, `endDate IS NULL`) è un movimento di cassa
   pendente del cedente; prima si riattiva/chiude, poi si cede. Le sospensioni **concluse** restano nella storia
   e passano con il contratto (appartengono alla `Booking`, non al cliente).
8. **Storico "cessioni effettuate" nella Scheda del cedente (v1)**: dopo la cessione l'abbonamento vive sotto B,
   ma la Scheda di **A** mostra una sezione read-only "Cessioni effettuate" (le `BookingTransfer` con
   `previousCustomerId = A`). Read dedicato, tenant-scoped, che **non** altera il contratto della lista
   prenotazioni (§7). Così A conserva traccia visibile di ciò che ha ceduto (completo/professionale).

## 4. Modello dati (additivo)

Nuova tabella figlia **`BookingTransfer`** (un abbonamento può essere ceduto più volte nel tempo: catena di
subentri):
```prisma
model BookingTransfer {
  id                 String    @id @default(uuid()) @db.Uuid
  bookingId          String    @db.Uuid
  establishmentId    String    @db.Uuid          // RLS FORCE tenant-scoped
  previousCustomerId String    @db.Uuid          // cedente (A) al momento della cessione
  newCustomerId      String    @db.Uuid          // subentrante (B)
  effectiveDate      DateTime  @db.Date          // da quando B è (informativamente) il titolare
  refundToPrevious   Decimal   @default(0) @db.Decimal(10, 2)  // rimborso lordo ad A (movimento, non aggregato su Booking)
  collectedFromNew   Decimal   @default(0) @db.Decimal(10, 2)  // incasso lordo da B
  reason             String?
  createdAt          DateTime  @default(now())

  booking          Booking       @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  establishment    Establishment @relation(fields: [establishmentId], references: [id])
  previousCustomer Customer      @relation("BookingTransferPrevious", fields: [previousCustomerId], references: [id])
  newCustomer      Customer      @relation("BookingTransferNew", fields: [newCustomerId], references: [id])
  @@index([bookingId])
  @@index([establishmentId])
}
```
- **RLS ENABLE + FORCE ROW LEVEL SECURITY + policy `tenant_isolation`** su `establishmentId`
  (`nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId"`), come le altre tabelle
  di dominio; `onDelete: Cascade` dalla `Booking`.
- **Nessun `createdByUserId`**: l'audit dell'attore admin resta coerentemente in **[D-047]** (come oggi
  `BookingSuspension`, che non traccia l'attore). Le due FK verso `Customer` **non** sono `onDelete: Cascade`
  (la storia non deve sparire se un cliente viene cancellato; con storico l'erasure GDPR anonimizza in place,
  [ADR-0043], quindi la riga resta valida e la FK regge).
- `BookingTransfer` è **pura storia/accountability**: nessuna colonna denormalizzata per constraint (la cessione
  non tocca l'occupazione, quindi nessun anti-overlap coinvolto).

Relazioni inverse aggiunte: `Booking.transfers BookingTransfer[]`, `Establishment.bookingTransfers …`,
`Customer.transfersOut BookingTransfer[] @relation("BookingTransferPrevious")` +
`Customer.transfersIn BookingTransfer[] @relation("BookingTransferNew")`.

## 5. Riconciliazione incasso (ADR-0047) — meccanismo

Alla cessione, dentro la tx tenant-scoped:
```
newCollected = clamp( Number(amountCollected) - refundToPrevious + collectedFromNew , 0, Number(totalPrice) )
paymentStatus =
    cents(newCollected) === 0                    -> 'unpaid'
  : cents(newCollected) === cents(totalPrice)    -> 'paid'
  : /* 0 < newCollected < totalPrice */          -> 'partial'
Booking.update({ customerId: B, amountCollected: newCollected, paymentStatus })   // refundedAmount INVARIATO
```
(`cents` = confronto in centesimi interi, come [booking.payment.ts](../../../apps/api/src/bookings/booking.payment.ts).)

`paymentMethod`/`collectionDate` **non** cambiano in v1 (il record `BookingTransfer` porta i movimenti; il
metodo di pagamento di B non è modellato ora — mirror della disdetta, dove `refundedAmount` è un numero senza
metodo). Suggerimento FE del residuo:
```
plannedDays  = (endDate − startDate) + 1
residualDays = (endDate − effectiveDate) + 1
suggested    = round2(totalPrice × residualDays / plannedDays)
// pre-compila refundToPrevious = collectedFromNew = clamp(suggested, 0, amountCollected)   (handover pulito)
```

**Perché `refundedAmount` NON si tocca** (il cuore dell'ADR-0047): in disdetta/sospensione il rimborso è
**perdita di ricavo** (giorni non venduti → il netto scende, e `refundedAmount` lo cattura). Nella cessione il
posto **non si libera**: il rimborso ad A è (tipicamente) **compensato** dall'incasso da B. Non è perdita: è un
**trasferimento**. Metterlo in `refundedAmount` gonfierebbe la "perdita da rimborsi" e romperebbe l'invariante
`netto = amountCollected − refundedAmount`. Il modello a movimento netto su `amountCollected` mantiene
`amountCollected` nel suo significato del codebase ("quanto del prezzo è pagato finora", `≤ totalPrice`, guida
`paymentStatus`) e `refundedAmount` **puro**.

## 6. Invarianti backend (validati in transazione, tenant-scoped RLS, admin-only)

Su `POST /bookings/:id/transfer`:
- **tipo** `subscription` (422); **stato** `confirmed` (422); **non disdetto** (`terminatedAt === null`, 422);
- **nessuna sospensione aperta** (`suspensions.some(s => s.endDate === null)` → 409, §3.7);
- **subentrante** `newCustomerId`: esiste nel tenant (findFirst tenant-scoped; 404 se non trovato), **non
  anonimizzato** (`anonymizedAt === null`, 422), **≠ `booking.customerId`** attuale (422 `SAME_HOLDER`);
- **`effectiveDate ∈ [start, end]`** (422 `BAD_DATE`);
- **bound cassa:** `0 ≤ refundToPrevious ≤ amountCollected` (422); `0 ≤ collectedFromNew` (422);
  `amountCollected − refundToPrevious + collectedFromNew ≤ totalPrice` (422 `OVER_TOTAL` — coerente con
  `resolvePayment`); entrambi con `maxDecimalPlaces: 2` e cap `99_999_999.99` (mirror DTO esistenti).

Dispatch errori mirror `terminate`: `NotFoundException` (404), `UnprocessableEntityException` (422),
`ConflictException` (409).

## 7. Contracts (additivo, non breaking)
```ts
export interface TransferDTO {
  id: string;
  effectiveDate: string;          // ISO yyyy-mm-dd
  previousCustomerId: string;
  previousCustomerName: string;   // "Nome Cognome" al momento della proiezione (per la storia in Scheda)
  newCustomerId: string;
  newCustomerName: string;
  refundToPrevious: number;
  collectedFromNew: number;
  reason?: string;
  createdAt: string;              // ISO datetime
}
// CustomerBookingDTO += transfers: TransferDTO[];   // sempre presente ([] se nessuna)

export interface TransferSubscriptionInput {
  newCustomerId: string;
  effectiveDate: string;          // ISO yyyy-mm-dd, ∈ [start, end]
  refundToPrevious: number;       // ≥ 0, ≤ amountCollected
  collectedFromNew: number;       // ≥ 0; con vincolo netto ≤ totalPrice
  reason?: string;
}

// Storico "cessioni effettuate" nella Scheda del CEDENTE (§3.8): le BookingTransfer con previousCustomerId = A.
export interface CededSubscriptionDTO {
  transferId: string;
  bookingId: string;
  effectiveDate: string;          // ISO yyyy-mm-dd
  newCustomerName: string;        // subentrante B
  umbrellaLabel: string;
  seasonName?: string;
  refundToPrevious: number;       // quanto ha riavuto A
  reason?: string;
  createdAt: string;              // ISO datetime
}
```
Endpoint principale (admin-only, `@Roles(Role.Admin)`), su `Booking`, ritorna `BookingDTO` aggiornato (mirror
`terminate`/`suspend`); il FE invalida la query Scheda → `CustomerBookingDTO` rifetchato mostra il nuovo
titolare + `transfers[]`:
- **`POST /bookings/:id/transfer`** — `TransferSubscriptionInput`.

Read dedicato del lato-cedente (§3.8), **non** admin-gated (lettura tenant-scoped come le altre letture Scheda),
contratto della lista prenotazioni invariato:
- **`GET /customers/:id/ceded-subscriptions`** → `CededSubscriptionDTO[]` (le `BookingTransfer` con
  `previousCustomerId = :id`, tenant-scoped, ordinate per `effectiveDate desc`).

`BookingDTO` **non** cambia. `@coralyn/contracts` va ricompilato (`dist/`).

## 8. UI — Scheda cliente `CustomerSubscriptionsCard` (accanto a "Disdici"/"Sospendi")
- Abbonamento confermato/non-disdetto/senza-sospensione-aperta → **"Cedi / Subentro"** (solo admin, pattern
  `isAdmin` già in card) → `TransferSubscriptionModal`:
  - **selettore cliente subentrante** (riusa il componente di ricerca/selezione cliente già usato nella
    creazione prenotazione — dettaglio nel piano; esclude il titolare attuale);
  - **data effettiva** (`min = startDate`, `max = endDate`);
  - **rimborso al cedente** e **incasso dal subentrante**, entrambi pre-compilati al residuo suggerito ed
    editabili (azzerabili per il regolamento privato);
  - **motivo** (opzionale).
- Storico cessioni → righe "Ceduto a {newCustomerName} il {effectiveDate}" (+ importi + motivo) sotto
  l'abbonamento, mirror delle righe sospensione conclusa.
- **Sezione "Cessioni effettuate" nella Scheda del cedente (§3.8):** una sezione read-only che elenca i
  `CededSubscriptionDTO` (abbonamenti che **questo** cliente ha ceduto ad altri) — "Ombrellone {umbrellaLabel}
  ceduto a {newCustomerName} il {effectiveDate}" (+ eventuale rimborso ricevuto + motivo). Visibile a tutti
  (non admin-only, è sola lettura). Compare solo se la lista è non vuota.
- Riusa `Modal`/`Field`/`Input`/`Textarea`/`ConfirmDialog` esistenti; **nessun nuovo componente ui-kit**.

## 9. Impatto per file (indicativo — dettaglio nel piano)
- **`apps/api/prisma/schema.prisma`** + **migration** (`…_booking_transfer`): `model BookingTransfer`
  (+ relazioni inverse su `Booking`/`Establishment`/`Customer`), RLS FORCE + policy tenant.
- **`packages/contracts/src/index.ts`**: `TransferDTO`, `CustomerBookingDTO.transfers`,
  `TransferSubscriptionInput`. Rebuild `dist/`.
- **`apps/api/src/bookings/bookings.controller.ts`**: `@Post(':id/transfer')` `@Roles(Role.Admin)`.
- **Read lato-cedente** `GET /customers/:id/ceded-subscriptions` (nel controller cliente o bookings — dettaglio
  nel piano): non admin-gated, tenant-scoped → `CededSubscriptionDTO[]`.
- **`apps/api/src/bookings/dto/transfer-subscription.dto.ts`** (nuovo): `class-validator`
  (`@IsUUID` newCustomerId, `@IsCalendarDate` effectiveDate, due `@IsNumber({maxDecimalPlaces:2}) @Min(0) @Max`,
  `@IsOptional @IsString @MaxLength(500)` reason).
- **`apps/api/src/bookings/bookings.service.ts`**: `transfer(id, input)` — invarianti §6, movimento netto §5,
  `Booking.update({customerId, amountCollected, paymentStatus})`, `BookingTransfer.create`, ritorna
  `toBookingDTO`; + `listCededByCustomer(customerId)` → `CededSubscriptionDTO[]` (query `BookingTransfer` per
  `previousCustomerId`, join `newCustomer`/`umbrella`/`season` per le label).
- **`apps/api/src/bookings/customer-booking.projection.ts`** + query `listByCustomer`: carica
  `transfers` (con `previousCustomer`/`newCustomer` per i nomi) e mappa `transfers[]` sul DTO
  (`toTransferDTO`); + `toCededSubscriptionDTO`.
- **spec api**: unit `transfer` (invarianti 422/409/404; happy dei tre scenari cassa; math del movimento netto
  + clamp + paymentStatus; `refundedAmount` invariato; seniority/prelazione invariati dopo il cambio titolare)
  + e2e (admin happy: la booking passa nella Scheda di B e sparisce dagli attivi di A ma compare tra le
  "cessioni effettuate" di A; 403 staff sul transfer; 404 tenant altrui; `newCustomer` anonimizzato → 422;
  sospensione aperta → 409; netto e paymentStatus coerenti; `ceded-subscriptions` tenant-scoped).
- **`apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue`**: bottone "Cedi/Subentro" (admin) +
  righe storico cessioni + sezione "Cessioni effettuate" (read-only, `CededSubscriptionDTO`).
- **`apps/web-staff/src/features/customers/TransferSubscriptionModal.vue`** (nuovo).
- **`apps/web-staff/src/features/customers/useCustomers.ts`**: `useTransferSubscription` (invalida la query
  Scheda) + `useCededSubscriptions(customerId)` (read lato-cedente).
- **FE helper** `cessionRefund.ts` (o estensione dell'esistente): pro-rata del residuo `[effectiveDate, end]`.
- **spec FE**: card (bottone admin-only, righe storico), modale (selettore cliente, suggerimento calcolato,
  bound date, payload, azzeramento importi), invalidazione. **`apps/web-staff/src/mocks/server.ts`** + seed:
  un secondo cliente + handler `transfer` per i test FE.

## 10. Cosa NON cambia
- **Occupazione / mappa / `BookingCoverage` / anti-overlap**: zero modifiche (la cessione non tocca
  l'occupazione — l'ombrellone resta occupato con continuità).
- **Prelazione / rinnovo / prezzo / stagione / seniority**: intatti — agganciati alla `Booking`, seguono il
  nuovo titolare. **Il subentrante eredita anzianità e prelazione.**
- **Disdetta / sospensione** (sotto-slice 1/3 e 3/3): invariate; `transfer` le rispetta (non si cede un
  disdetto; non si cede con sospensione aperta; le sospensioni concluse restano nella storia).
- **`refundedAmount` e la formula netto**: `refundedAmount` non è toccato dalla cessione; `netto =
  amountCollected − refundedAmount` resta la fonte unica.

## 11. Verifiche pre/post
- **Titolarità spostata**: dopo `transfer`, l'abbonamento compare nella Scheda di **B** (nuovo `customerId`) e
  non più tra gli attivi di A; `transfers[]` mostra la riga "Ceduto a B"; la Scheda di **A** mostra la sezione
  "Cessioni effettuate" con quella cessione (§3.8). Coperto da e2e.
- **Diritti ereditati**: seniority e prelazione dell'abbonamento **invariati** dopo il cambio titolare
  (regressione verde su prelazione/rinnovo).
- **Incasso coerente**: i tre scenari (lido processa / privato / rinegoziato) producono `amountCollected` e
  `paymentStatus` attesi; `refundedAmount` invariato; netto corretto. Coperto da unit + e2e.
- **Occupazione invariata**: la mappa mostra l'ombrellone occupato con continuità prima e dopo la cessione.

## 12. Test / baseline (da non regredire)
Baseline `main` locale `1fef6ff` (post-sospensione): api unit **213** · api e2e **264** (`--runInBand`) ·
web-staff **332** · ui-kit **111** · web-platform **16** · typecheck pulito. Gotcha: rebuild
`@coralyn/contracts` prima di typecheck/e2e; `migrate deploy` a **dev E test** (env alla radice repo,
`dotenv-cli`); e2e ts-jest **type-checka** → `--runInBand`; purge azzera Prisma client (rigenerare); migrazione
con RLS FORCE + policy (nessun backfill: tabella nuova vuota).

## 13. Rubric check ([ADR-0002])
1. **Professionalità** — il subentro preserva l'identità del contratto (seniority/prelazione ereditate), invece
   dell'hack disdetta+nuova-prenotazione che le distrugge; la riconciliazione incasso è cash-esatta e non
   corrompe gli invarianti (`amountCollected ≤ totalPrice`, `refundedAmount` puro, netto fonte unica).
2. **Convenzioni** — mirror esatto di `terminate`/`suspend` (admin-only, tx `forTenant`, invarianti →
   422/409/404, `toBookingDTO`); tabella figlia RLS FORCE come `BookingSuspension`; rimborso discrezionale +
   suggerimento FE, server valida solo i bound.
3. **Modularità** — `BookingTransfer` è pura storia; l'occupazione resta su `BookingCoverage` (non toccata); il
   contratto, l'occupazione e la titolarità restano tre concetti separati; la formula del residuo vive solo nel
   FE.
4. **Zero debito** — `refundedAmount` non viene sporcato (ADR-0047 motiva perché la cessione è un trasferimento,
   non una perdita); i tre scenari di cassa sono un solo meccanismo (nessuno stato duplicato); il conflitto
   sospensione-aperta è gestito esplicitamente (409), non lasciato affiorare; fuori scope tracciato (§14).

## 14. Fuori scope / deferito
- **Annullo/rettifica di una cessione già registrata** (correzione = supporto dati). Fuori scope v1.
- **Metodo di pagamento / nota di credito** per i movimenti di cassa della cessione: come per disdetta, fuori
  scope (i movimenti sono numeri sul record).
- **Creazione inline del cliente subentrante**: l'admin crea prima il cliente in anagrafica.
- **Audit dell'attore admin** (chi ha eseguito la cessione): [D-047], coerente con l'assenza di `createdBy` su
  `BookingSuspension`.
- **Reportistica per-titolare storica** (chi ha tenuto il posto in una data X): derivabile da `transfers[]`,
  ma non modellata nei report ora → lega a [D-036].

## 15. ADR
Nuovo **[ADR-0047] "Cessione/subentro: trasferimento titolarità e riconciliazione incasso"** — decide: (a) il
subentro è un cambio di `customerId` sulla **stessa** `Booking` (identità/seniority/prelazione preservate), non
disdetta+nuova; (b) la riconciliazione incasso è un **movimento netto su `amountCollected`** con `refundedAmount`
**intatto**, motivando che la cessione è un trasferimento (non una perdita di ricavo come la disdetta); (c)
`BookingTransfer` come storia RLS-FORCE. Additivo su [ADR-0011] (incasso base) e [ADR-0046] (coverage, non
toccata).

## 16. Prossimi passi
0. **Design docs ([ADR-0009], con questa spec):** `docs/design/data-model.md` — ER += `BookingTransfer` (+ nota
   `Booking.customerId` mutabile via cessione); `docs/design/flows.md` — flusso cessione + guardie +
   riconciliazione incasso; `docs/design/mockups/subscription-transfer-modal.html` — la modale. (Cessione
   marcata *design, non ancora implementata*.)
1. **Ok utente su questa spec.**
2. `writing-plans` (TDD; ordine per layer: schema+migration+contracts → service `transfer` + invarianti +
   movimento netto + `listCededByCustomer` → controller (`transfer` + `ceded-subscriptions`) + e2e → FE card
   (bottone + storico + sezione "cessioni effettuate") + modale + mock → ADR-0047 + design docs).
3. `subagent-driven-development` + review a due stadi + whole-branch (opus) → verifica LIVE su Docker →
   presentare e attendere conferma per il merge FF (push su `main` **solo** con ok esplicito).
4. Al merge: aggiornare [`deferred.md`] — **D-013 CHIUSA** (cessione + disdetta + sospensione + fondazione
   coverage tutte fatte).

[ADR-0002]: ../../architecture/decisions/0002-decision-rubric.md
[ADR-0009]: ../../architecture/decisions/0009-documentazione-di-design.md
[ADR-0011]: ../../architecture/decisions/0011-incasso-base-nel-core.md
[ADR-0043]: ../../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md
[ADR-0046]: ../../architecture/decisions/0046-occupazione-a-intervalli-coverage.md
[ADR-0047]: ../../architecture/decisions/0047-cessione-subentro-titolarita-incasso.md
[D-036]: ../../architecture/deferred.md
[D-047]: ../../architecture/deferred.md
[`deferred.md`]: ../../architecture/deferred.md
