# Handoff 2026-07-01 — Slice A4.1 periodiche + abbonamenti: COMPLETATA (branch non integrato)

> Documento di consegna per il prossimo agente/sessione. Descrive cosa ha realizzato la slice A4.1
> (creazione `type=periodic`/`type=subscription`, pricing su intervallo, anti-overlap su intervalli,
> FE modale + `BookingsView`, seed), lo stato git, i confini mantenuti e il prossimo slice (A4.2).

> ⚠️ **PRIMA DI SCRIVERE CODICE — leggi TUTTA la documentazione** ([ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)):
> l'intera `docs/architecture/` (README + `deferred.md` + `glossary.md` + tutti gli ADR), tutte le
> `docs/specs/` (in particolare
> [2026-07-01-bookings-periodic-subscription-a4-1-design.md](../specs/2026-07-01-bookings-periodic-subscription-a4-1-design.md)),
> tutte le `docs/design/`, tutti i `docs/plans/` e i `docs/handoff/`. Più `README.md` di root e
> `packages/contracts/src/index.ts`.

---

## 0. Situazione GIT

- Branch **`feat/bookings-periodic-subscription`**, creato da `main` al commit `c452914` (merge-base
  confermato: `git merge-base main HEAD` → `c452914`).
- **NON ancora mergiata/pushata**: l'integrazione su `main` è una decisione dell'umano, non presa in questa
  sessione. `git push` non è stato eseguito.
- Catena per layer (`git log main..HEAD --oneline --reverse`):
  1. `a5158da` — docs(specs): design spec A4.1
  2. `ebff0e9` — docs(specs,deferred): periodica cross-stagione → 422 esplicito + D-033
  3. `1ef9192` — docs(plans): piano TDD A4.1 (6 task, commit-per-layer)
  4. `2f11f04` — feat(contracts): booking inputs → `startDate`/`endDate` + `type` obbligatorio
  5. `85af688` — feat(api): create/quote periodic+subscription (`deriveInterval`, `priceWithin` su range)
  6. `f9ffd14` — refactor(api): condividi `TYPES` tra i DTO booking (DRY, review)
  7. `d88b266` — feat(web-staff): selettore Tipo (periodica/abbonamento) + fine periodo + re-quote
  8. `15da9bf` — feat(web-staff): colonna Tipo reale + Periodo range in `BookingsView`
  9. `7907572` — test(api): e2e periodic+subscription (prezzo, mappa, anti-overlap range, validazioni)
  10. (questo commit) — docs: seed, glossary, data-model, README, handoff

---

## 1. Cosa ha consegnato A4.1

### Backend (`bookings` + `catalog`)

- **`POST /api/bookings` e `GET /api/bookings/quote`** creano/prezzano anche `type=periodic` (intervallo
  esplicito) e `type=subscription` (intervallo = Stagione attiva).
- **`BookingsService.deriveInterval`** (privato, unica fonte per `create()` e `quote()`): deriva e valida
  l'intervallo per tipo, **server-autoritativo**.
  - `daily` → `endDate = startDate`; `input.endDate` presente → **422**.
  - `periodic` → `input.endDate` **richiesto**, `endDate ≥ startDate`, e non deve superare
    `season.endDate` (altrimenti **422** "Il periodo supera la stagione" — niente split multi-stagione).
  - `subscription` → `input.endDate` **vietato** (422 se presente); il server risolve la Stagione attiva
    da `startDate` e impone `startDate=season.startDate`, `endDate=season.endDate`.
- **`CatalogService.resolveSeasonWithin(tx, date)`** (nuovo metodo pubblico): risolve la Stagione attiva
  per una data e ne ritorna l'intervallo (`NO_SEASON` → 422 se assente); riusato sia da `deriveInterval`
  sia, indipendentemente, da `priceWithin` (stessa query ripetuta una volta in più per due metodi
  auto-contenuti — scelta deliberata, non over-engineering).
- **`CatalogService.priceWithin`** esteso a `startDate`/`endDate` (era singola `date`): il pricing engine
  (`resolvePrice`, ADR-0032) era **già generale** su multi-giorno e `unit=period` e resta invariato — cambia
  solo il ponte service→engine.
- **Anti-overlap ora esercitato su intervalli reali**: `dateRangesOverlap(a.start,a.end,b.start,b.end) &&
  slotsOverlap(...)` → 409, per prenotazioni `periodic`/`subscription` multi-giorno (prima il path era
  raggiungibile solo con `daily`, intervallo di un giorno).
- **Periodica a cavallo di due stagioni → 422 esplicito** (mai prezzo parziale/€0 silenzioso); il caso
  di split-pricing multi-stagione è tracciato come debito consapevole in
  [D-033](../architecture/deferred.md) (stagioni non contigue nell'anno operativo → caso atipico, gold
  plating se risolto ora).

### Contratti (`@coralyn/contracts`) — breaking, pre-release, lockstep (come A3.1/`totalPrice`)

- `CreateBookingInput`/`QuoteBookingInput`: `date` → `startDate`/`endDate?`; **`type` diventa
  obbligatorio** (niente più default implicito `daily`). `BookingDTO` era già `startDate`/`endDate`/`type`
  → invariato.
- `ValidationPipe({ whitelist: true })` **scarta silenziosamente** campi non dichiarati nel DTO: `type` ed
  `endDate` sono stati aggiunti esplicitamente ai DTO NestJS (gotcha ricorrente, riconfermato in questa
  slice).

### Mappa — nessuna modifica (solo verificata)

- `map.projection.ts` derivava **già** `STATE_BY_TYPE = { daily:'daily', periodic:'booked',
  subscription:'season' }` e `map.service.ts` filtrava già le prenotazioni per intervallo. A4.1 lo
  **verifica** con e2e dedicati (giorno interno all'intervallo → cella `booked`/`season`), non lo tocca.

### Frontend (`apps/web-staff`)

- **Modale "Nuova prenotazione" (`MapView.vue`)**: selettore **Tipo** (Giornaliera/Periodica/Abbonamento);
  per Periodica compare l'input **"Fine periodo"**; per Abbonamento l'etichetta statica "Durata: stagione
  intera." `quoteParams`/payload includono `type` (+ `endDate` se periodic) e il prezzo si **ricalcola**
  (re-quote) al cambio tipo/date/pacchetto.
- **`BookingsView.vue`**: colonna **"Tipo"** reale (`daily→Giornaliera`, `periodic→Periodica`,
  `subscription→Abbonamento`, sostituisce l'hard-coded "Giornaliero") e nuova colonna **"Periodo"**
  (`daily` → solo `startDate`; `periodic`/`subscription` → intervallo `startDate → endDate`).

### Seed

- `apps/api/prisma/seed.ts`: aggiunta una `Rate` `type=subscription`, `unit=period`, `price=800` (id
  `u(9,3)`) al listino demo, per esercitare dal vivo il path a forfait di stagione. Applicata a
  `coralyn_dev` con `prisma db seed` (idempotente, verificata via query diretta con GUC `app.current_tenant`
  impostata — RLS FORCE sulla tabella `Rate`).

---

## 2. Confini NON toccati (fuori scope, per design)

- **Rinnovo + anzianità → A4.2**: `previousBookingId` esiste dallo schema A1 ma resta **sempre `null`**;
  nessuna azione "rinnova" in questa slice.
- **Periodica cross-stagione**: solo 422 esplicito, nessuno split pricing multi-stagione →
  [D-033](../architecture/deferred.md) (debito tracciato, non silenzioso).
- **Engine di pricing, mappa, RLS, schema Prisma**: invariati. **Nessuna migrazione** in questa slice.
- **Extra a prezzo** (`Booking.extras`): non introdotto.
- **Editor CRUD del listino**: resta rimandato ([D-032](../architecture/deferred.md)); il listino resta
  seeded.

## 3. Follow-up minore noto (da review)

Il pulsante **"Conferma prenotazione"** nel modale (`MapView.vue`) **non è disabilitato** quando
`type=periodic` e la data di fine non è ancora impostata: in quel caso `quoteParams` ritorna `null` (niente
quote), `useBookingQuote` non esegue la query (query TanStack disabilitata: `isError`/`isFetching`
restano `false`), quindi la condizione `:disabled="quoteError || quoteLoading"` resta **falsa** e il
pulsante è cliccabile con prezzo mostrato `€ 0.00`. Il server rifiuta comunque la richiesta con **422**
("Periodica: specificare la data di fine"), quindi **nessun dato invalido viene scritto** — ma vale un
piccolo fix FE in un passaggio successivo (disabilitare "Conferma" anche quando `quote` è `null`).

---

## 4. Gotcha riconfermati in questa slice

- **`ValidationPipe({ whitelist: true })`** scarta silenziosamente i campi non dichiarati nel DTO: `type`
  ed `endDate` devono stare esplicitamente nei DTO NestJS (non solo nell'interfaccia contracts).
- **Forma UUID**: `@Matches(UUID_SHAPE)` (non `@IsUUID` stretto) per i campi FK opzionali (pattern A3.2,
  invariato in A4.1).
- **DB su porta 5433** (non 5432): Postgres in Docker, `coralyn_dev`/`coralyn_test` già migrati in questo
  ambiente.
- Su una macchina "stale" (branch cambiato di recente, o prima sincronizzazione): eseguire
  `prisma migrate deploy` **sia** su `coralyn_test` **sia** su `coralyn_dev` — la migrazione del pricing
  (A3.1) potrebbe non essere applicata.
- Dopo modifiche BE: **ricostruire l'immagine Docker `api`** prima di una verifica live
  (`docker compose --profile full up -d --build api`).
- Dopo modifiche ai contratti: **pulire `apps/web-staff/node_modules/.vite`** (cache stale del pacchetto
  `@coralyn/contracts`).
- `prisma/seed.ts` gira con `prisma db seed` (usa lo script `prisma.seed` di `apps/api/package.json`);
  invocare `ts-node prisma/seed.ts` direttamente via `pnpm --filter @coralyn/api exec` non esegue il
  main (nessun errore, ma nessun side-effect visibile) — usare sempre `prisma db seed`.

---

## 5. Test — conteggi REALI (DoD, sessione 2026-07-01)

Tutti i comandi seguenti sono stati eseguiti e sono risultati **verdi**:

```
corepack pnpm -r build        → verde (tutti i 5 workspace, incl. apps/web-staff vite build)
corepack pnpm eslint .        → verde (nessun errore/warning)
corepack pnpm --filter @coralyn/ui-kit test      → 7 file, 14 test PASSED
corepack pnpm --filter @coralyn/web-staff test   → 18 file, 45 test PASSED
corepack pnpm --filter @coralyn/api test         → 12 suite, 64 test PASSED
corepack pnpm --filter @coralyn/api test:e2e     → 5 suite, 63 test PASSED
```

| Suite | Conteggio reale | Target design spec (§10) |
|---|---|---|
| ui-kit | **14** | 14 |
| web-staff | **45** | ≥44 |
| api unit | **64** | ≥61 |
| api e2e (totale, 5 suite) | **63** | ≥53 |

Nessuna regressione osservata rispetto alle slice precedenti (A1→A3.2); i conteggi sono **pari o superiori**
ai target del design spec.

---

## 6. Prossimo slice: A4.2 — Rinnovo + anzianità

Da [ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md) e dal design spec A4.1 §1/§13:

- Azione "rinnova" dalla lista abbonati della stagione precedente → nuova `Booking` che copia
  cliente/ombrellone/pacchetto, riprezza sul nuovo listino e **valorizza `previousBookingId`**.
- Anzianità = lunghezza della catena di rinnovi (derivata, non persistita separatamente).
- Fuori scope anche di A4.2 (rimandati oltre): prelazione automatica ([D-011](../architecture/deferred.md)),
  cabine/servizi ([D-012](../architecture/deferred.md)), sospensione/cessione/disdetta
  ([D-013](../architecture/deferred.md)).
- Editor CRUD del listino ([D-032](../architecture/deferred.md)) resta un'opzione indipendente, non
  bloccante per A4.2.
