# Scheda Cliente — 360° del bagnante — Design Spec

- **Data:** 2026-07-03
- **Stato:** Approvato (design) — decisioni risolte con l'utente in brainstorming il 2026-07-03. **Da pianificare
  ed eseguire** (ADR-0009).
- **Origine:** la vista dettaglio cliente ([`/customers/:id`](../../apps/web-staff/src/features/customers/CustomerDetailView.vue))
  è **già reale** per intestazione + anagrafica/contatti (GET/PATCH `customers/:id` funzionano), ma le **tre card
  informative** in fondo alla pagina sono **stub «In arrivo»** (bordo tratteggiato, nessun dato). Questo slice le
  rende reali: dà all'operatore la **vista a 360° del bagnante** (storico, fedeltà/abbonamenti, situazione
  pagamenti) — la prima delle "pagine ancora mockate" scelta con l'utente.
- **ADR di riferimento:** [ADR-0006](../../docs/architecture/decisions/0006-dominio-prenotazioni-e-pricing.md)
  (dominio prenotazioni), [ADR-0013](../../docs/architecture/decisions/0013-granularita-disponibilita-a-slot.md)
  (fascia), [ADR-0034](../../docs/architecture/decisions/0034-prelazione-finestre-lazy.md) (prelazione/anzianità),
  [ADR-0010](../../docs/architecture/decisions/0010-rls-tenant-isolation.md) (RLS), [ADR-0009](../../docs/architecture/decisions/0009-documentazione-di-design.md)
  (workflow). **Nessun nuovo ADR** previsto: è un incremento di lettura sull'architettura già decisa (nessuna nuova
  decisione strutturale; la prelazione riusa ADR-0034). Se in fase di piano emergesse una scelta strutturale, si
  valuterà un ADR.
- **Convenzione:** codice/DB in inglese; UI/doc in italiano. **Baseline test da NON regredire** (su `main`,
  post-D-030, verificata live 2026-07-03): **api unit 101 · api e2e 153 · web-staff 153 (globa ui-kit) · ui-kit
  standalone 55.** Typecheck web-staff pulito.
- **Nessuna migrazione** (nessun cambio di schema): solo un endpoint di lettura arricchito + FE. Il link
  `Booking.customerId` esiste già.

---

## 1. Situazione attuale (verificata leggendo il codice)

- **Vista** ([`CustomerDetailView.vue`](../../apps/web-staff/src/features/customers/CustomerDetailView.vue)):
  intestazione (avatar, nome, telefono/email) + card **Anagrafica e contatti** (form reale: `phone`/`email`/`notes`
  via `useCustomer`/`useUpdateCustomer` → `GET`/`PATCH customers/:id`). In fondo, **3 card stub** (righe 15-19,
  58-67) con `<Badge tone="soon">In arrivo</Badge>` e descrizioni già scritte:
  1. **Abbonamento e anzianità** — "Stagioni consecutive, rinnovi **e prelazione del posto**."
  2. **Storico prenotazioni** — "Tutte le prenotazioni del bagnante, per stagione."
  3. **Pagamenti e saldo** — "Incassi, metodo di pagamento e saldo aperto."
- **Backend disponibile:** `CustomersController` ha `GET /customers`, `GET /customers/:id`, `POST`, `PATCH`
  ([`customers.controller.ts`](../../apps/api/src/customers/customers.controller.ts)). **Manca** qualsiasi endpoint
  per le prenotazioni di un cliente. Nel dominio bookings esistono già: `BookingsService.listByDate`,
  `listSubscriptions(seasonId)`, [`computeSeniority(tx, ids)`](../../apps/api/src/bookings/seniority.ts) (anzianità
  = lunghezza catena `previousBookingId`), e la logica prelazione in
  [`renewal-campaigns.service.ts`](../../apps/api/src/bookings/renewal-campaigns.service.ts) (`getByDestinationSeasonId`
  calcola per ogni avente-diritto lo stato finestra `open`/`exercised`/`expired`).
- **Dato condiviso:** le 3 card derivano **tutte** dalle **prenotazioni del cliente** (`Booking.customerId`). Storico
  = la lista; Abbonamento/anzianità = le sole `subscription` + `computeSeniority` + catena rinnovi + prelazione;
  Saldo = `Σ(totalPrice − amountCollected)`. Quindi **un solo endpoint** alimenta tutte e tre.

## 2. Obiettivo e principio (deciso)

Rendere reali le 3 card con **un unico endpoint di lettura arricchito** `GET /customers/:id/bookings`, riusando la
logica di dominio già esistente (anzianità, prelazione) **senza duplicarla**. Le card sono **derivazioni di
presentazione** dello stesso dataset (storico = lista; anzianità = filtro+arricchimento; saldo = aggregazione FE).

**Principio chiave (deciso con l'utente — "professionale, senza debiti"):**
- **Fonte unica di verità.** Anzianità riusa `computeSeniority`. La prelazione riusa lo **stesso calcolo dello
  stato-finestra** della vista Rinnovi: si **estrae** la logica `open/exercised/expired` in un helper puro condiviso
  (`computeRenewalWindowState`) usato **sia** da `renewal-campaigns.service.ts` **sia** dal nuovo endpoint, così le
  due viste non possono divergere (no drift = no debito).
- **Storico veritiero e completo:** le prenotazioni **cancellate** sono mostrate (attenuate), non nascoste — un
  record cliente onesto.
- **Read-only:** le card espongono, non modificano (nessuna nuova azione di scrittura in questo slice).

**Fuori scope (YAGNI):** nessuna pagina di dettaglio-prenotazione (non esiste → righe non navigabili); nessuna nuova
azione (rinnovo/incasso restano dove sono, mappa e vista Rinnovi); nessun cambio di schema; nessun tocco alla vista
Rinnovi oltre l'estrazione dell'helper (comportamento invariato).

## 3. Backend — endpoint arricchito

### 3.1 Route e contratto

**`GET /customers/:id/bookings`** → `CustomerBookingDTO[]`, ordinati per `startDate` **decrescente** (più recenti
prima). Tenant-scoped (RLS via `forTenant`): un cliente di un altro tenant è invisibile → lista vuota (come il resto
delle letture). La route sta in `CustomersController` (URL customer-centrico, RESTful); l'implementazione riusa la
logica del dominio bookings — `CustomersModule` importa il servizio di lettura bookings (dipendenza
customers→bookings, nessun ciclo: bookings non importa customers).

`CustomerBookingDTO` (nuovo, in [`packages/contracts`](../../packages/contracts/src/index.ts)) = i campi di
`BookingDTO` **+** arricchimenti di sola presentazione:

```ts
export interface CustomerBookingDTO {
  // — campi da BookingDTO —
  id: string;
  umbrellaId: string;
  timeSlotId: string;
  startDate: string;              // ISO yyyy-mm-dd
  endDate: string;
  type: BookingType;              // daily | periodic | subscription
  status: BookingStatus;          // confirmed | cancelled
  totalPrice: number;
  paymentStatus: PaymentStatus;   // unpaid | partial | paid
  amountCollected: number;
  paymentMethod?: PaymentMethod;
  collectionDate?: string;
  packageId?: string;
  previousBookingId?: string;
  // — arricchimenti (server-side) —
  umbrellaLabel: string;          // join Umbrella.label (il FE non carica la mappa)
  seasonName?: string;            // Season che contiene startDate (risolta), assente se nessuna
  seniority?: number;             // SOLO type='subscription': lunghezza catena rinnovi (>=1)
  renewed?: boolean;              // SOLO subscription: esiste un rinnovo confermato di questa
  prelazione?: {                  // SOLO subscription con finestra APERTA (actionable). Assente altrimenti.
    destinationSeasonName: string;
    deadline: string;             // ISO yyyy-mm-dd
  };
}
```

`customerId` è omesso dal DTO: è implicito nella route (coerente con le projection esistenti che non ri-espongono
la dimensione già nota).

### 3.2 Arricchimento (una passata, query bounded)

Dentro `forTenant`:
1. **Bookings** del cliente: `tx.booking.findMany({ where: { customerId: id }, include: { umbrella: true, timeSlot: true, renewals: true } })`. (Nessun filtro su `status`: le cancellate servono allo storico; il FE le distingue.)
2. **`umbrellaLabel`**: dal join `umbrella.label`.
3. **`seasonName`**: carica le `Season` del tenant una volta; per ogni booking risolvi quella che contiene
   `startDate` (`start ≤ bookingStart ≤ end`), match in memoria (le stagioni sono poche). `undefined` se nessuna.
   *(Post-D-030 due stagioni possono sovrapporsi: se più stagioni contengono `startDate`, scegli deterministicamente
   quella con `startDate` più recente — la più specifica; è solo un'etichetta di raggruppamento, non semantica di
   dominio.)*
4. **`seniority`/`renewed`** (solo subscription): `computeSeniority(tx, subIds)`; `renewed` = esiste un altro booking
   confermato con `previousBookingId = questo.id` (riuso del pattern di `listSubscriptions`).
5. **`prelazione`** (solo subscription, solo stato **open**): carica le `RenewalCampaign` del tenant la cui stagione
   di **origine** contiene/overlappa la stagione della subscription; per ciascuna calcola lo stato con l'helper
   condiviso; se `open`, popola `{ destinationSeasonName, deadline }`. Se più campagne aperte per la stessa
   subscription (atipico), prendi la più imminente per `deadline`.

### 3.3 Helper condiviso (fonte unica prelazione)

Estrai da `getByDestinationSeasonId` la funzione pura in
[`renewal-window.projection.ts`](../../apps/api/src/bookings/renewal-window.projection.ts) (dove vive già la
projection della finestra; importa `dateRangesOverlap` da `booking.availability.ts`):

```ts
// renewal-window.projection.ts
export function computeRenewalWindowState(
  renewals: { status: BookingStatus; startDate: Date; endDate: Date }[],
  destStart: Date, destEnd: Date,
  deadlineIso: string, todayIso: string,
): RenewalWindowState {
  const exercised = renewals.some(
    (r) => r.status === 'confirmed' && dateRangesOverlap(r.startDate, r.endDate, destStart, destEnd),
  );
  if (exercised) return 'exercised';
  return todayIso > deadlineIso ? 'expired' : 'open';   // giorno-scadenza incluso = aperta (invariato)
}
```

`renewal-campaigns.service.ts` `getByDestinationSeasonId` **rifattorizza** per chiamare questo helper (comportamento
identico: gli e2e esistenti dei rinnovi restano verdi). Il nuovo endpoint lo riusa per la card Abbonamento.

## 4. Frontend — le 3 card reali

Nuovo composable `useCustomerBookings(id)` (Vue Query, pattern di `useCustomers`) → `GET /customers/:id/bookings`.
Header + card Anagrafica **invariati**. Le 3 card stub (righe 58-67) sono sostituite.

### 4.1 Storico prenotazioni
Lista di **tutte** le prenotazioni, raggruppate per **stagione** (header `seasonName`, o "Senza stagione" se
assente), gruppi e righe ordinati dal più recente. Ogni riga: intervallo date, **badge tipo** (Giornaliera /
Periodica / Abbonamento), ombrellone (`umbrellaLabel`), prezzo, **stato**. Le **cancellate** sono mostrate
**attenuate** (es. opacità ridotta + badge "Annullata"). Empty state se il cliente non ha prenotazioni.

### 4.2 Abbonamento e anzianità
Solo le righe `subscription`. Per ciascuna: stagione, ombrellone, **anzianità** ("N ª stagione" / "abbonato da N
stagioni"), badge **Rinnovato** se `renewed`, e — se presente `prelazione` — un badge/nota **"Prelazione aperta per
{destinationSeasonName} · scade {deadline}"** (l'informazione actionable: questo cliente può essere rinnovato nel
suo posto riservato). Empty state "Nessun abbonamento" se non ce ne sono.

### 4.3 Pagamenti e saldo
In evidenza: **saldo aperto** = `Σ(totalPrice − amountCollected)` sulle **non-cancellate** (derivato FE), e
**incassato totale**. Sotto, il **quadro completo** ordinato: tutte le prenotazioni con stato pagamento
(pagata/parziale/non pagata), importo e metodo — progettato per restare leggibile (riepilogo numerico in alto, poi
tabella compatta; le non-pagate evidenziate). Empty state se nessuna prenotazione.

## 5. Piano di test (TDD)

- **Backend unit:** projection `toCustomerBookingDTO` (mappa campi + arricchimenti, subscription vs daily); helper
  `computeRenewalWindowState` (open/exercised/expired ai bordi: `today == deadline` → open; rinnovo confermato →
  exercised). `computeSeniority` è già coperto.
- **Backend e2e** (`customers.e2e-spec.ts` o dedicato): `GET /customers/:id/bookings` →
  - cliente con mix (daily + periodic + subscription): ritorna tutte, ordinate desc, con `umbrellaLabel`/`seasonName`;
  - subscription rinnovata: `seniority` corretta (catena) e `renewed=true`;
  - subscription con **campagna prelazione aperta** dove il cliente è avente-diritto → `prelazione` valorizzata;
    con finestra **scaduta**/**esercitata** → `prelazione` **assente**;
  - una prenotazione **cancellata** compare nella lista (status='cancelled');
  - cliente **senza** prenotazioni → `[]`;
  - **isolamento tenant:** un cliente di s1 richiesto da s2 → `[]` (RLS).
  - **Regressione:** gli e2e rinnovi (`renewal-campaigns.e2e-spec.ts`) restano verdi dopo l'estrazione dell'helper.
- **FE** (web-staff, Vitest + MSW): handler MSW per il nuovo endpoint; test dei 3 render — storico raggruppato per
  stagione con cancellata attenuata; card anzianità con seniority + badge rinnovato + nota prelazione; saldo =
  somma corretta + lista non-pagate; empty state su cliente senza prenotazioni.
- Baseline da NON regredire: **api unit 101 · e2e 153 · web-staff 153 · ui-kit 55**; typecheck pulito. Incrementi
  additivi (unit projection/helper, e2e endpoint, web-staff card).

## 6. Confini e note

- **Prelazione = fonte unica** (helper condiviso). La vista Rinnovi resta la vista *autoritativa e completa* delle
  campagne; la card cliente mostra solo la finestra **aperta** del singolo cliente (actionable), non l'elenco
  campagne.
- **Nessuna azione di scrittura** in questo slice (le card sono read-only). Wirare i bottoni morti della mappa
  ("Abbonamento"/"Presenza") è uno slice separato successivo.
- **Nessun cambio di schema, nessuna migrazione.**

## 7. Decisioni (risolte in brainstorming 2026-07-03)

1. **Un endpoint arricchito** `GET /customers/:id/bookings` che alimenta le 3 card (le card sono derivazioni FE) —
   invece di 3 endpoint separati (DRY, un solo round-trip, una sola vista toccata).
2. **Prelazione INCLUSA** nella card Abbonamento (è nell'intento originale dello stub, "prelazione del posto"), ma
   via **helper condiviso** (fonte unica, no drift) — non esclusa (pigro) né duplicata (debito).
3. **Cancellate mostrate** (attenuate) nello storico — record veritiero e completo.
4. **Pagamenti: quadro completo** (saldo in evidenza + breakdown di tutte le prenotazioni), progettato leggibile.
5. **Read-only**, nessuna nuova scrittura; nessun nuovo ADR (incremento di lettura sull'architettura esistente).

## 8. Scope, layering, logistica

- **Slice separato**, **nuovo branch da `main`** (ADR-0009). File: `packages/contracts` (`CustomerBookingDTO`);
  backend (route in `customers.controller.ts` + servizio di lettura nel dominio bookings + projection +
  estrazione/uso helper `computeRenewalWindowState`); FE (`useCustomerBookings` + le 3 card in
  `CustomerDetailView.vue`, eventuali sotto-componenti per card se il file cresce troppo). **Nessuna migrazione.**
- **Layer previsti (il piano TDD stratifica; la prelazione atterra per ultima → separabile se troppo grande):**
  1. `CustomerBookingDTO` in contracts + endpoint base (bookings del cliente arricchiti con `umbrellaLabel`,
     `seasonName`, `seniority`, `renewed`) + e2e. 2. FE: composable + le 3 card **senza** prelazione (storico,
     anzianità+rinnovi, saldo). 3. Estrazione helper `computeRenewalWindowState` (rifattorizzazione Rinnovi,
     comportamento invariato) + arricchimento `prelazione` nell'endpoint + e2e. 4. FE: nota prelazione nella card
     Abbonamento. (Se in fase di piano il carico è eccessivo, i layer 3-4 diventano uno **slice B**; la spec resta
     completa.)
- **Workflow ADR-0009:** questa spec → (approvazione utente) → piano TDD (`writing-plans`) → esecuzione
  subagent-driven, test-first, un commit per layer. Non regredire i conteggi (riverificati dal vivo).
