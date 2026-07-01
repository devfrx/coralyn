# Coralyn — Gestionale Lidi Balneari

> **Coralyn** è il brand del progetto (scope dei package `@coralyn/*`, identificatori
> infra `coralyn_*`). Il nome definitivo è stato adottato con
> [ADR-0029](docs/architecture/decisions/0029-brand-coralyn.md), che risolve la decisione
> rimandata D-017; in precedenza il repo usava il *codename* provvisorio **Driftly**.

Gestionale **SaaS** per la gestione di **lidi balneari** (stabilimenti balneari):
mappa ombrelloni, prenotazioni e abbonamenti, cassa, e — in prospettiva — booking
online per il cliente finale.

Stato: **A4.1 periodiche + abbonamenti implementate**. **Backend** — Core Foundation
(Piano 1), Incremento 1 (scheda cliente), **modulo identità & auth** (login JWT,
`JwtAuthGuard` globale, RLS Utente), **modulo mappa** (modello + lettura) e **prenotazioni**
(giornaliere slice A1; periodiche e abbonamenti slice A4.1) implementati:
API `/api/customers` (CRUD), `/api/auth` (login/me), `/api/map` (lettura della struttura
ombrelloni per data con stati reali) e `/api/bookings` (crea/elenca/cancella prenotazioni
giornaliere/periodiche/abbonamenti), più la **registrazione incasso base** (slice A2:
`PATCH /api/bookings/:id/payment`,
stato di pagamento `unpaid`/`partial`/`paid` derivato server-side, ADR-0011), con isolamento
multi-tenant RLS e migrazioni Prisma. Le 5 entità mappa
(`Settore`/`Fila`/`Ombrellone`/`Tipologia`/`Fascia`) sono tenant-scoped con RLS e una struttura
demo seedata. **Slice A3.1 — pricing engine** implementato: catalogo
(`Package`/`Season`/`Pricing`/`Rate`, tenant-scoped con RLS) + **engine puro a precedenze
esplicite** (`resolvePrice`, precedenza periodo › fila › settore › pacchetto › fascia › tipo,
[ADR-0032](docs/architecture/decisions/0032-pricing-engine-precedenza.md)) + **auto-pricing su
`POST /api/bookings`** (il server calcola il `totalPrice`; niente più prezzo digitato a mano) +
endpoint **`GET /api/bookings/quote`** (preventivo prezzo prima di confermare); listino
**seeded** (editor CRUD rinviato, [D-032](docs/architecture/deferred.md)).
**Slice A3.2 — selettore Pacchetto** implementato (completa A3): endpoint read-only
**`GET /api/packages`** (lista pacchetti del tenant), il modale "Nuova prenotazione" fa scegliere il
`Package` e **ricalcola il prezzo** al cambio (re-quote), la create **salva** il `packageId`
(pre-validato nel tenant; pacchetto **opzionale**, `null` = tariffa base) e la `BookingsView` mostra la
colonna **Pacchetto**.
**Slice A4.1 — periodiche + abbonamenti** implementato: `POST /api/bookings` crea anche
`type=periodic` (intervallo `startDate`/`endDate` esplicito) e `type=subscription` (durata =
Stagione attiva, **risolta e imposta dal server**: il client non specifica la fine); il pricing
**si estende all'intervallo reale** (`unit=day × giorni` o `unit=period` a forfait) e l'anti-overlap
è ora esercitato su intervalli di date, non solo sul singolo giorno; la mappa proietta
`periodic→booked` e `subscription→season` (proiezione già generale, invariata); il modale "Nuova
prenotazione" ha un **selettore Tipo** (Giornaliera/Periodica/Abbonamento) con campo "Fine periodo"
per le periodiche e re-quote al cambio; la `BookingsView` mostra le colonne **Tipo** e **Periodo**
(intervallo date). Nessuna migrazione: schema, engine e mappa erano già generali su intervalli.
**Frontend** — redesign **Coralyn** completato e integrato (app-shell, ui-kit,
tutte le viste); **login reale end-to-end** (`LoginView` → `/api/auth/login`, token Bearer
persistito, reidratazione via `/me`, logout), scheda cliente e **`MapView`** sul backend reale
(sganciata dal mock MSW); il modale "Nuova prenotazione" e il drawer della `MapView` sono
collegati al backend reale (prenotazione giornaliera/periodica/abbonamento, selezione cliente, slot;
il **prezzo è calcolato dal server** e mostrato in sola lettura nel modale, slice A3.1/A4.1);
la **`BookingsView`** mostra le prenotazioni reali del giorno con stato di pagamento, filtro e
azione "Registra incasso" (slice A2), e il drawer della `MapView` consente di registrare l'incasso.
La proiezione mappa (`projectDayMap`) è ora
slot-aware e riflette gli stati reali (`daily`/`booked`/`season`) dalle prenotazioni confermate.
Il provisioning è **fornitore + inviti**
([ADR-0028](docs/architecture/decisions/0028-provisioning-tenant.md)):
la pagina `/registrazione` è informativa ("attivazione su invito"), non self-service.
Containerizzazione locale via Docker Compose.
Prossimi passi: **A4.2** (rinnovo + anzianità via `previousBookingId`), **editor CRUD del listino**
([D-032](docs/architecture/deferred.md)) e **gestione utenti staff**
([D-025](docs/architecture/deferred.md)).

## Documentazione

- [Architettura (vista d'insieme)](docs/architecture/README.md)
- [Decisioni architetturali (ADR)](docs/architecture/decisions/)
- [Decisioni rimandate](docs/architecture/deferred.md)
- [Glossario del dominio](docs/architecture/glossary.md)
- [Spec di progettazione](docs/specs/)
- [Design (modello dati, flussi, mockup)](docs/design/)
- [Piani di implementazione](docs/plans/)
- [Handoff di sessione](docs/handoff/)

## Come lavoriamo

Ogni decisione rilevante è tracciata come ADR e pesata secondo la
[decision rubric](docs/architecture/decisions/0002-decision-rubric.md):
professionalità, convenzioni, modularità, zero debito.
