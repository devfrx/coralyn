# ADR-0047: Cessione/subentro — trasferimento titolarità e riconciliazione incasso

- **Status:** Accepted
- **Data:** 2026-07-08
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0011](0011-incasso-base-nel-core.md) (**additivo**: la cessione riusa lo stesso stato
  di pagamento sulla `Booking` — `amountCollected`/`paymentStatus` — e ne rispetta il significato, senza
  introdurre un ledger parallelo), [ADR-0046](0046-occupazione-a-intervalli-coverage.md) (**non toccato**:
  la cessione agisce sulla titolarità, non sull'occupazione — `BookingCoverage` resta invariata). Spec:
  [2026-07-08-subscription-cession-design.md](../../superpowers/specs/2026-07-08-subscription-cession-design.md)
  (D-013, sotto-slice cessione — chiude D-013).

## Context

Un abbonamento (`Booking type=subscription`) è intestato a un cliente (`Booking.customerId`). Nel mondo reale
l'abbonato può **cedere il posto** a un'altra persona (subentro): stesso ombrellone, stessa stagione, e
soprattutto **stessa anzianità e prelazione** — è il motivo per cui il subentro ha valore, perché il
subentrante entra nella catena di rinnovo del cedente invece di ripartire da zero. Senza un meccanismo
dedicato l'unica via oggi sarebbe disdire il cedente e creare una prenotazione nuova per il subentrante, ma
questo **distrugge seniority e prelazione** e spezza l'identità del contratto.

La cessione tocca **il titolare, non l'occupazione**: l'ombrellone resta occupato con continuità (B prende il
posto di A senza buchi). Serve quindi decidere (a) come modellare il cambio di titolare preservando
l'identità del contratto, (b) come riconciliare l'incasso già versato da A con quanto versa B senza rompere
gli invarianti di cassa esistenti ([ADR-0011](0011-incasso-base-nel-core.md)), e (c) dove storicizzare
l'evento.

## Decision

### (a) Il subentro è un cambio di `Booking.customerId` sulla stessa prenotazione

Nessuno split, nessuna nuova `Booking`. `customerId` passa da A a B a una `effectiveDate`; span di contratto,
ombrellone, prezzo, `previousBookingId` (catena di rinnovo/seniority) e prelazione restano **invariati** e
seguono automaticamente B, perché sono agganciati alla `Booking`, non al cliente. `BookingCoverage`
([ADR-0046](0046-occupazione-a-intervalli-coverage.md)) resta intatta: l'occupazione fisica non cambia, non
c'è carve-out, l'anti-overlap (`coverage_no_overlap`) non è coinvolto. `effectiveDate` è **informativa** (base
del pro-rata) e non splitta il contratto: il periodo `[start, effectiveDate-1]` di A resta registrato solo
nella storia (`BookingTransfer`), non sulla riga `Booking` (che riflette sempre il titolare **corrente**).

### (b) Riconciliazione incasso = movimento netto su `amountCollected`, `refundedAmount` intatto

La cessione registra due movimenti di cassa **opzionali e indipendenti**: `refundToPrevious` (quanto si
restituisce al cedente A) e `collectedFromNew` (quanto si incassa dal subentrante B). Entrambi agiscono come
**movimento netto** sull'unico campo di incasso esistente:

```
newCollected  = clamp(amountCollected − refundToPrevious + collectedFromNew, 0, totalPrice)
paymentStatus = cents(newCollected) === 0                 ? 'unpaid'
              : cents(newCollected) === cents(totalPrice)  ? 'paid'
              : 'partial'
Booking.update({ customerId: B, amountCollected: newCollected, paymentStatus })   // refundedAmount INVARIATO
```

(`cents` = confronto in centesimi interi, come `apps/api/src/bookings/booking.payment.ts`.) Il calcolo vive
nell'helper puro `reconcileCessionPayment` (`apps/api/src/bookings/cession.payment.ts`), senza dipendenze
Nest, mirror di `resolvePayment`.

**Perché `refundedAmount` non viene toccato.** In disdetta e sospensione il rimborso è **perdita di ricavo**:
il posto si libera, giorni non venduti abbassano il netto, e `refundedAmount` la cattura
([ADR-0011](0011-incasso-base-nel-core.md)). Nella cessione il posto **non si libera**: il rimborso ad A è
(tipicamente) compensato dall'incasso da B. Non è una perdita, è un **trasferimento**. Instradare
`refundToPrevious` su `refundedAmount` gonfierebbe artificialmente la "perdita da rimborsi" e romperebbe
l'invariante `netto = amountCollected − refundedAmount`, che deve restare **fonte unica** per i report. Il
modello a movimento netto mantiene `amountCollected` nel suo significato consolidato nel codebase ("quanto
del prezzo è pagato finora", sempre `≤ totalPrice`, guida `paymentStatus`) e mantiene `refundedAmount`
**puro**: unicamente la traccia di ricavo perso da disdetta/sospensione. Il dettaglio **lordo** dei due
movimenti (`refundToPrevious`, `collectedFromNew`) vive sul record `BookingTransfer` per l'accountability,
separato dall'aggregato.

Tre scenari di cassa, un solo meccanismo: *il lido processa* (rimborsa A e incassa da B, importi coincidenti →
`amountCollected` invariato), *regolamento privato* A↔B (entrambi 0 → `amountCollected` invariato, A e B si
regolano fuori sistema), *rinegoziato* (importi diversi → `amountCollected` cambia della differenza,
`paymentStatus` riflette onestamente un eventuale scoperto). Il server valida solo i bound (§ Invarianti); il
suggerimento pro-rata che pre-compila i due campi è **solo FE** (mirror disdetta/sospensione), nessun
endpoint di preview.

**Invarianti server** (in transazione, tenant-scoped, admin-only, mirror `terminate`/`suspend`): tipo
`subscription` e stato `confirmed` (422); non disdetto (`terminatedAt === null`, 422); **nessuna sospensione
aperta** (`endDate IS NULL` → 409 — si cede un contratto "pulito", le sospensioni concluse restano nella
storia e passano con il contratto); subentrante esistente nel tenant (404), non anonimizzato
([ADR-0043](0043-erasure-e-retention-cliente-gdpr.md), 422), diverso dal titolare attuale (422
`SAME_HOLDER`); `effectiveDate ∈ [start, end]` (422 `BAD_DATE`, nessun vincolo `≥ oggi`); bound cassa
`0 ≤ refundToPrevious ≤ amountCollected` (422 `BAD_REFUND`), `collectedFromNew ≥ 0` (422 `BAD_COLLECT`),
netto `≤ totalPrice` (422 `OVER_TOTAL`, coerente con `resolvePayment`).

### (c) `BookingTransfer` come storia, RLS FORCE, senza `createdBy`

Nuova tabella figlia `BookingTransfer` (1..N righe per `Booking`: un abbonamento può essere ceduto più volte
nel tempo, catena di subentri), mirror strutturale di `BookingSuspension`:

```prisma
model BookingTransfer {
  id                 String   @id @default(uuid()) @db.Uuid
  bookingId          String   @db.Uuid
  establishmentId    String   @db.Uuid // RLS FORCE tenant-scoped
  previousCustomerId String   @db.Uuid // cedente (A) al momento della cessione
  newCustomerId      String   @db.Uuid // subentrante (B)
  effectiveDate      DateTime @db.Date
  refundToPrevious   Decimal  @default(0) @db.Decimal(10, 2) // movimento lordo, non aggregato su Booking
  collectedFromNew   Decimal  @default(0) @db.Decimal(10, 2)
  reason             String?
  createdAt          DateTime @default(now())

  booking          Booking       @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  establishment    Establishment @relation(fields: [establishmentId], references: [id])
  previousCustomer Customer      @relation("BookingTransferPrevious", fields: [previousCustomerId], references: [id])
  newCustomer      Customer      @relation("BookingTransferNew", fields: [newCustomerId], references: [id])
}
```

`Booking` porta lo **stato corrente** (titolare = B); `BookingTransfer` porta la **storia** (chi→chi, quando,
con quali movimenti di cassa). RLS `ENABLE + FORCE ROW LEVEL SECURITY` con policy `tenant_isolation` su
`establishmentId` (stesso pattern di tutte le tabelle di dominio tenant-scoped), `onDelete: Cascade` dalla
`Booking`. Le due FK verso `Customer` **non** sono `onDelete: Cascade`: la storia non deve sparire se un
cliente viene cancellato (con storico l'erasure GDPR anonimizza in place,
[ADR-0043](0043-erasure-e-retention-cliente-gdpr.md), la riga resta valida). **Nessun `createdByUserId`**:
l'audit dell'attore admin resta coerentemente deferito a **D-047** (`docs/architecture/deferred.md`), come
oggi per `BookingSuspension`, che non traccia l'attore. Nessuna colonna denormalizzata per constraint: la
cessione non tocca l'occupazione, quindi nessun anti-overlap è coinvolto qui.

Lettura dedicata lato-cedente (`GET /customers/:id/ceded-subscriptions`, non admin-gated, tenant-scoped):
proietta le `BookingTransfer` con `previousCustomerId = :id`, per la sezione "Cessioni effettuate" nella
Scheda del cedente — così A conserva traccia visibile di ciò che ha ceduto, senza alterare il contratto della
lista prenotazioni.

## Consequences

### Positive
- **Identità del contratto preservata**: seniority e prelazione del subentrante sono garantite per
  costruzione (stessa riga `Booking`), non per disciplina applicativa — l'alternativa disdetta+nuova le
  avrebbe esposte a bug di sincronizzazione.
- **Zero interazione con l'occupazione**: `BookingCoverage` e l'anti-overlap
  ([ADR-0046](0046-occupazione-a-intervalli-coverage.md)) restano del tutto estranei alla cessione — nessun
  rischio di introdurre un buco indesiderato nel posto.
- **Cassa esatta e onesta**: `amountCollected` resta sempre `≤ totalPrice` e riflette lo stato pagamento
  reale; `refundedAmount` resta puro (solo perdita di ricavo), quindi report e KPI basati su
  `netto = amountCollected − refundedAmount` non richiedono alcuna modifica né rischiano distorsioni.
- **Storia auditabile e simmetrica**: `BookingTransfer` da un lato (Scheda di B, storico cessioni ricevute) e
  la proiezione lato-cedente dall'altro (Scheda di A, "Cessioni effettuate") derivano dalla stessa riga senza
  duplicazione di stato.

### Negative / Trade-off
- **Un `POST` scrive due entità** (`Booking.update` + `BookingTransfer.create`) nella stessa transazione —
  accettato: stesso pattern già usato da `terminate`/`suspend`, costo minimo per avere sia stato corrente sia
  storia.
- **Il dettaglio lordo dei movimenti non è nell'aggregato `Booking`**: per sapere "quanto è stato rimborsato
  ad A in questa specifica cessione" bisogna leggere `BookingTransfer`, non `Booking.refundedAmount` — scelta
  deliberata (è la parte (b) della decisione), ma richiede disciplina nei consumer futuri (report, D-036) a
  non sommare movimenti di cessione dentro `refundedAmount`.
- **Nessun audit dell'attore admin in v1**: chi ha eseguito la cessione non è tracciato — mitigato: coerente
  con `BookingSuspension` esistente, deferito esplicitamente a D-047.

### Neutre / Note
- `paymentMethod`/`collectionDate` della `Booking` non cambiano in v1: il record `BookingTransfer` porta i
  movimenti grezzi, il metodo di pagamento del subentrante non è modellato ora (mirror della disdetta, dove
  `refundedAmount` è un numero senza metodo).
- Annullo/rettifica di una cessione già registrata è fuori scope v1 (correzione = supporto dati).

## Alternatives considered

- **Disdetta del cedente + nuova prenotazione per il subentrante** — scartata: distrugge seniority e
  prelazione (il subentrante ripartirebbe da zero nella catena di rinnovo), spezza l'identità del contratto,
  e obbligherebbe a un carve-out di occupazione (disdetta tronca la copertura) per un evento che invece non
  libera mai il posto. Contraddice il motivo stesso per cui il subentro ha valore.
- **`refundToPrevious` → `refundedAmount`, `collectedFromNew` → `amountCollected`** (trattare il rimborso al
  cedente come le altre perdite di ricavo) — scartata: farebbe salire `refundedAmount` mentre
  `amountCollected` sale indipendentemente per l'incasso da B, producendo un `netto = amountCollected −
  refundedAmount` scorretto (doppio conteggio nella direzione sbagliata) e potenzialmente `OVER_TOTAL` se
  l'incasso da B non viene compensato nello stesso movimento. Rompe il significato consolidato di
  `refundedAmount` come "perdita di ricavo", che nella cessione semplicemente non esiste.
- **Ledger parallelo per i movimenti di cessione** (una vista/aggregato separato da sommare a
  `amountCollected`/`refundedAmount` a lettura) — scartata: introduce una seconda fonte di verità per il
  netto, in contrasto con l'invariante esistente "`netto = amountCollected − refundedAmount` è fonte unica"
  ([ADR-0011](0011-incasso-base-nel-core.md)); ogni consumer (report, Scheda, Cassa futura) dovrebbe sapere
  di sommare due fonti — fragile e non necessario, dato che il movimento netto assorbe il caso senza
  ledger aggiuntivi.

## Rubric check ([ADR-0002](0002-decision-rubric.md))

1. **Professionalità** — il subentro preserva l'identità del contratto (seniority/prelazione ereditate)
   invece dell'hack disdetta+nuova-prenotazione che le distrugge; la riconciliazione incasso è cash-esatta e
   non corrompe gli invarianti esistenti (`amountCollected ≤ totalPrice`, `refundedAmount` puro, netto fonte
   unica).
2. **Convenzioni** — mirror esatto di `terminate`/`suspend`: admin-only, transazione tenant-scoped, invarianti
   → 422/409/404, `toBookingDTO` di ritorno; tabella figlia RLS FORCE come `BookingSuspension`; rimborso
   discrezionale con suggerimento FE, server valida solo i bound.
3. **Modularità** — `BookingTransfer` è pura storia; l'occupazione resta su `BookingCoverage` (non toccata);
   contratto, occupazione e titolarità restano tre concetti separati; la formula del residuo pro-rata vive
   solo nel FE.
4. **Zero debito** — `refundedAmount` non viene sporcato (questo ADR motiva esplicitamente perché la cessione
   è un trasferimento, non una perdita); i tre scenari di cassa condividono un solo meccanismo (nessuno stato
   duplicato); il conflitto sospensione-aperta è gestito esplicitamente (409), non lasciato affiorare;
   l'audit dell'attore è deferito esplicitamente (D-047), non dimenticato.
