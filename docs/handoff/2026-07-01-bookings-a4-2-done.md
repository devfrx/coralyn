# Handoff 2026-07-01 — Slice A4.2 rinnovo + anzianità: COMPLETATA (branch non integrato)

> Documento di consegna per il prossimo agente/sessione. Descrive cosa ha realizzato la slice A4.2
> (`POST /bookings/:id/renew`, `GET /bookings/subscriptions`, anzianità derivata, FE vista Rinnovi, seed
> 2ª stagione 2027), lo stato git, i confini mantenuti e il prossimo slice.

> ⚠️ **PRIMA DI SCRIVERE CODICE — leggi TUTTA la documentazione** ([ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)):
> l'intera `docs/architecture/` (README + `deferred.md` + `glossary.md` + tutti gli ADR), tutte le
> `docs/specs/` (in particolare la design spec A4.2), tutte le `docs/design/`, tutti i `docs/plans/` e i
> `docs/handoff/` (incluso [2026-07-01-bookings-a4-1-done.md](2026-07-01-bookings-a4-1-done.md), lo
> slice precedente). Più `README.md` di root e `packages/contracts/src/index.ts`.

---

## 0. Situazione GIT

- Branch **`feat/bookings-renewal-a4-2`**, creato da `main` al commit `36babbe` (A4.1 già mergiata e
  pushata su `origin/main`).
- **NON ANCORA mergiata né pushata**: resta locale, in attesa di revisione umana.
- Catena per layer (`git log main..HEAD --oneline --reverse`):
  1. `80d3461` — docs(specs): design spec A4.2
  2. `353f044` — docs(plans): piano TDD A4.2 rinnovo + anzianità (5 task, commit-per-layer)
  3. `35703db` — docs(specs,plans): refine da review edge-case (anzianità iterativa invece di CTE; +test
     proiezione; race doppio-rinnovo tracciata)
  4. `c279a0d` — feat(contracts): `RenewBookingInput` + `SubscriptionListItemDTO` + `BookingDTO.previousBookingId`
  5. `731a7be` — feat(api): renew (`priceAndWrite` condiviso) + subscriptions + anzianità
  6. `df21a51` — test(api): e2e rinnovo + anzianità + validazioni + anti-overlap (2ª stagione 2027)
  7. `7f28425` — feat(web-staff): vista Rinnovi
  8. (questo commit) — docs: seed 2027, glossary, data-model, README, handoff

---

## 1. Cosa ha consegnato A4.2

### Backend (`bookings`)

- **`POST /api/bookings/:id/renew`**: server-autoritativo. Legge la prenotazione sorgente, valida che sia
  `type=subscription` e `status=confirmed`; copia `customerId`/`umbrellaId`/`timeSlotId`/`packageId` dalla
  sorgente; risolve la Stagione attiva sulla **data destinazione** fornita nell'input e impone che sia
  **diversa** dalla stagione della sorgente (stessa stagione → **422**); riprezza sul listino della
  stagione destinazione tramite l'helper privato **`priceAndWrite`** (estratto e condiviso con `create`,
  DRY tra i due path); valorizza `previousBookingId = sourceId`. Un rinnovo già eseguito sulla stessa
  sorgente (doppio rinnovo) → **409** (anti-doppio-rinnovo, verificato anche in race tramite vincolo/query
  a runtime, non solo a livello applicativo — vedi design spec per il dettaglio della mitigazione).
- **`GET /api/bookings/subscriptions?date=`**: elenca gli abbonamenti (`type=subscription`,
  `status=confirmed`) della stagione attiva a `date`, con:
  - **`seniority`**: lunghezza della catena `previousBookingId`, calcolata con **risalita iterativa** via
    query Prisma ripetute (non una singola query SQL raw/CTE ricorsiva — scelta deliberata per restare
    RLS-safe con Prisma Client puro, coerente con l'assenza di `$queryRaw` nel resto della codebase;
    rivista esplicitamente in `35703db` dopo review che aveva inizialmente proposto una CTE).
  - **`renewed`**: booleano, true se esiste già una prenotazione successiva che punta a questa come
    `previousBookingId` (evita di riproporre "Rinnova" su un abbonamento già rinnovato).
- **`priceAndWrite`** (privato, `BookingsService`): unica fonte del percorso "prezza + scrivi" condiviso
  da `create()` e da `renew()` — nessuna duplicazione della logica di pricing/scrittura tra i due
  endpoint.

### Contratti (`@coralyn/contracts`) — additivo, non breaking

- **`RenewBookingInput`**: nuovo input (data destinazione per la risoluzione della stagione).
- **`SubscriptionListItemDTO`**: nuovo DTO per l'elenco abbonati (`seniority`, `renewed`, più i campi
  booking già noti).
- **`BookingDTO.previousBookingId`**: campo già presente nello schema/DTO ma **ora effettivamente
  valorizzato** a runtime dal path di rinnovo (nessuna modifica di forma del DTO, solo semantica).
- Nessuna rottura di compatibilità: tutti i campi nuovi sono aggiuntivi.

### Frontend (`apps/web-staff`)

- Nuova vista **`/renewals`** ("Rinnovi"): elenco abbonati della stagione con colonna anzianità e stato
  "Rinnovato"/azione "Rinnova"; composable **`useRenewals`** (query abbonati + mutation di rinnovo);
  voce di navigazione in sidebar.

### Seed

- `apps/api/prisma/seed.ts`: aggiunta una **2ª stagione 2027** (`Estate 2027`, `2027-05-01`→`2027-09-30`)
  con listino proprio (`Pricing` dedicato, `Rate` base `price=30`/`unit=day`, `Rate` `type=subscription`
  `price=850`/`unit=period` — prezzo volutamente diverso dagli 800 della stagione 2026 seedata in A4.1,
  per rendere visibile a UI il ricalcolo del rinnovo). Applicata a `coralyn_dev` con `prisma db seed`
  (idempotente, upsert).

---

## 2. Confini NON toccati (fuori scope, per design)

- **Prelazione automatica** ([D-011](../architecture/deferred.md)): il rinnovo è un'azione manuale
  scelta dallo staff dalla vista Rinnovi, nessuna riserva automatica del posto per la stagione successiva.
- **Cabine/servizi** ([D-012](../architecture/deferred.md)): non toccati.
- **Sospensione/cessione/disdetta abbonamento** ([D-013](../architecture/deferred.md)): non toccati.
- **Notifiche** ([D-006](../architecture/deferred.md)): nessun avviso automatico allo staff/cliente per i
  rinnovi in scadenza.
- **Editor CRUD del listino** ([D-032](../architecture/deferred.md)): resta rimandato; il listino 2027 è
  seeded, non editabile da UI.
- **Pricing multi-stagione** ([D-033](../architecture/deferred.md)): invariato da A4.1.
- **Direzione temporale del rinnovo NON enforced**: il server verifica solo che la stagione destinazione
  sia **diversa** da quella della sorgente (422 se uguale), non che sia *successiva* cronologicamente.
  Rinnovare "all'indietro" (verso una stagione già passata, purché diversa da quella sorgente) è
  tecnicamente permesso dal backend attuale — nessun caso d'uso reale lo richiede, tracciato come nota
  di design, non come debito bloccante.
- **Nessuna migrazione**: schema Prisma, engine di pricing, proiezione mappa invariati in questa slice.

---

## 3. Gotcha riconfermati in questa slice

- **`ValidationPipe({ whitelist: true })`** scarta silenziosamente i campi non dichiarati nel DTO: anche
  per `RenewBookingInput` i campi vanno dichiarati esplicitamente nel DTO NestJS (non solo nell'interfaccia
  contracts) — pattern ricorrente da A4.1.
- **DB su porta 5433** (non 5432): Postgres in Docker, `coralyn_dev`/`coralyn_test`.
- **`prisma/seed.ts` gira con `prisma db seed`** (usa lo script `prisma.seed` di `apps/api/package.json`);
  invocare `ts-node prisma/seed.ts` direttamente non esegue il `main` — usare sempre `prisma db seed`.
- Dopo modifiche BE: **ricostruire l'immagine Docker `api`** prima di una verifica live
  (`docker compose --profile full up -d --build api`).
- Dopo modifiche ai contratti: **pulire `apps/web-staff/node_modules/.vite`** (cache stale del pacchetto
  `@coralyn/contracts`).
- **`corepack pnpm`** (pinato 11.9.0) per tutti i comandi workspace.
- **Fix MSW dev-tooling non committata**: il working tree ha modifiche non committate a
  `apps/web-staff/src/main.ts`, `apps/web-staff/src/mocks/handlers.ts`, `apps/web-staff/vite.config.ts`
  (modificati) e `apps/web-staff/src/mocks/browser.ts` +
  `apps/web-staff/public/mockServiceWorker.js` (cancellati). Sono **intenzionalmente lasciate fuori** da
  questo commit (non fanno parte di A4.2, sono tooling MSW per lo sviluppo locale) — **non toccarle** né
  includerle in futuri commit senza istruzione esplicita.

---

## 4. Test — conteggi REALI (DoD, sessione 2026-07-01)

Tutti i comandi seguenti sono stati eseguiti e sono risultati **verdi**:

```
corepack pnpm -r build        → verde (tutti i 5 workspace, incl. apps/web-staff vite build;
                                  warning innocui "PURE annotation" di rolldown su @vueuse/core,
                                  pre-esistenti, non bloccanti)
corepack pnpm eslint .        → verde (nessun errore/warning)
corepack pnpm --filter @coralyn/ui-kit test      → 7 file, 14 test PASSED
corepack pnpm --filter @coralyn/web-staff test   → 19 file, 47 test PASSED
corepack pnpm --filter @coralyn/api test         → 13 suite, 68 test PASSED
corepack pnpm --filter @coralyn/api test:e2e     → 5 suite, 73 test PASSED
```

| Suite | Conteggio reale | Target design spec (§10) |
|---|---|---|
| ui-kit | **14** | 14 |
| web-staff | **47** | ≥47 |
| api unit | **68** | ≥68 |
| api e2e (totale, 5 suite) | **73** | ≥73 |

Nessuna regressione rispetto alle slice precedenti (A1→A4.1); i conteggi sono **pari o superiori** ai
target del design spec A4.2.

---

## 5. Verifica live UI (Docker) — NON eseguita in questa sessione, da fare a mano

Come da istruzione, la verifica manuale Docker/UI è **saltata** in questa sessione ed è lasciata
all'umano. Passi consigliati:

1. `docker compose --profile full up -d --build api` (ricostruire l'immagine `api` con le modifiche
   Tasks 1-4 prima di qualunque verifica live — l'immagine attuale potrebbe essere quella pre-A4.2).
2. Login staff: `admin@coralyn.dev` / `coralyn-admin-8473`.
3. Creare (o usare una esistente) una sottoscrizione 2026 (`type=subscription`, stagione Estate 2026).
4. Aprire la vista **Rinnovi**, individuare l'abbonato, impostare una data target nella stagione 2027,
   cliccare **Rinnova**.
5. Verificare: nuova prenotazione 2027 creata a **€ 850** (nuovo listino, non 800); la riga sorgente 2026
   passa a stato **"Rinnovato"**; sulla mappa, il giorno nella stagione 2027 per quell'ombrellone/fascia
   mostra lo stato **`season`** (proiezione mappa invariata, solo verificata).

---

## 6. Prossimo slice

Da [deferred.md](../architecture/deferred.md) e dal §6 dell'handoff A4.1, l'incremento A4 è ora
**COMPLETO** (giornaliere → A1; periodiche/abbonamenti → A4.1; rinnovo/anzianità → A4.2). Opzioni per il
prossimo slice, non bloccanti l'una sull'altra:

- **[D-032] Editor CRUD del listino**: oggi il listino resta seeded (nessuna UI per creare/modificare
  `Package`/`Season`/`Pricing`/`Rate`); sarebbe il naturale completamento operativo prima di andare in
  produzione con clienti reali.
- **[D-011] Prelazione automatica**: riserva del posto per la stagione successiva prima che scada la
  finestra di rinnovo, con eventuale notifica ([D-006](../architecture/deferred.md)) allo staff/cliente.

Prossimo numero ADR libero: **0033**.
