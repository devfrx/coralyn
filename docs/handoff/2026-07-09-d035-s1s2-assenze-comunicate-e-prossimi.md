# Handoff — D-035 S1+S2 (assenze comunicate, lato operatore) mergiata+pushata · prossimo: S3/S4 canale cliente

> **Data:** 2026-07-09 · **Autore sessione:** agente D-035 S1+S2.
> **TL;DR:** la prima sotto-slice del **modulo D-035** — **consenso "assenze comunicate" + release registrata
> dall'operatore + rivendita** — è **implementata, revisionata (whole-branch opus Ready-to-merge), LIVE-verificata
> su Docker, mergiata FF e PUSHATA su `origin/main`** (`e4dc9e1`). D-035 **NON è chiusa**: restano **S3** (auth
> cliente) e **S4** (PWA/QR). Registro autoritativo: [`deferred.md`](../architecture/deferred.md). Metodo:
> **[ADR-0009]** + [ADR-0002].

---

## 1. Stato `git` & baseline (post-merge+push)

- **`main` = `origin/main` = `e4dc9e1`** (allineati, 0 divergenza). D-035 S1+S2 = 11 commit FF sopra il precedente
  `815143e` (spec+piano, che erano già su main). Branch di lavoro `feat/absence-communicated-releases`
  **eliminato** (mergiato).
- **Baseline da NON regredire** (LIVE su `main`): api unit **227** · api e2e **289** (`--runInBand`) ·
  web-staff **364** · ui-kit **111** · web-platform **16** · typecheck (api `tsc` + `vue-tsc -b`) pulito.
  (Erano 223/273/348 pre-D-035 — solo aggiunte, zero regressioni.)
- All'avvio prossima sessione: `git fetch --all --prune`, poi `git checkout main` e **ff** (il locale su zagor si
  apre spesso stale — vedi [[coralyn-machine-sync]]).
- **Nota DB dev:** lo stato demo della verifica LIVE è stato **ripulito** (release/consensi/rivendita rimossi,
  coverage ripristinata). `coralyn_dev` è pulito.

## 2. Cosa è stato fatto (D-035 S1+S2 — lato operatore)

L'operatore (1) cattura un **consenso "assenze comunicate"** revocabile sull'abbonamento e (2) registra una
**release** per `(abbonamento, giorno)` che scava un **buco a giorno singolo** in `BookingCoverage`, aprendo la
**rivendita** di quel posto — **senza toccare la cassa né lo span dell'abbonato**. La fonte della release qui è
**l'operatore che registra la segnalazione esplicita del cliente** (telefono/SMS); il canale self-service è S4.
Nuovo **[ADR-0048]**.

- **Modello dati:** campo `Booking.absenceConsentAt` (nullable, stato consenso corrente) + nuova child
  **`AbsenceRelease`** (RLS ENABLE+FORCE + policy `tenant_isolation`, pura storia; FK Booking `CASCADE`,
  Establishment `RESTRICT`; **no `createdBy`** → audit attore in D-047; enum `source` `operator`/`customer`,
  default `operator`, predisposto per S4). Migration `…_absence_release` applicata a **dev + test**.
- **Semantica economica (il cuore di ADR-0048):** *compensazione = rinuncia al **diritto**, non mancato **uso***.
  La release **non** tocca lo span né la cassa: `Booking.amountCollected`/`refundedAmount` **INTATTI** (a
  differenza di disdetta/sospensione = rimborso, e cessione = movimento netto). Il valore recuperato vive
  **interamente** sulla prenotazione giornaliera di **rivendita** (indipendente, flusso esistente, incasso a sé).
- **API (tutti `admin-only`):** `PATCH /bookings/:id/absence-consent` `{consent}` (grant/revoke idempotente) ·
  `POST /bookings/:id/absence-releases` `{date, reason?}` (carve giorno-singolo = mirror del carve-chiuso
  sospensione; guardie: **422** `NO_CONSENT`/`BAD_DATE`/`PAST_DATE`/**`NO_COVERAGE`** [422 come la sospensione],
  **409** `ALREADY_RELEASED`) · `POST /bookings/:id/absence-releases/:rid/cancel` (re-cover se non rivenduto;
  **409** `RESOLD` se già rivenduto → vincolante; **409** `ALREADY_CANCELED`). La rivendita **non** ha endpoint
  dedicato (flusso giornaliero esistente).
- **Projection:** `CustomerBookingDTO.absenceConsentAt` + `.absenceReleases[]` con **`resold`** derivato
  (coverage confermata di altra booking su ombrellone+fascia+data). `BookingDTO` **invariato**.
- **FE (web-staff):** `AbsenceReleaseModal` (date-picker `[max(oggi,start), end]`, guardia client "già
  registrata", motivo); in `CustomerSubscriptionsCard` azione consenso (`Button`+`ConfirmDialog`, "Attiva/Revoca
  assenze") + "Segnala assenza" (solo se consenso attivo) + sezione release (stati attiva/rivenduta/annullata,
  Annulla se lecito); wiring in `CustomerDetailView`; hook `useSetAbsenceConsent`/`useReleaseAbsence`/
  `useCancelAbsenceRelease` (invalidano la Scheda). Consenso/annullo NON-quiet → l'errore server affiora nel
  toast globale (fix M1, vedi §3).
- **Design docs ([ADR-0009]):** [`data-model.md`](../design/data-model.md) (ER += `AbsenceRelease` +
  `Booking.absenceConsentAt`), [`flows.md`](../design/flows.md) (§7 flusso consenso→release→carve→rivendita),
  mockup [`absence-release-modal.html`](../design/mockups/absence-release-modal.html).
- **Verifica LIVE (Docker `--profile full`, Postgres reale + auth reale):** happy (consenso→release→buco→rivendita
  201→resold=true; **cassa 600/0 INVARIATA end-to-end**) + annullo-se-non-rivenduto (200 + re-cover 409) +
  annullo-rivenduta (409 RESOLD) + tutte le guardie (NO_CONSENT/PAST_DATE 422, ALREADY_RELEASED 409, NO_COVERAGE
  422). `403` staff coperto dagli e2e (token reale). ✔

### Debito residuo (Minor, non bloccanti — dalla whole-branch review, tutti ok-to-defer)
Nessun unique DB su `(bookingId, date)` release attiva (enforced in-app `ALREADY_RELEASED`, come la sospensione
non ha unique per open-suspension); guardia client "già registrata" nel modale non unit-testata (il 409 server è
l'autorità, ed è testato); date-test 2026 hardcoded (convenzione repo pre-esistente, time-bomb); nessun view-spec
di wiring (convenzione file: neanche suspend/transfer li hanno); `CustomerSubscriptionsCard` cresciuta (ora 5
azioni admin + sezioni — territorio refactor **D-040**).

## 3. GOTCHA / lezioni di questa slice

- **NON esiste `bookings.service.spec.ts`** né infrastruttura mock-tx: i metodi service che usano `tx` si
  verificano via **e2e** (test DB reale); solo gli helper **puri** hanno unit spec (`*.payment.spec.ts`,
  `*.projection.spec.ts`). Il piano assumeva unit spec del service → **override a e2e** in fase di esecuzione
  (stessa "PLAN REVISION" già vista nella cessione). Per S2 non c'era math pura da estrarre (il carve è tx-bound).
- **`apps/api` non ha script `typecheck`**: usa `cd apps/api && pnpm exec tsc -p tsconfig.json --noEmit`.
  (`web-staff` ha `typecheck` = `vue-tsc -b`; `contracts` = `build`.)
- **`NO_COVERAGE` = 422** (non 409): allinea al precedente della sospensione (`bookings.service.ts`). La spec
  inizialmente diceva 409 — corretto in review (un `if` mancante rendeva 422 il fallback; il 422 è quello giusto).
- **Azioni FE dirette (senza modale)** = usa `.mutate()` (non `.mutateAsync` senza `.catch`, che genera unhandled
  rejection) e lascia l'hook **non-quiet** così l'errore server appare nel toast globale. (`useReleaseAbsence`
  resta quiet perché la modale mostra l'errore inline.) Questo è il fix M1 (commit `e4dc9e1`).
- Confermati: **pnpm mai npm** ([[coralyn-pnpm-not-npm]]); rebuild `@coralyn/contracts` dopo modifica src; `migrate
  deploy` a **dev E test** (env alla radice, `dotenv-cli`), mai `db push`; e2e ts-jest type-checka → `--runInBand`;
  nuove tabelle tenant = RLS ENABLE+FORCE+policy `tenant_isolation`; rotte sotto `/api`; occupazione su
  `BookingCoverage`, span/diritti/titolarità su `Booking`; il gate FE reale è `vue-tsc -b`, non `--noEmit`.

## 4. Priorità di dominio — cosa fare dopo (D-035 S3 → S4)

Con S1+S2 chiuse, il **canale cliente self-service** resta da costruire. Decomposizione **già concordata** con
l'utente (2026-07-09); prossimo ADR libero **0049**, prossimo D libero **D-049**.

1. **S3 — auth/identità del cliente.** Il `Customer` (oggi **senza login**, solo anagrafica: `firstName`/
   `lastName`/`phone`/`email`/`notes`, anonimizzabile GDPR — **non** è uno `User`, non ha `passwordHash`) deve
   autenticarsi al **suo** canale senza essere uno `User`: magic-link/OTP (telefono/email → Mailpit in dev) o
   token-QR per abbonamento. Qui atterrano le security-gated **[D-026]** (refresh/revoca token) · **[D-027]**
   (rate-limit login) · **[D-028]** (RLS su `User`/identità) · **[D-029]** (login a tempo costante).
   **⚠️ Forza una decisione di TENANT-ROUTING PUBBLICO che oggi NON esiste:** web-staff/web-platform risolvono il
   tenant dal **JWT** dopo il login ([ADR-0024]); ma il bagnante arriva **prima** di autenticarsi → deve atterrare
   sul tenant giusto senza un token. Tre opzioni: **sottodominio** (`lidosole.coralyn.it`), **path**
   (`coralyn.it/l/lido-sole`), o **QR che incapsula tenant+abbonamento** (spesso il più naturale: il cliente
   scansiona e atterra già sul suo abbonamento). È un frammento di **[D-002]** (infra SaaS: signup/billing/domini,
   [ADR-0010]) tirato dentro D-035 — **solo** per il canale cliente, non per operatore/superuser.
2. **S4 — PWA/QR self-service release.** Il cliente autenticato (S3) vede il suo abbonamento, sceglie il giorno e
   invia la release — **riusa la meccanica S2** (`AbsenceRelease.source='customer'` è **già predisposto**,
   additivo zero-retrofit sulla stessa tabella). Qui atterra **[D-037]** (gestione globale `401` nel data-layer
   FE). È la **quarta superficie** dell'app (nuovo scaffold Vite/PWA, come `web-platform` è la terza — [ADR-0041]).
3. **Invariante non negoziabile (regge già in S1+S2):** rivendita **solo** su release esplicita registrata nel
   sistema — **nessuna presunzione d'assenza**. S3/S4 spostano solo la *fonte* della segnalazione dall'operatore
   al cliente stesso.

**Primo passo per S3:** gate review + (probabile) brainstorming per la scelta di tenant-routing pubblico +
strategia auth cliente (è la decisione strutturale più pesante del modulo). Backlog non-D-035 (valutare con
l'utente): D-036 report avanzato · D-012 cabine (**⚠️ utente lo ritiene poco utile — NON partire senza ok**) ·
refactor D-040/038 · audit D-047. Dettaglio in [`deferred.md`](../architecture/deferred.md).

## 5. Metodo (replicare)
Gate review spec con l'utente → (**brainstorming** se modulo/decisione strutturale) → **writing-plans** (TDD) →
**subagent-driven** (implementer per task, modello per costo/rischio; review a **due stadi** per task + whole-branch
**opus**; fix solo Crit/Imp, Minor tracciati nel ledger `.superpowers/sdd/progress.md`) → **verifica LIVE su Docker**
→ **presentare e attendere OK esplicito** per il merge FF **e per il push** (entrambi fatti stavolta con ok utente).

## 6. Riferimenti
- Registro [`deferred.md`](../architecture/deferred.md) · Rubric [ADR-0002] · Design docs [ADR-0009] ·
  **Assenze comunicate [ADR-0048]** · Coverage [ADR-0046] · Incasso [ADR-0011] · Auth [ADR-0024] ·
  Isolamento multi-tenant [ADR-0010] · App platform dedicata [ADR-0041].
- D-035 S1+S2: [spec](../superpowers/specs/2026-07-09-assenze-comunicate-release-operatore-design.md) ·
  [piano](../superpowers/plans/2026-07-09-assenze-comunicate-release-operatore.md).
- Handoff precedente (D-013 cessione): [2026-07-08-d013-cessione-chiusa-e-prossimi.md](2026-07-08-d013-cessione-chiusa-e-prossimi.md).

[ADR-0002]: ../architecture/decisions/0002-decision-rubric.md
[ADR-0009]: ../architecture/decisions/0009-documentazione-di-design.md
[ADR-0010]: ../architecture/decisions/0010-isolamento-multi-tenant.md
[ADR-0011]: ../architecture/decisions/0011-incasso-base-nel-core.md
[ADR-0024]: ../architecture/decisions/0024-strategia-auth.md
[ADR-0041]: ../architecture/decisions/0041-app-frontend-dedicata-platform.md
[ADR-0046]: ../architecture/decisions/0046-occupazione-a-intervalli-coverage.md
[ADR-0048]: ../architecture/decisions/0048-assenze-comunicate-release-occupazione.md
[D-002]: ../architecture/deferred.md
[D-026]: ../architecture/deferred.md
[D-027]: ../architecture/deferred.md
[D-028]: ../architecture/deferred.md
[D-029]: ../architecture/deferred.md
[D-037]: ../architecture/deferred.md
