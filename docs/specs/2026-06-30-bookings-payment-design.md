# Prenotazioni — Slice A2 (incasso base) — Design Spec

- **Data:** 2026-06-30
- **Stato:** In revisione — slice A2 dell'increment Prenotazioni, opzione A2 dell'handoff
  [2026-06-30-bookings-a1-done](../handoff/2026-06-30-bookings-a1-done.md) §4.
- **Convenzione:** codice e DB in **inglese**, nomi DB nativi (no `@@map`); UI e doc in **italiano**
  ([ADR-0030](../architecture/decisions/0030-codice-e-db-in-inglese.md)). Ponte IT↔EN nel
  [glossario](../architecture/glossary.md).
- **ADR di riferimento:** [ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md)
  (incasso base come stato della prenotazione — **questo slice ne realizza il comportamento**),
  [ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md) (RLS),
  [ADR-0026](../architecture/decisions/0026-identita-rls-utente.md) (tenant dal JWT),
  [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md) (fuso/date di calendario).
- **Nessun nuovo ADR:** A2 **implementa** una decisione già accettata (ADR-0011), non ne introduce
  di nuove. **Nessuna migrazione di schema:** le colonne `paymentStatus`/`amountCollected`/
  `paymentMethod`/`collectionDate` esistono già su `Booking` da A1 (principio anti-debito).

---

## 1. Obiettivo e confini

**Rendere la giornata davvero gestibile dal punto di vista dell'incasso.** A1 ha acceso la mappa
ma ogni prenotazione nasce `paymentStatus=unpaid`, `amountCollected=0`, senza metodo né data:
lo staff non sa chi ha pagato. ADR-0011 lo chiama il gap che rende l'MVP "non realmente
utilizzabile per gestire una giornata". A2 aggiunge **solo logica e UI** (zero migrazioni):
registrazione dell'incasso sulla prenotazione e visibilità dello stato di pagamento.

**Principio guida — lo `stato_pagamento` è una funzione derivata.** Per non ammettere stati
incoerenti (es. `paid` con `amountCollected=0`), il `paymentStatus` **non è un input**: è
**derivato server-side** da `amountCollected` rispetto a `totalPrice`. L'operatore dichiara
*quanto ha incassato* e *con che metodo*; il sistema deriva lo stato. Un'unica fonte di verità,
nessuna combinazione invalida possibile.

### In scope (A2)

- Helper di dominio **puro** `resolvePayment(input, totalPrice, today)` che normalizza l'incasso
  e deriva `paymentStatus` (unit-testato, niente dipendenze Nest — come `booking.availability`).
- Endpoint **`PATCH /api/bookings/:id/payment`** tenant-scoped: registra/aggiorna l'incasso.
- Estensione **additiva** di `BookingDTO` (`paymentMethod?`, `collectionDate?`) e nuovo contratto
  `SettlePaymentInput` in `@coralyn/contracts`. Aggiornamento di `toBookingDTO`.
- **FE — `BookingsView` (`/bookings`)**: dal mock al backend reale (prenotazioni della data attiva),
  con **filtro per stato di pagamento** (client-side) e azione "Registra incasso" per riga.
- **FE — drawer `MapView`**: azione "Registra incasso" sulla prenotazione mostrata, accanto a
  "Annulla prenotazione".
- **FE — composable** `useSettlePayment()` (mutation che invalida `bookings` **e** `dayMap`).
- e2e a 2 tenant per il PATCH; unit per il dominio puro e la proiezione.

### Fuori scope (rinviato, tutto additivo)

- **Modifica in-place** di cliente/fascia/prezzo della prenotazione (resta cancel+ricrea come A1):
  è un secondo slice additivo, **fuori da A2** per tenere l'incasso coeso e recensibile da solo.
- **Modulo Cassa completo** — entità `Payment` ricca (acconti multipli con storico, ricevute,
  rimborsi, storni), chiusura cassa giornaliera, riconciliazione → [D-009](../architecture/deferred.md).
- **Conformità fiscale / POS** (scontrino telematico, processing elettronico) → [D-004](../architecture/deferred.md).
- **Pricing engine** e selettore Pacchetto → A3. Il prezzo resta digitato a mano (da A1); A2 non
  lo tocca.
- **Stato "bozza"/`draft`** della prenotazione (la `BookingsView` mock lo mostrava): non introdotto;
  `status` resta `confirmed|cancelled` come A1.
- **Calendario multi-giorno** nella `BookingsView`: la vista resta sulla **data attiva** della
  sessione (come la mappa). Il calendario è uno slice successivo.

---

## 2. Modello di dominio dell'incasso (il cuore)

Le colonne su `Booking` (già presenti, [data-model](../design/data-model.md)):

| Campo | Tipo | Semantica in A2 |
|---|---|---|
| `totalPrice` | `Decimal(10,2)` | importo dovuto (digitato a mano in A1); **read-only** in A2 |
| `amountCollected` | `Decimal(10,2) @default(0)` | quanto incassato finora; **input** del PATCH |
| `paymentStatus` | `PaymentStatus @default(unpaid)` | **derivato**, mai input |
| `paymentMethod` | `PaymentMethod?` | metodo dell'incasso; richiesto se `amountCollected>0` |
| `collectionDate` | `DateTime? @db.Date` | data dell'incasso; default oggi `Europe/Rome` |

**Derivazione dello stato** (funzione pura, casi valutati **in quest'ordine**):

```
totalPrice == 0                  → paymentStatus = 'paid'     (niente da incassare; method/date = null)
amountCollected == 0             → paymentStatus = 'unpaid'   (method = null, date = null)
0 < amountCollected < totalPrice → paymentStatus = 'partial'
amountCollected == totalPrice    → paymentStatus = 'paid'
amountCollected  > totalPrice    → ERRORE di dominio (422 OVER_TOTAL)
```

> **`totalPrice == 0` (booking gratuito):** valutato **per primo** → `paid`. Senza questa guardia,
> `amount==0` lo lascerebbe `unpaid` per sempre (impossibile saldarlo). Caveat: A1 crea con default
> `unpaid`; un booking a €0 mai-incassato mostra `unpaid` finché non riceve un PATCH (anche
> `amount=0` → `paid`). Accettato: il caso è raro e l'azione "Registra incasso" lo risolve in un clic.

> **Nota float:** il confronto avviene **in centesimi interi** (`Math.round(x * 100)`) per evitare
> imprecisioni di virgola mobile sull'uguaglianza `amount == totalPrice`. Gli importi hanno già
> al più 2 decimali (validazione DTO).

> **`collectionDate` su re-settle:** ogni PATCH con `amount>0` (senza data esplicita) imposta la data
> all'**oggi** corrente → `collectionDate` riflette **l'ultimo incasso** (es. parziale oggi, saldo fra
> tre giorni → la data si sposta al saldo). Lo storico dei singoli incassi è D-009 (Cassa). Date future
> non bloccate in A2 (l'operatore può registrare una data a sua scelta).

**Regole di coerenza** (enforced in `resolvePayment`, che conosce `totalPrice` dal DB):

1. `amountCollected` ∈ `[0, totalPrice]`, max 2 decimali. `> totalPrice` → **422** (`OVER_TOTAL`).
   Sovra-incasso/mancia non modellati nell'incasso base (rinviati alla Cassa, D-009).
2. Se `amountCollected > 0`, `paymentMethod` è **obbligatorio** → altrimenti **422** (`METHOD_REQUIRED`).
3. `collectionDate`: se assente e `amountCollected > 0` → **oggi in `Europe/Rome`**
   ([ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md)). Se
   `amountCollected == 0` → forzata a `null` (reset dell'incasso).
4. Se `amountCollected == 0`, `paymentMethod` e `collectionDate` vengono **azzerati** (correzione/
   "segna come non pagato"), ignorando eventuali valori in input.

`resolvePayment` è **pura** e restituisce un risultato discriminato — **non** lancia eccezioni Nest
(così è unit-testabile senza il framework, come `booking.availability.ts`):

```ts
type ResolveResult =
  | { ok: true; fields: { amountCollected: number; paymentStatus: PaymentStatus;
                          paymentMethod: PaymentMethod | null; collectionDate: string | null } }
  | { ok: false; reason: 'OVER_TOTAL' | 'METHOD_REQUIRED' };

function resolvePayment(input: SettlePaymentInput, totalPrice: number, today: string): ResolveResult
```

Il `BookingsService` mappa `reason → UnprocessableEntityException` con messaggio IT.

> **Confine semantico (confermato da A1 §10):** lo stato della **mappa** dipende da `type`/`status`,
> **non** dal pagamento. Una prenotazione `unpaid` occupa comunque lo slot. A2 non tocca
> `projectDayMap`.

---

## 3. Endpoint `PATCH /api/bookings/:id/payment`

Sotto la `JwtAuthGuard` globale (tenant dal JWT, `TenantContext.require()`); no Bearer → **401**.
Body `SettlePaymentDto` (class-validator + `ValidationPipe`).

- **Body:** `{ amountCollected: number; paymentMethod?: PaymentMethod; collectionDate?: string }`.
- **Validazione DTO (statica):** `amountCollected` number, `@Min(0)`, `@Max(99_999_999.99)`,
  `maxDecimalPlaces: 2`; `paymentMethod` opzionale `@IsIn(['cash','card','transfer','other'])`;
  `collectionDate` opzionale `@IsCalendarDate()` (riusa l'helper di A1 — forma `YYYY-MM-DD` +
  validità calendariale).
- **Service** (in `forTenant`, transazione):
  1. carica la `Booking` per `id` (RLS: fuori tenant → non trovata → **404**);
  2. se `status == 'cancelled'` → **409** (`ConflictException`, "Impossibile incassare una
     prenotazione annullata"): non si incassa su una prenotazione annullata;
  3. `resolvePayment(body, Number(booking.totalPrice), todayInRome())`; se `!ok` → **422**;
  4. `tx.booking.update` con i 4 campi normalizzati;
  5. risposta **200** + `BookingDTO` aggiornato.
- **Non trovata** → **404**. **Superuser** (JWT `establishmentId` null) → **400**
  (`TenantContext.require()` → "Tenant non risolto"), coerente con A1.

> **Decisione (chiusa):** **un solo endpoint idempotente** che *imposta* lo stato di incasso
> assoluto (non un delta). Re-inviare lo stesso body è idempotente; correggere = re-inviare.
> Niente `POST /payments` separato (niente entità `Payment`: D-009). Il `GET`/`DELETE`/`POST`
> di A1 restano invariati.

### `GET /api/bookings` — invariato

Il filtro per stato di pagamento nella `BookingsView` è **client-side** (la lista del giorno è
piccola; nessun round-trip a ogni cambio tab; nessuna modifica all'API). Un filtro server-side
`?paymentStatus=` è additivo e rinviato a quando servirà (liste multi-giorno, A3+) — YAGNI ora.

---

## 4. Contratti (`@coralyn/contracts`) — additivi

Nessun rename/rimozione. `BookingDTO` guadagna due campi **opzionali**; nuovo `SettlePaymentInput`.

```ts
export interface BookingDTO {
  // ... campi esistenti invariati ...
  paymentStatus: PaymentStatus;
  amountCollected: number;
  paymentMethod?: PaymentMethod;   // A2 (additivo): assente finché non si incassa
  collectionDate?: string;         // A2 (additivo): ISO yyyy-mm-dd, assente finché non si incassa
}

/** Input per registrare l'incasso base (ADR-0011). Lo stato è derivato server-side. */
export interface SettlePaymentInput {
  amountCollected: number;         // 0..totalPrice, max 2 decimali
  paymentMethod?: PaymentMethod;   // obbligatorio se amountCollected > 0
  collectionDate?: string;         // ISO yyyy-mm-dd; default oggi Europe/Rome
}
```

`PaymentStatus`/`PaymentMethod` già esistenti, invariati.

**Proiezione** (`toBookingDTO`): aggiungere `paymentMethod: b.paymentMethod ?? undefined` e
`collectionDate: b.collectionDate ? formatDbDate(b.collectionDate) : undefined` (pattern `null→undefined`).

---

## 5. Frontend (`apps/web-staff`)

### 5.1 `BookingsView` — dal mock al reale

Oggi 100% mock ([BookingsView.vue](../../apps/web-staff/src/features/bookings/BookingsView.vue)).
A2 la collega al backend reale per la **data attiva** della sessione:

- **Dati:** `useDayBookings(session.activeDate)` (già esistente). Per le etichette leggibili la
  vista **risolve client-side** riusando query già in cache:
  - cliente: `useCustomers()` → nome da `customerId` (stesso pattern già usato in `MapView`);
  - ombrellone: la query mappa (`useDayMap`/sorgente umbrelloni) → `label` da `umbrellaId`.
  - `BookingDTO` resta **puro** (solo id); nessun campo display denormalizzato nel contratto.
- **Colonne** (riuso del layout esistente): Cliente · Ombrellone · Tipo (*Giornaliero*) · Periodo
  (la data) · **Stato pagamento** (Badge) · **Incasso** (`€ amountCollected / € totalPrice`).
  La colonna **Pacchetto** mostra "—" (arriva con A3); voce `Tipo` è *Giornaliero* per tutte
  (solo `daily` esiste).
- **Filtro per stato di pagamento** (`SegmentedControl` esistente, ridefinito): *Tutte · Da
  incassare (`unpaid`) · Parziali (`partial`) · Saldate (`paid`)*. Filtro **computed client-side**
  sui dati già caricati. (I filtri mock "Bozze/Concluse" spariscono: non esiste `draft`, e la
  vista è sulla data attiva.)
- **Empty-state:** se la data attiva non ha prenotazioni (o il filtro non matcha), mostrare un
  messaggio esplicito invece della tabella vuota.
- **Riga → "Registra incasso"**: apre il modale di incasso (§5.3) sulla prenotazione.
- **"Nuova prenotazione"** resta legato al flusso mappa (serve umbrella+fascia preselezionati):
  il bottone **naviga a `/map`**. La creazione da `BookingsView` è fuori A2.

### 5.2 Drawer `MapView` — azione incasso

Nel drawer dell'ombrellone, accanto a "Annulla prenotazione"
([MapView.vue:231](../../apps/web-staff/src/features/map/MapView.vue)), aggiungere **"Registra
incasso"** sulla prenotazione corrente (per-fascia, coerente con A1) → apre il modale §5.3.
Mostrare anche lo **stato di pagamento** corrente (Badge) nel dettaglio del drawer.

### 5.3 Modale "Registra incasso"

Componente riusabile (usato da `BookingsView` e dal drawer):

- mostra `totalPrice` e `amountCollected` correnti;
- **Importo incassato**: input numerico (default = `totalPrice` per il caso comune "salda tutto");
  scorciatoia "Salda tutto" (imposta = totale) e "Segna non pagato" (imposta = 0);
- **Metodo**: select `cash|card|transfer|other` (etichette IT: Contanti/Carta/Bonifico/Altro),
  obbligatorio se importo > 0, nascosto/azzerato se importo = 0;
- **Data incasso**: default oggi (`session.activeDate`? **no** → oggi reale in Rome; l'incasso è
  un fatto del momento, non della data operativa visualizzata), modificabile;
- Conferma → `useSettlePayment` → `PATCH`. Errore 422 → messaggio inline ("Importo superiore al
  totale" / "Metodo richiesto"); 409 → "Prenotazione annullata".

### 5.4 Composable `useSettlePayment`

In `useBookings.ts`, mutation che chiama `PATCH /bookings/:id/payment` e on success **invalida**
`queryKeys.bookings(tenant, activeDate)` — la lista che alimenta sia la `BookingsView` sia il
dettaglio del drawer della mappa. **Non** invalida `dayMap`: lo stato di incasso non cambia lo
stato della mappa (A1 §10), quindi una invalidazione della mappa sarebbe un refetch inutile.
Stesso pattern (più stretto) di `useCreateBooking`/`useCancelBooking`.

### 5.5 MSW

Handler `PATCH /api/bookings/:id/payment` **solo nei test** (`mocks/server.ts`), che applica la
stessa derivazione di stato per realismo. In dev, bypass sul backend reale.

---

## 6. Test (TDD, commit-per-layer)

Target da **non** regredire: ui-kit 14 · web-staff 41 · api unit 27 · api e2e 31.

- **api unit — `booking.payment.spec.ts`** (`resolvePayment` puro):
  `amount=0 → unpaid` (method/date azzerati); `0<amount<total → partial`; `amount==total → paid`;
  `amount>total → {ok:false, OVER_TOTAL}`; `amount>0 senza method → {ok:false, METHOD_REQUIRED}`;
  `collectionDate` assente con amount>0 → default `today`; `collectionDate` esplicita rispettata;
  reset (amount=0) azzera method+date anche se forniti; **`totalPrice==0` → `paid`** (amount 0,
  method/date null) e `amount>0` su `totalPrice==0` → `OVER_TOTAL`.
- **api unit — proiezione**: `toBookingDTO` mappa `paymentMethod`/`collectionDate` (`null→undefined`,
  `Date→yyyy-mm-dd`).
- **api e2e — `bookings.payment.e2e`** (`coralyn_test`, 2 tenant):
  no Bearer → 401; salda tutto → 200, `paymentStatus=paid`, `GET` riflette; parziale → `partial`;
  reset (amount=0) → `unpaid`, method/date null; `id` inesistente → 404; prenotazione `cancelled`
  → 409; `amount>total` → 422; `amount>0` senza method → 422; **isolamento**: tenant s2 fa PATCH
  su una `Booking` di s1 → **404** (RLS non la trova).
- **web-staff**: `BookingsView.spec` — render dei dati reali del giorno + filtro per stato di
  pagamento (computed); il click su "Registra incasso" apre il modale e la conferma chiama la
  mutation (mutation mockata/MSW). Eventuale test del modale di incasso isolato.

---

## 7. Verifica / DoD

- **Nessuna migrazione** (le colonne esistono). `prisma generate` non necessario (schema invariato);
  ricompilare comunque l'api per i nuovi file (`nest build`).
- Test verdi, conteggi **≥** ai target sopra (con i nuovi). `pnpm -r build` + `eslint .` verdi.
- Docker `--profile full up -d --build api` (rebuild dopo il cambio BE, altrimenti il FE prende 404
  dall'immagine vecchia — gotcha A1 §5): login admin dev, creare una giornaliera, registrare
  l'incasso via `:8080` con Bearer, verificare `paymentStatus` in `GET /bookings`.
- FE: dev worker sul backend reale; `BookingsView` mostra incasso reale e filtra; drawer mappa
  registra incasso; `typecheck` OK; pulizia `apps/web-staff/node_modules/.vite` dopo il cambio
  contratti.
- **Doc:** aggiornare `README.md` (stato: A2 incasso implementato), `data-model.md` (comportamento
  incasso ora attivo, non più "default in A1"); handoff successivo. Glossario: già copre
  incasso/`paymentStatus`. ADR-0011: nessuna modifica (lo implementa).

---

## 8. Casi limite e regole d'integrità (riepilogo)

- **Stato derivato, mai in input:** impossibile creare `paid` con importo 0 o `unpaid` con importo
  pieno. Unica fonte di verità: `amountCollected` vs `totalPrice`.
- **`amount > totalPrice`** → 422. Sovra-incasso/mancia non modellati (Cassa, D-009).
- **PATCH su `cancelled`** → 409 (non si incassa una prenotazione annullata).
- **PATCH su `id` fuori tenant** → 404 (RLS), mai cross-tenant.
- **Idempotenza:** il PATCH imposta lo stato assoluto; re-invio = no-op effettivo. Correggere un
  errore = re-inviare i valori giusti (incl. amount=0 per "non pagato").
- **Date:** `collectionDate` round-trip UTC su `@db.Date`; default oggi `Europe/Rome`
  ([ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md)); mai metodi locali.
- **`totalPrice` read-only in A2:** correggere il prezzo richiede cancel+ricrea (la modifica
  in-place è rinviata, §1 fuori scope).
- **Incasso ≠ disponibilità:** lo stato della mappa non cambia con il pagamento (A1 §10).
- **`totalPrice == 0`** → sempre `paid` (niente da incassare); vedi §2.
- **Annullo di una prenotazione pagata:** il `DELETE` di A1 (soft, `status=cancelled`) **non tocca** i
  campi incasso → una `cancelled` può restare con `amountCollected>0`. Implica un **rimborso**, che è
  gestione Cassa ([D-009](../architecture/deferred.md)), **non** modellato qui. Non è un'anomalia: la
  `listByDate` ritorna solo `confirmed`, quindi non compare nelle viste operative; resta nello storico.
  A2 non blocca l'annullo di una prenotazione pagata.
- **PATCH concorrente sullo stesso booking:** **last-write-wins**, nessun lock ottimistico in A2
  (deploy mono-operatore; coerente con la finestra di race accettata in A1 → [D-030](../architecture/deferred.md)).
- **`BookingsView` senza prenotazioni** per la data attiva: empty-state esplicito (non più righe mock).
- **`collectionDate` esplicita con `amount=0`:** ignorata e azzerata (normalizzazione al reset, regola §2.4),
  non è un errore.

## 9. Decisioni chiuse

1. **`paymentStatus` derivato server-side** da `amountCollected`/`totalPrice` (non input). (§2)
2. **Un solo endpoint** `PATCH /:id/payment` idempotente che imposta lo stato assoluto; nessuna
   entità `Payment`, nessun `POST /payments`. (§3)
3. **Filtro stato pagamento client-side** nella `BookingsView`; nessuna modifica al `GET`. (§3)
4. **Edit in-place rinviato:** A2 è incasso puro; `totalPrice` e cliente/fascia restano cancel+ricrea. (§1)
5. **`BookingDTO` resta puro** (solo id); le etichette display si risolvono client-side riusando
   le query già in cache. (§5.1)
6. **Data incasso = oggi reale (Rome)**, non la data operativa visualizzata. (§5.3)
