# Prenotazioni — Slice A4.2 (rinnovo + anzianità) — Design Spec

- **Data:** 2026-07-01
- **Stato:** In revisione — secondo sotto-slice dell'increment **A4 (Periodiche/abbonamenti)**, seguito di
  [A4.1](2026-07-01-bookings-periodic-subscription-a4-1-design.md). Chiude l'increment A4.
- **Convenzione:** codice e DB in **inglese**, nomi DB nativi (no `@@map`); UI e doc in **italiano**
  ([ADR-0030](../architecture/decisions/0030-codice-e-db-in-inglese.md)). Ponte IT↔EN nel
  [glossario](../architecture/glossary.md).
- **ADR di riferimento (nessun ADR nuovo):** questo slice **implementa decisioni già prese**, non ne
  introduce di nuove (come A2/A4.1). Riafferma:
  [ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md) (abbonamento = `Booking`
  `type=subscription`; **rinnovo in un clic** + **storico/anzianità** via self-FK `previousBookingId`;
  prelazione/cabine/sospensione **fuori MVP**),
  [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md) (prenotazione unificata a
  intervallo; prezzo ricalcolato sul nuovo listino),
  [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) (engine puro, **invariato**),
  [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md) (anti-overlap slot-aware
  su intervalli),
  [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md) (date di calendario,
  Europe/Rome, round-trip UTC).
- **Prossimo ADR libero: 0033** (invariato — A4.2 non introduce un ADR).

---

## 1. Obiettivo e confini

**Realizzare la campagna rinnovi.** A4.1 ha abilitato la creazione dei tre tipi di prenotazione e ha
costruito l'infra riusabile (`CatalogService.resolveSeasonWithin`, `priceWithin(tx,…)` dentro la
transazione di create). Lo schema porta da A1 la self-FK `previousBookingId` e la self-relation
`BookingRenewal` (`previousBooking`/`renewals[]`), **finora inutilizzate** (sempre `null`). A4.2 le
attiva: un'azione **"rinnova"** a partire da un abbonamento della stagione precedente crea una nuova
`Booking` `type=subscription` sulla **nuova** stagione, che **copia** cliente + ombrellone + fascia +
pacchetto dalla sorgente, **riprezza** sul listino della nuova stagione e **valorizza**
`previousBookingId`. L'**anzianità** (da quante stagioni consecutive un cliente tiene quel posto) è la
lunghezza della catena dei rinnovi, **derivata** (mai persistita a parte).

**Principio anti-debito (confermato).** A4.2 **non** riscrive il cuore: **nessuna migrazione**
(`previousBookingId`, self-relation, enum e campi esistono già); **engine invariato** (ADR-0032);
**mappa invariata** (una subscription rinnovata si proietta `season` sui giorni della nuova stagione
esattamente come ogni abbonamento). Massimo riuso dell'infra A4.1: il rinnovo è, di fatto, la creazione di
un `subscription` per un'altra stagione, con in più il link al precedente. La logica di scrittura
condivisa con `create` viene **estratta** in un helper privato (riuso, non duplicazione), non ricopiata.

### In scope (A4.2)

- **Rinnovo:** `POST /api/bookings/:id/renew` — `:id` è l'abbonamento sorgente. Il server (autoritativo):
  1. valida la sorgente (esiste nel tenant, è `type=subscription`, è `confirmed`);
  2. rifiuta il **doppio rinnovo** (esiste già un rinnovo confermato di quella sorgente → 409);
  3. risolve la **nuova stagione** da `startDate` (una data nella stagione di destinazione), impone
     `startDate=season.startDate`/`endDate=season.endDate` (semantica subscription di A4.1) e verifica che
     sia una stagione **diversa** da quella della sorgente;
  4. **copia** `customerId`, `umbrellaId`, `timeSlotId`, `packageId` dalla sorgente;
  5. applica l'**anti-overlap** su intervallo (riuso), **riprezza** su `priceWithin(tx,…)` (nuovo listino),
     **scrive** con `type=subscription`, `status=confirmed`, `previousBookingId=:id`.
- **Anzianità (derivata):** lunghezza della catena `previousBookingId` (fresco = 1; suo rinnovo = 2; …),
  calcolata con una **CTE ricorsiva** batch. Esposta **solo** dove serve la campagna (elenco abbonati),
  non su ogni `BookingDTO` (vedi §3, §6).
- **Elenco abbonati della stagione:** `GET /api/bookings/subscriptions?date=<ISO>` — risolve la stagione
  che contiene `date` e ritorna i suoi abbonamenti confermati, ciascuno con `seniority` e flag `renewed`
  (esiste già un rinnovo confermato). Superficie della campagna "da questa stagione → rinnova".
- **FE — vista "Rinnovi"** (`/renewals`): selettore stagione di origine + data della stagione di
  destinazione; tabella abbonati (cliente, ombrellone, anzianità, stato "rinnovato") con azione **Rinnova**
  per riga (disabilitata se già rinnovato); `useSubscriptions`/`useRenewBooking` (TanStack Query).
- **Seed (dev + e2e):** **seconda stagione 2027** (`2027-05-01 .. 2027-09-30`) con proprio `Pricing` e
  `Rate` (inclusa una subscription/period a prezzo **diverso** dal 2026), per esercitare il rinnovo
  end-to-end (nuova stagione + riprezzatura).
- **Contratti (additivi, non breaking):** `RenewBookingInput`, `SubscriptionListItemDTO`,
  `BookingDTO += previousBookingId?`.
- **Test** (TDD, commit-per-layer): unit (DTO), e2e a 2 tenant (rinnovo + prezzo nuovo listino + anzianità
  + doppio-rinnovo + validazioni + anti-overlap + isolamento + elenco subscriptions), web-staff (vista
  Rinnovi: elenco + azione + stato rinnovato).

### Fuori scope (rimandati, tracciati)

- **Prelazione automatica** (finestre/scadenze/rilascio/priorità per anzianità) →
  [D-011](../architecture/deferred.md): l'MVP fa rinnovo **manuale** in un clic (ADR-0012).
- **Cabine/servizi accessori** → [D-012](../architecture/deferred.md); **sospensione/cessione/disdetta**
  → [D-013](../architecture/deferred.md); **notifiche** di scadenza/rinnovo →
  [D-006](../architecture/deferred.md).
- **Editor CRUD del listino** → [D-032](../architecture/deferred.md): la 2ª stagione 2027 è **seeded**
  (stesso pattern di A3.1/A4.1). **Nota di onestà:** [`PricingView.vue`](../../apps/web-staff/src/features/pricing/PricingView.vue)
  resta un mock statico finché non arriva D-032; A4.2 non lo tocca.
- **Rinnovo di `daily`/`periodic`:** si rinnovano solo gli abbonamenti (ADR-0012). Sorgente non
  `subscription` → 422.
- **Direzione temporale del rinnovo** (imporre che la stagione di destinazione sia *successiva* alla
  sorgente): non enforced oltre "stagione diversa" (rinnovare "all'indietro" è insensato ma innocuo;
  vincolarlo sarebbe gold-plating). Tracciato qui, non silenzioso.
- **Pricing periodico multi-stagione** → [D-033](../architecture/deferred.md) (non pertinente: il rinnovo
  è un subscription in **una** stagione).

---

## 2. Modello dati (Prisma) — NESSUNA migrazione

A4.2 **non tocca lo schema**. Tutti i campi/relazioni necessari esistono già dallo schema A1:

| Campo / relazione | Stato | Uso in A4.2 |
|---|---|---|
| `Booking.previousBookingId String? @db.Uuid` | esistente (A1, inutilizzato) | **valorizzato** dal rinnovo |
| `previousBooking Booking? @relation("BookingRenewal", …)` | esistente | risalita catena (anzianità) |
| `renewals Booking[] @relation("BookingRenewal")` | esistente | discesa catena (flag `renewed`) |
| `Booking.type = subscription`, `status`, `totalPrice`, `packageId?` | esistenti | rinnovo = subscription |
| `Season`/`Pricing`/`Rate` | esistenti (A3.1) | 2ª stagione 2027 (via seed) |

> Nessun backfill: le prenotazioni esistenti restano con `previousBookingId = null` (rinnovi mai fatti).

---

## 3. Contratti (`@coralyn/contracts`) — additivi (nessun breaking change)

```ts
/** Input per rinnovare un abbonamento (A4.2). L'unico input è la stagione di destinazione;
 *  tutto il resto è COPIATO dalla sorgente (server-autoritativo). Prezzo ricalcolato sul nuovo listino. */
export interface RenewBookingInput {
  startDate: string;   // ISO yyyy-mm-dd: una data DENTRO la stagione di destinazione (identifica la Season)
}

/** Voce dell'elenco abbonati di una stagione (campagna rinnovi, A4.2). */
export interface SubscriptionListItemDTO {
  id: string;
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  packageId?: string;
  startDate: string;   // = season.startDate
  endDate: string;     // = season.endDate
  totalPrice: number;
  seniority: number;   // lunghezza catena dei rinnovi (derivata, ≥ 1)
  renewed: boolean;    // esiste già un rinnovo CONFERMATO di questo abbonamento
}
```

- **`BookingDTO += previousBookingId?: string`** (additivo): valorizzato per i rinnovi (`undefined` per le
  prenotazioni non-rinnovo). Onesto e utile alla FE, non-breaking (campo opzionale). La proiezione
  `toBookingDTO` (`apps/api/src/bookings/booking.projection.ts`) mappa `previousBookingId` (nullable DB →
  campo opzionale del DTO: `null` → assente).
- **`seniority` NON entra in `BookingDTO`** (scelta deliberata): l'anzianità è un concetto della **campagna
  rinnovi** e vive in `SubscriptionListItemDTO`, dove è calcolata per gli abbonamenti elencati. Evita di
  pagare la risalita-catena su ogni `BookingDTO` (es. `GET /bookings` giornaliero) e di lasciare un campo
  opzionale semi-popolato. La `renew` ritorna un `BookingDTO` (con `previousBookingId`); la FE aggiorna
  l'anzianità ri-caricando l'elenco.

---

## 4. Endpoint

### `POST /api/bookings/:id/renew` — rinnova (nuovo)

- **Body:** `RenewBookingDto` (`startDate` `@IsCalendarDate`, **obbligatorio**). `:id` = abbonamento
  sorgente (validato nel service, non nel DTO).
- **Esito:** `201` + `BookingDTO` del nuovo abbonamento (`type=subscription`, `previousBookingId=:id`).
- **Errori di dominio (nel service → status):**
  - sorgente inesistente nel tenant → **404** "Prenotazione non trovata" (pattern `cancel`/`settlePayment`).
  - sorgente non `subscription` → **422** "Si rinnovano solo gli abbonamenti".
  - sorgente `cancelled` → **422** "Impossibile rinnovare un abbonamento annullato".
  - già rinnovata (esiste rinnovo `confirmed`) → **409** "Abbonamento già rinnovato".
  - `startDate` senza stagione attiva → **422** "Nessuna stagione attiva per questa data".
  - stagione di destinazione **uguale** a quella della sorgente → **422** "Il rinnovo deve puntare a una
    stagione diversa".
  - ombrellone occupato nella nuova stagione (anti-overlap) → **409** "Fascia non disponibile per questo
    ombrellone".
  - no-rate/no-season nel pricing → **422** (mappa `priceOrThrow` esistente).

> **`ValidationPipe({ whitelist: true })`**: `startDate` **deve** stare nel DTO o il pipe lo scarta
> (gotcha ricorrente A3.2/A4.1). `RenewBookingDto` dichiara **solo** `startDate` (nient'altro è accettato
> dal client: cliente/ombrellone/pacchetto/prezzo sono **copiati/derivati** dal server).

### `GET /api/bookings/subscriptions?date=<ISO>` — elenco abbonati della stagione (nuovo)

- **Query:** `SubscriptionsQueryDto` (`date` `@IsCalendarDate`, opzionale → default `todayInRome`, come
  `bookings-query.dto`). Il server risolve la `Season` che contiene `date`.
- **Esito:** `200` + `SubscriptionListItemDTO[]` — gli abbonamenti `confirmed` di quella stagione, con
  `seniority` (CTE) e `renewed`. Nessuna stagione per `date` → `[]` (lista vuota, non 422: è una vista, non
  una create).

### Invariati

`POST /api/bookings` (create), `GET /api/bookings`, `GET /api/bookings/quote`, `DELETE /api/bookings/:id`,
`PATCH /api/bookings/:id/payment`, `GET /api/packages`, `GET /api/map` — **invariati**.

---

## 5. `BookingsService` — `renew`, helper condiviso, elenco subscriptions

### 5.1 Estrazione dell'helper condiviso (riuso, non duplicazione)

Le fasi **anti-overlap → prezzo → scrittura** sono identiche tra `create` e `renew`. Si estrae un metodo
privato `priceAndWrite(tx, params)` usato da entrambi; la **validazione FK** (cliente/ombrellone/fascia/
pacchetto esistono nel tenant) resta in `create` (input dal client), mentre `renew` **copia** FK già valide
dalla sorgente e passa la fascia caricata all'helper.

```ts
private async priceAndWrite(
  tx: Prisma.TransactionClient,
  p: {
    tenantId: string; customerId: string; umbrellaId: string; slot: TimeSlot;
    packageId: string | null; type: BookingType; startDate: string; endDate: string;
    previousBookingId: string | null;
  },
): Promise<Booking> {
  const dbStart = toDbDate(p.startDate);
  const dbEnd = toDbDate(p.endDate);
  // Anti-overlap su intervallo (ADR-0013): stesso ombrellone, date intersecanti, fascia sovrapposta.
  const sameUmbrella = await tx.booking.findMany({
    where: { umbrellaId: p.umbrellaId, status: 'confirmed' },
    include: { timeSlot: true },
  });
  const conflict = sameUmbrella.some(
    (b) => dateRangesOverlap(b.startDate, b.endDate, dbStart, dbEnd) && slotsOverlap(b.timeSlot, p.slot),
  );
  if (conflict) throw new ConflictException('Fascia non disponibile per questo ombrellone');
  // Prezzo server-autoritativo.
  const totalPrice = this.priceOrThrow(
    await this.catalog.priceWithin(tx, {
      umbrellaId: p.umbrellaId, timeSlotId: p.slot.id,
      startDate: p.startDate, endDate: p.endDate, type: p.type, packageId: p.packageId,
    }),
  );
  return tx.booking.create({
    data: {
      establishmentId: p.tenantId, customerId: p.customerId, umbrellaId: p.umbrellaId,
      timeSlotId: p.slot.id, startDate: dbStart, endDate: dbEnd, type: p.type,
      status: 'confirmed', totalPrice, packageId: p.packageId, previousBookingId: p.previousBookingId,
    },
  });
}
```

`create` diventa: `deriveInterval` → FK check (carica `slot`) → `priceAndWrite(tx, { …, previousBookingId: null })`.

### 5.2 `renew(id, input)`

```ts
async renew(id: string, input: RenewBookingInput): Promise<BookingDTO> {
  const tenantId = this.tenant.require();
  const created = await this.prisma.forTenant(tenantId, async (tx) => {
    // 1) Sorgente valida.
    const source = await tx.booking.findFirst({ where: { id }, include: { timeSlot: true } });
    if (!source) throw new NotFoundException('Prenotazione non trovata');
    if (source.type !== 'subscription')
      throw new UnprocessableEntityException('Si rinnovano solo gli abbonamenti');
    if (source.status !== 'confirmed')
      throw new UnprocessableEntityException('Impossibile rinnovare un abbonamento annullato');
    // 2) No doppio rinnovo.
    const already = await tx.booking.findFirst({ where: { previousBookingId: id, status: 'confirmed' } });
    if (already) throw new ConflictException('Abbonamento già rinnovato');
    // 3) Nuova stagione (semantica subscription), diversa dalla sorgente.
    const season = await this.catalog.resolveSeasonWithin(tx, input.startDate);
    if (!season.ok) throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
    if (season.startDate === formatDbDate(source.startDate))
      throw new UnprocessableEntityException('Il rinnovo deve puntare a una stagione diversa');
    // 4) Copia FK dalla sorgente + 5) anti-overlap/prezzo/scrittura (helper).
    return this.priceAndWrite(tx, {
      tenantId, customerId: source.customerId, umbrellaId: source.umbrellaId, slot: source.timeSlot,
      packageId: source.packageId, type: 'subscription',
      startDate: season.startDate, endDate: season.endDate, previousBookingId: id,
    });
  });
  return toBookingDTO(created);
}
```

> **Copia della fascia:** `source.timeSlot` è la `TimeSlot` della sorgente (già nel tenant); l'helper la usa
> sia per l'anti-overlap sia come `timeSlotId` scritto. Nessuna FK dal client.
> **Confronto stagione:** su ISO `yyyy-mm-dd` (`formatDbDate`), coerente con ADR-0031 (confronti
> lessicografici solo su ISO). La sorgente è un subscription → `source.startDate` è già `season.startDate`.

### 5.3 Elenco abbonati + anzianità

```ts
async listSubscriptions(date: string): Promise<SubscriptionListItemDTO[]> {
  const tenantId = this.tenant.require();
  return this.prisma.forTenant(tenantId, async (tx) => {
    const season = await this.catalog.resolveSeasonWithin(tx, date);
    if (!season.ok) return [];
    const s = toDbDate(season.startDate), e = toDbDate(season.endDate);
    const subs = await tx.booking.findMany({
      where: { type: 'subscription', status: 'confirmed', startDate: { lte: e }, endDate: { gte: s } },
      orderBy: { createdAt: 'asc' },
    });
    if (subs.length === 0) return [];
    const ids = subs.map((b) => b.id);
    const seniorityById = await this.computeSeniority(tx, ids);           // §6 (CTE ricorsiva, batch)
    const renewedIds = new Set(
      (await tx.booking.findMany({
        where: { previousBookingId: { in: ids }, status: 'confirmed' }, select: { previousBookingId: true },
      })).map((r) => r.previousBookingId!),
    );
    return subs.map((b) => toSubscriptionListItemDTO(b, seniorityById.get(b.id) ?? 1, renewedIds.has(b.id)));
  });
}
```

---

## 6. Anzianità — CTE ricorsiva (batch, tenant-scoped)

L'anzianità è la lunghezza della catena da `b` risalendo `previousBookingId` fino alla radice. Si calcola
per **tutti** gli abbonamenti elencati in **una** query (niente N+1), con una CTE ricorsiva eseguita nella
transazione `forTenant` (RLS attiva sulla `Booking`, quindi la risalita resta nel tenant):

```ts
private async computeSeniority(
  tx: Prisma.TransactionClient, ids: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await tx.$queryRaw<{ id: string; seniority: number }[]>(Prisma.sql`
    WITH RECURSIVE chain AS (
      SELECT id, "previousBookingId", 1 AS depth
        FROM "Booking" WHERE id IN (${Prisma.join(ids)})
      UNION ALL
      SELECT c.id, b."previousBookingId", c.depth + 1
        FROM chain c JOIN "Booking" b ON b.id = c."previousBookingId"
    )
    SELECT id, MAX(depth)::int AS seniority FROM chain GROUP BY id
  `);
  return new Map(rows.map((r) => [r.id, Number(r.seniority)]));
}
```

- Per ogni `id` di partenza, `depth` parte da 1 e cresce di 1 per ogni antenato; `MAX(depth)` = lunghezza
  totale della catena. Nessun antenato (`previousBookingId = null`) → `seniority = 1`.
- **Cicli:** impossibili per costruzione (ogni rinnovo linka a un booking **preesistente**; il grafo è un
  albero orientato all'indietro). Nessuna guardia anti-ciclo necessaria.
- **RLS:** `$queryRaw` dentro `forTenant` eredita il GUC `app.current_tenant`; la risalita vede solo le
  `Booking` del tenant (le stagioni precedenti sono dello stesso `establishmentId`). Verificato dagli e2e a
  2 tenant.

---

## 7. Mappa — nessuna modifica (verifica)

Il rinnovo produce un `Booking` `type=subscription` sulla nuova stagione: `map.projection.ts`
(`STATE_BY_TYPE.subscription = 'season'`) e `map.service.ts` (filtro per intervallo) lo proiettano `season`
sui giorni della nuova stagione **senza alcuna modifica**. A4.2 lo verifica implicitamente (un e2e sulla
mappa in un giorno della stagione 2027 dopo il rinnovo → `season`), coerente con A4.1.

---

## 8. FE (`apps/web-staff`) — vista "Rinnovi"

### Nuova vista `RenewalsView.vue` (rotta `/renewals`, voce sidebar "Rinnovi")

- **Selettore stagione di origine:** una data che identifica la stagione di cui elencare gli abbonati
  (default: stagione corrente). Guida `GET /bookings/subscriptions?date=`.
- **Data stagione di destinazione:** un `<input type="date">` (una data nella stagione bersaglio, es.
  2027). È lo `startDate` inviato a `renew` per **tutte** le righe.
- **Tabella:** Cliente · Ombrellone · Anzianità (`seniority`) · Stato (`renewed` → badge "Rinnovato") ·
  azione **Rinnova** (bottone). Il bottone è **disabilitato** se `renewed === true` o se manca la data di
  destinazione.
- **Composable:** `useSubscriptions(date)` (query) e `useRenewBooking()` (mutation → `POST
  /bookings/:id/renew`), che su successo **invalida** `useSubscriptions` (la riga passa a "Rinnovato" e
  l'anzianità del nuovo abbonamento è visibile ri-elencando la stagione di destinazione).

### Contratti/composable

- `BookingDTO.previousBookingId?` disponibile ma **non** richiesto dalla vista (usa `SubscriptionListItemDTO`).
- **MSW** (test): `GET /api/bookings/subscriptions` (lista con `seniority`/`renewed`); `POST
  /api/bookings/:id/renew` (ritorna un `BookingDTO` con `previousBookingId`).
- **Pulire `apps/web-staff/node_modules/.vite`** dopo il cambio contratti (gotcha ricorrente).

> **Nota:** `BookingsView` **non** cambia (resta la vista giornaliera). La campagna rinnovi è una superficie
> **a sé** (season-oriented), non un innesto sulla vista giornaliera.

---

## 9. Seed (dev + e2e) — seconda stagione 2027

- **`prisma/seed.ts`** (dev) e **`test/helpers/seed-pricing.ts`** (e2e): aggiungere una **`Season` 2027**
  (`2027-05-01 .. 2027-09-30`), un suo **`Pricing`** e le **`Rate`** minime, inclusa una
  `type=subscription`, `unit=period` a **prezzo diverso** dal 2026 (es. `850` vs `800`) più la catch-all
  `unit=day`. Così il rinnovo dimostra la **riprezzatura sul nuovo listino** (2026 → 800, rinnovo 2027 →
  850) e l'anzianità cresce (1 → 2).
- UUID sintetici coerenti col pattern esistente (`u(n,k)` nel seed dev; costanti negli helper e2e).
- Le stagioni **non** si sovrappongono (2026 e 2027 disgiunte): invariante rispettato per costruzione
  (listino seeded, [D-032]).

---

## 10. Test (TDD, commit-per-layer)

Target da **non** regredire: **ui-kit 14 · web-staff 45 · api unit 64 · api e2e 63** (baseline A4.1).

### api unit
- **`renew-booking.dto.spec`**: `startDate` obbligatorio + calendariale; nessun altro campo accettato.
- **`subscriptions-query.dto.spec`** (se separato): `date` opzionale calendariale.

### api e2e (`coralyn_test`, 2 tenant, seed listino esteso 2026+2027)
- **rinnovo felice:** crea subscription 2026 → `renew` con `startDate` in 2027 → **201**, `type=subscription`,
  `startDate/endDate = stagione 2027`, `totalPrice = 850` (nuovo listino), `previousBookingId = sorgente`.
- **anzianità:** `GET /subscriptions?date=<2026>` prima del rinnovo → la sorgente ha `seniority=1`,
  `renewed=false`; dopo il rinnovo → `renewed=true`; `GET /subscriptions?date=<2027>` → il rinnovo ha
  `seniority=2`.
- **doppio rinnovo → 409:** rinnovare due volte la stessa sorgente.
- **validazioni → 422:** rinnovare una `daily`; rinnovare una subscription `cancelled`; `startDate` fuori
  stagione; stagione di destinazione = stagione della sorgente.
- **sorgente inesistente/altro tenant → 404** (isolamento RLS).
- **anti-overlap → 409:** occupare l'ombrellone in 2027 (subscription diretta) poi tentare il rinnovo sullo
  stesso ombrellone/fascia → 409.
- **mappa:** dopo il rinnovo, `GET /map?date=<giorno 2027>` → cella dell'ombrellone `season`.

### web-staff (Vitest + MSW)
- `RenewalsView.spec`: rende l'elenco abbonati con **Anzianità**; il bottone **Rinnova** chiama la mutation
  e la riga diventa "Rinnovato"; bottone disabilitato se `renewed` o senza data di destinazione.

---

## 11. Verifica / DoD

- **Nessuna migrazione**; `prisma generate` non necessario (schema invariato) — ma se il client è stale
  dopo cambio branch: `corepack pnpm --filter @coralyn/api exec prisma generate` prima di `nest build`.
- **Su macchina stale:** `prisma migrate deploy` su `coralyn_test` **e** `coralyn_dev` prima degli e2e;
  ri-seed (`prisma db seed`) per avere la 2ª stagione 2027.
- Test verdi, conteggi **≥** ai target (con i nuovi). `pnpm -r build` + `eslint .` verdi.
- **Verifica live** (Docker `--profile full up -d --build api` + dev FE): nella vista **Rinnovi**, scegliere
  la stagione 2026, impostare una data 2027, cliccare **Rinnova** su un abbonato → compare il nuovo
  abbonamento 2027 (prezzo 850), la riga sorgente diventa "Rinnovato", l'anzianità del rinnovo è 2; la mappa
  di un giorno 2027 mostra l'ombrellone `season`. Login dev `admin@coralyn.dev` / `coralyn-admin-8473`.
- **Doc:** aggiornare `README.md` (stato: A4.2 rinnovo+anzianità → **increment A4 completo**),
  `data-model.md` (`previousBookingId` ora **valorizzato**; anzianità derivata via catena),
  `glossary.md` (Rinnovo/Anzianità: da "(futuro)" a **implementati (A4.2)**); **handoff A4.2**. Nessun ADR
  nuovo (0033 resta libero). `deferred.md` invariato (D-011/012/013 restano; nessuna nuova voce).

---

## 12. Casi limite e regole d'integrità (riepilogo)

- **Server-autoritativo:** rinnovo copia FK dalla sorgente; il client passa **solo** la stagione di
  destinazione (`startDate`). Prezzo sempre ricalcolato sul nuovo listino.
- **Solo abbonamenti:** sorgente non `subscription` → 422; sorgente `cancelled` → 422.
- **No doppio rinnovo:** un rinnovo confermato per sorgente (409). La catena è 1:1 in pratica (schema 1:N,
  regola imposta dal dominio).
- **Stagione diversa:** destinazione = stagione della sorgente → 422 (evita duplicato/overlap sulla stessa
  stagione; l'anti-overlap lo intercetterebbe comunque, ma il 422 è più chiaro).
- **Anti-overlap su intervalli:** riuso (helper condiviso); ombrellone occupato nella nuova stagione → 409.
- **Anzianità derivata:** CTE ricorsiva batch; mai persistita; fresco = 1.
- **Mappa da `type`:** subscription rinnovata → `season` (codice esistente, invariato).
- **Isolamento:** ogni query in `forTenant`; RLS FORCE; sorgente/antenati fuori tenant invisibili → 404;
  e2e a 2 tenant.

## 13. Decisioni chiuse

1. **Forma API:** endpoint dedicato `POST /bookings/:id/renew` (server copia dalla sorgente), **non**
   `create` con `previousBookingId` dal client (evita divergenza/manomissione). (§4, §5)
2. **Stagione di destinazione esplicita** via `startDate` nel body (riuso semantica subscription A4.1);
   "prossima stagione" automatica scartata (stagioni non contigue). (§4, §5)
3. **Anzianità esposta ora**, derivata via CTE ricorsiva, **solo** in `SubscriptionListItemDTO` (non su
   `BookingDTO`, per non pagare la risalita ovunque). (§3, §6)
4. **Superficie campagna:** `GET /bookings/subscriptions?date=` + vista FE **Rinnovi** dedicata. (§4, §8)
5. **Invarianti di rinnovo:** solo subscription, no doppio rinnovo, stagione diversa, anti-overlap. (§4, §12)
6. **Riuso, non duplicazione:** helper privato `priceAndWrite` condiviso da `create` e `renew`. (§5.1)
7. **Nessuna migrazione; engine/mappa invariati; seed 2ª stagione 2027** per esercitare riprezzatura +
   anzianità. (§2, §7, §9)
8. **Fuori scope:** prelazione [D-011], cabine [D-012], sospensione [D-013], notifiche [D-006], editor
   listino [D-032]; direzione temporale non enforced (solo "stagione diversa"). (§1)
