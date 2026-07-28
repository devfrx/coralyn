# Coralyn — Gestionale Lidi Balneari

> **Coralyn** è il brand che ho dato al progetto (scope dei package `@coralyn/*`, identificatori
> infra `coralyn_*`). Ho adottato il nome definitivo con
> [ADR-0029](docs/architecture/decisions/0029-brand-coralyn.md), che risolve la decisione
> che avevo rimandato in D-017; prima il repo usava il *codename* provvisorio **Driftly**.

Sto costruendo un gestionale **SaaS** per la gestione di **lidi balneari** (stabilimenti balneari):
mappa ombrelloni, prenotazioni e abbonamenti, cassa, e — in prospettiva — booking
online per il cliente finale.

## Setup locale

Prerequisiti: **Node ≥ 22**, **pnpm 11.9** (via `corepack enable`), **Docker**.

```bash
corepack enable
pnpm install
cp .env.example .env          # DATABASE_URL punta a localhost:5432, come il compose
cp .env.test.example .env.test
docker compose up -d db mailpit
pnpm --filter @coralyn/api exec prisma migrate deploy
pnpm --filter @coralyn/api exec prisma db seed
pnpm run verify               # lint + typecheck + unit
```

Dev server: `pnpm --filter @coralyn/web-staff dev` (5173), `@coralyn/web-platform` (5174),
`@coralyn/web-customer` (5175) — le tengo su porte **fisse** (`strictPort`), e `pnpm --filter @coralyn/api start:dev`
per l'API (3000). Mailpit espone la posta di sviluppo su <http://localhost:8025>.

Le **e2e dell'API** richiedono un Postgres reale e le faccio girare a parte, sul database `coralyn_test`:
`pnpm --filter @coralyn/api test:e2e` (applica prima le migration **anche** su quel database).
Con `docker compose --profile full up -d` avvio l'intero stack containerizzato (8080/8081/8082).

> ⚠️ Il DB è sulla **5432**, la porta che `docker-compose.yml` pubblica. Se trovi la 5433 citata in
> un handoff datato, è la mappatura di un `docker-compose.override.yml` **gitignorato** presente su
> un'altra macchina: non è mai stata la configurazione del repo.

## Stato

**Backend**: `apps/api` (NestJS + Prisma + Postgres), dove ho realizzato l'isolamento multi-tenant **RLS FORCE** su 22
tabelle e l'autorizzazione **fail-closed** a permessi ([ADR-0057](docs/architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)).
I moduli che ho scritto: identità e auth, mappa, prenotazioni (giornaliere, periodiche, abbonamenti; rinnovo,
prelazione, sospensione, cessione, assenze comunicate), catalogo e pricing, clienti, struttura dello
stabilimento, noleggi, report, canale cliente self-service, informativa privacy e piattaforma.

**Frontend**: tre app Vue — `web-staff` (operatore), `web-platform` (console superuser),
`web-customer` (PWA del bagnante) — che ho costruito su `@coralyn/ui-kit`, `@coralyn/data-layer`, `@coralyn/contracts`
e `@coralyn/legal`.

**Gate**: `pnpm run verify` (lint + typecheck + unit) e le e2e dell'API, che tengo entrambi in CI su `main` e
sulle PR ([`.github/workflows/verify.yml`](.github/workflows/verify.yml)).

> ⚠️ **Ho riscritto questa sezione il 2026-07-26** (Fase H dell'audit). Diceva
> «A4.2 rinnovo + anzianità implementati → incremento A4 COMPLETO» e indicava come *prossimi passi*
> l'editor del listino ([D-032](docs/architecture/deferred.md)), la prelazione automatica
> ([D-011](docs/architecture/deferred.md)) e la gestione utenti staff
> ([D-025](docs/architecture/deferred.md)): le **prime due le avevo già implementate** da settimane. La
> narrazione slice-per-slice che occupava questa sezione era cresciuta per accumulo e descriveva al
> presente uno stato superato. La storia la tengo dove le compete — negli
> [ADR](docs/architecture/decisions/) e negli [handoff](docs/handoff/) — e lo stato corrente
> nell'[audit](docs/audit/) e in [deferred.md](docs/architecture/deferred.md).

<details>
<summary>Narrazione storica delle slice A1–A4.2 (superata, la conservo per riferimento)</summary>

**Backend** — ho implementato Core Foundation
(Piano 1), Incremento 1 (scheda cliente), **modulo identità & auth** (login JWT,
`JwtAuthGuard` globale, RLS Utente), **modulo mappa** (modello + lettura) e **prenotazioni**
(giornaliere slice A1; periodiche e abbonamenti slice A4.1; rinnovo e anzianità slice A4.2):
API `/api/customers` (CRUD), `/api/auth` (login/me), `/api/map` (lettura della struttura
ombrelloni per data con stati reali) e `/api/bookings` (crea/elenca/cancella prenotazioni
giornaliere/periodiche/abbonamenti), più la **registrazione incasso base** (slice A2:
`PATCH /api/bookings/:id/payment`,
stato di pagamento `unpaid`/`partial`/`paid` derivato server-side, ADR-0011), con isolamento
multi-tenant RLS e migrazioni Prisma. Le 5 entità mappa
(`Settore`/`Fila`/`Ombrellone`/`Tipologia`/`Fascia`) sono tenant-scoped con RLS e ho seedato una struttura
demo.

**Slice A3.1 — pricing engine** implementato: catalogo
(`Package`/`Season`/`Pricing`/`Rate`, tenant-scoped con RLS) + **engine puro a precedenze
esplicite** (`resolvePrice`, precedenza periodo › fila › settore › pacchetto › fascia › tipo,
[ADR-0032](docs/architecture/decisions/0032-pricing-engine-precedenza.md)) + **auto-pricing su
`POST /api/bookings`** (il server calcola il `totalPrice`; niente più prezzo digitato a mano) +
endpoint **`GET /api/bookings/quote`** (preventivo prezzo prima di confermare); il listino l'ho
**seedato** (l'editor CRUD l'ho rinviato, [D-032](docs/architecture/deferred.md)).

**Slice A3.2 — selettore Pacchetto** implementato (completa A3): endpoint read-only
**`GET /api/packages`** (lista pacchetti del tenant), il modale "Nuova prenotazione" fa scegliere il
`Package` e **ricalcola il prezzo** al cambio (re-quote), la create **salva** il `packageId`
(pre-validato nel tenant; pacchetto **opzionale**, `null` = tariffa base) e la `BookingsView` mostra la
colonna **Pacchetto**.

**Slice A4.1 — periodiche + abbonamenti** implementato: `POST /api/bookings` crea anche
`type=periodic` (intervallo `startDate`/`endDate` esplicito) e `type=subscription` (durata =
Stagione attiva, **risolta e imposta dal server**: il client non specifica la fine); il pricing
**si estende all'intervallo reale** (`unit=day × giorni` o `unit=period` a forfait) e l'anti-overlap
lo esercito ora su intervalli di date, non solo sul singolo giorno; la mappa proietta
`periodic→booked` e `subscription→season` (proiezione già generale, l'ho lasciata invariata); il modale "Nuova
prenotazione" ha un **selettore Tipo** (Giornaliera/Periodica/Abbonamento) con campo "Fine periodo"
per le periodiche e re-quote al cambio; la `BookingsView` mostra le colonne **Tipo** e **Periodo**
(intervallo date). Nessuna migrazione: schema, engine e mappa erano già generali su intervalli.

**Slice A4.2 — rinnovo + anzianità** implementato (completa l'incremento A4): endpoint
**`POST /api/bookings/:id/renew`** copia customer/ombrellone/fascia/pacchetto dalla prenotazione
sorgente (dev'essere un abbonamento confermato) e crea una nuova prenotazione nella stagione
destinazione, riprezzata sul nuovo listino (`priceAndWrite` condiviso con `create`) e collegata
via `previousBookingId` (doppio rinnovo → 409; stagione destinazione uguale alla sorgente → 422);
endpoint **`GET /api/bookings/subscriptions?date=`** elenca gli abbonati della stagione con
**anzianità** (derivata dalla lunghezza della catena dei rinnovi, risalita iterativa via Prisma) e
flag **rinnovato**; ho aggiunto la nuova vista **Rinnovi** in `web-staff`. Nessuna migrazione: schema invariato.

**Frontend** — ho completato e integrato il redesign **Coralyn**
(app-shell, ui-kit, tutte le viste); **login reale end-to-end** (`LoginView` → `/api/auth/login`, token Bearer
persistito, reidratazione via `/me`, logout), scheda cliente e **`MapView`** sul backend reale
(le ho sganciate dal mock MSW); il modale "Nuova prenotazione" e il drawer della `MapView` li ho
collegati al backend reale (prenotazione giornaliera/periodica/abbonamento, selezione cliente, slot;
il **prezzo è calcolato dal server** e mostrato in sola lettura nel modale, slice A3.1/A4.1);
la **`BookingsView`** mostra le prenotazioni reali del giorno con stato di pagamento, filtro e
azione "Registra incasso" (slice A2), e dal drawer della `MapView` si può registrare l'incasso.
La proiezione mappa (`projectDayMap`) l'ho resa slot-aware e riflette gli stati reali
(`daily`/`booked`/`season`) dalle prenotazioni confermate.

Il provisioning è **fornitore + inviti**
([ADR-0028](docs/architecture/decisions/0028-provisioning-tenant.md)):
la pagina `/registrazione` è informativa ("attivazione su invito"), non self-service.
Containerizzazione locale via Docker Compose.

</details>

## Documentazione

- [Architettura (vista d'insieme)](docs/architecture/README.md)
- [Decisioni architetturali (ADR)](docs/architecture/decisions/)
- [Decisioni rimandate](docs/architecture/deferred.md)
- [Glossario del dominio](docs/architecture/glossary.md)
- [Spec di progettazione](docs/specs/)
- [Design (modello dati, flussi, mockup)](docs/design/)
- [Piani di implementazione](docs/plans/)
- [Handoff di sessione](docs/handoff/)

## Come lavoro

Traccio ogni decisione rilevante come ADR e la peso secondo la
[decision rubric](docs/architecture/decisions/0002-decision-rubric.md):
professionalità, convenzioni, modularità, zero debito.
