# Handoff 2026-06-30 (sera) — Slice A1 prenotazioni giornaliere: COMPLETATA

> Documento di consegna per il **prossimo agente/sessione**. Descrive **cosa è stato
> realizzato** nella slice A1 (prenotazioni giornaliere + mappa accesa), lo stato git,
> i confini mantenuti e le opzioni per i prossimi slice.

> ⚠️ **PRIMA DI SCRIVERE CODICE — leggi TUTTA la documentazione** (vincolo del progetto,
> [ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)): l'intera
> `docs/architecture/` (README + `deferred.md` + `glossary.md` + **tutti** gli ADR in
> `decisions/`), **tutte** le `docs/specs/`, **tutte** le `docs/design/`
> (in particolare `data-model.md`, `design-system.md`, `flows.md`), **tutti** i `docs/plans/`
> e i `docs/handoff/`. Più `README.md` di root e `packages/contracts/src/index.ts`.

---

## 0. Situazione GIT

- **Branch corrente: `feat/bookings-daily`**, diversi commit avanti rispetto a `main`
  (commit per layer; elenco con `git log --oneline origin/main..HEAD`).
- `main` è a `60e38c5` (doc aggiornati prima della slice). Il branch è **pronto per
  review/merge** su main via PR, con build/lint/test verdi.
- Verificare il push con `git push -u origin feat/bookings-daily` prima di aprire la PR.

---

## 1. Cosa ha consegnato A1

### Modello dati (BE)

- Entità `Booking` in Prisma, tenant-scoped con RLS `tenant_isolation FORCE` (stessa
  policy degli altri model).
- **Set di colonne completo** fin da subito (principio anti-debito): campi incasso
  (`paymentStatus`, `amountCollected`, `paymentMethod`, `collectionDate`), self-link
  rinnovo (`previousBookingId`), tipo a 3 valori (`type`). Nella slice A1 solo
  `type=daily` è esercitato dalla logica applicativa.
- `packageId` volutamente omesso: verrà aggiunto con `Package` in A3 (FK non può
  esistere prima dell'entità referenziata).
- 4 nuovi enum DB: `BookingType` (daily/periodic/subscription), `BookingStatus`
  (confirmed/cancelled), `PaymentStatus` (unpaid/partial/paid),
  `PaymentMethod` (cash/card/transfer/other).

### Invariante anti-overlap (BE)

- Controllo app-side in `PrismaService.forTenant`: nessuna `Booking` confermata
  sovrapposta su (umbrella, intervallo date ∩, time-slot sovrapposto).
- Overlap date: intervalli half-open (`startDate < other.endDate && endDate >
  other.startDate`). Overlap slot: stesso slot o slot che si intersecano per orario.
- Hardening con exclusion constraint PG tracciato come
  [D-030](../architecture/deferred.md).

### Endpoint (BE)

Tutti sotto `JwtAuthGuard` globale (tenant dal JWT):

- `POST /api/bookings` — crea prenotazione giornaliera; risponde 409 in caso di
  conflitto slot; 422 se FK fuori tenant (umbrella/customer/timeSlot non appartengono
  all'establishment); 400 per data non valida nel calendario, prezzo negativo o
  superuser senza tenant.
- `GET /api/bookings?date=YYYY-MM-DD` — elenca le prenotazioni del giorno.
- `DELETE /api/bookings/:id` — cancellazione soft (transizione a `status=cancelled`).

### Proiezione mappa slot-aware (BE)

- `projectDayMap` ora deriva `stateBySlot` reale per (umbrella, data, timeSlot) dalle
  prenotazioni confermate: `free` se nessuna prenotazione confermata, `daily` se c'è
  una `Booking` `type=daily` confirmed. Gli stati `booked` e `season` arriveranno con A4.
- `resolveDate` (nuovo helper) normalizza la data operativa con default a oggi in
  `Europe/Rome` ([ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md)).

### Frontend (FE)

- Composable `useBookings` con `useQuery` (lista per data) e `useMutation`
  (crea/cancella), `queryKeys` tenant-scoped.
- `MapView` — modale "Nuova prenotazione": selezione cliente reale (da `/api/customers`),
  slot temporali reali, prezzo inserito manualmente, conferma → crea la prenotazione
  via backend. Selector "Pacchetto" rimosso (rinviato ad A3).
- `MapView` — drawer ombrellone: risolve il nome cliente dalla prenotazione reale;
  bottone "Annulla prenotazione" chiama `DELETE /api/bookings/:id`.
- `BookingsView` (`/bookings`) resta **mockato** — slice A2.

---

## 2. Test e build

| Suite       | Prima di A1 | Dopo A1 | Δ   |
|-------------|-------------|---------|-----|
| ui-kit      | 14          | 14      | —   |
| web-staff   | 40          | 41      | +1  |
| api unit    | 9           | 23      | +14 |
| api e2e     | 22          | 31      | +9  |

- **`pnpm -r build` verde.**
- **`eslint .` verde.**
- Nuovi test unit: helpers data, `booking.availability`, `booking.projection`,
  casi booking in `map.projection`.
- Nuovi e2e: 9 test coprono `POST`/`GET`/`DELETE /api/bookings` (conflict 409, FK
  fuori-tenant 422, bad input 400, isolamento tenant).

---

## 3. Confini mantenuti (cosa A1 NON fa)

- **Prezzo manuale**: nessun motore di pricing; il prezzo è inserito dall'operatore.
  Il pricing engine (`Season`/`Pricing`/`Rate`) arriva con A3.
- **Solo `MapView` collegata**: `BookingsView` resta su dati mock. La schermata
  prenotazioni completa (calendario, lista, filtri) è A2.
- **`packageId` assente**: il campo FK verso `Package` non esiste ancora nella
  migrazione — arriva con A3.
- **Stati `booked`/`season` non prodotti**: la proiezione mappa restituisce solo
  `free` o `daily`. Gli altri stati richiedono A4 (periodic/subscription).
- **Rinnovo `previousBookingId`**: colonna presente nello schema, logica rinviata ad A4.
- **Incasso**: campi presenti nello schema, comportamento (registrazione pagamento,
  incasso a cassa) rinviato ad A2 ([ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md)).

---

## 3bis. Follow-up minori (da code review, rinviati ad A2)

Emersi dalla review finale, non bloccanti, volutamente rinviati per non gonfiare A1:

- **Log dell'anomalia "doppia confermata sullo stesso slot"**: la proiezione mappa è
  già deterministica (prima per `createdAt`), ma non logga l'anomalia come da spec §5.
  Aggiungere il log fuori dalla funzione pura `projectDayMap` (es. nel `MapService`) per
  non introdurre side-effect nella proiezione.
- **`onCancel` non chiude il drawer**: dopo l'annullo il drawer resta aperto
  sull'ombrellone (ora libero); il bottone "Annulla" sparisce correttamente. Valutare se
  chiudere il drawer o lasciarlo aperto per un re-booking immediato (scelta UX).

## 4. Prossimi slice

### A2 — Incasso base ([ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md))

I campi `paymentStatus`/`amountCollected`/`paymentMethod`/`collectionDate` esistono
già sullo schema. A2 aggiunge la logica e la UI: registrazione del pagamento dal
drawer/modale, filtri per stato pagamento in `BookingsView`, eventuale endpoint
`PATCH /api/bookings/:id/payment`. Nessuna migrazione di schema necessaria.

### A3 — Pricing engine + Package

Nuove entità: `Season`, `Pricing`, `Rate`, `Package`. Aggiunge il calcolo automatico
del prezzo basato su listino stagionale e fascia oraria, il selettore "Pacchetto"
nella `MapView`, e il campo `packageId` in `Booking` (FK verso `Package`).
È la parte più complessa: probabilmente un increment autonomo con design spec dedicata.

### A4 — Prenotazioni periodiche/abbonamenti ([ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md))

Introduce `type=periodic` e `type=subscription`, gli stati `booked` e `season` nella
proiezione mappa, e la logica di rinnovo (`previousBookingId` self-link). Richiede
la UI di gestione abbonamenti.

---

## 5. Insidie e gotcha (verificati in questa slice)

- **e2e env loader**: Jest (e2e) carica ora il file `.env.test` di root via
  `apps/api/test/jest-setup-env.ts`, configurato in `setupFiles` di `jest-e2e.json`.
  Non sovrascrive variabili già presenti nell'ambiente (shell). Prima di questa slice
  gli e2e si basavano sull'env preimpostato dalla shell.
- **pnpm via corepack**: il repo pinna `pnpm@11.9.0`. Se la versione locale è
  diversa (es. 9.12.0), usare sempre `corepack pnpm` per rispettare il pin del
  `package.json#packageManager`. In CI: `CI=true corepack pnpm install`.
- **DB su porta 5433**: entrambi i database (`coralyn_dev` e `coralyn_test`) girano
  sull'host locale porta `5433` (override in `docker-compose.override.yml`, gitignored).
  Le migrazioni devono essere applicate a entrambi: `migrate deploy` su `coralyn_dev`
  e `migrate deploy` (o `migrate reset --force --skip-seed`) su `coralyn_test` prima
  di eseguire gli e2e.
- **RLS FORCE**: come sempre, ogni accesso alle tabelle tenant-scoped deve passare da
  `PrismaService.forTenant` (o da una transazione con `set_config` manuale). Il
  `PrismaClient` diretto è bloccato da RLS.
- **`prisma generate` PRIMA di `nest build`** dopo ogni cambio allo schema.

---

## 6. Riferimenti

- **Spec slice A1:** [docs/specs/2026-06-30-bookings-daily-design.md](../specs/2026-06-30-bookings-daily-design.md)
- **Piano slice A1:** [docs/plans/2026-06-30-bookings-daily.md](../plans/2026-06-30-bookings-daily.md)
- **ADR fuso orario / date operative:** [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md)
- **Decisione rimandata D-030** (exclusion constraint anti-overlap PG): [deferred.md](../architecture/deferred.md)
- **Decisione rimandata D-031** (timezone per-tenant): [deferred.md](../architecture/deferred.md)
- **ADR incasso base:** [ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md)
- **ADR anti-overlap slot:** [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)
- **ADR rinnovo self-link:** [ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md)
- **Modello dati (ER):** [docs/design/data-model.md](../design/data-model.md)
- **Handoff precedente (contesto pre-A1):** [2026-06-30-stato-post-rename-inglese.md](2026-06-30-stato-post-rename-inglese.md)
