# Handoff — D-013 CESSIONE mergiata+pushata · D-013 CHIUSA · prossime implementazioni

> **Data:** 2026-07-08 · **Autore sessione:** agente D-013 cessione/subentro (ultima sotto-slice).
> **TL;DR:** la **cessione/subentro** dell'abbonamento è **implementata, revisionata (whole-branch opus
> Ready-to-merge), LIVE-verificata su Docker, mergiata FF e PUSHATA su `origin/main`** (`9bf2322`). Con
> disdetta + sospensione + fondazione coverage, **D-013 è interamente CHIUSA**. Registro autoritativo:
> [`deferred.md`](../architecture/deferred.md). Metodo: **[ADR-0009]** + [ADR-0002].

---

## 1. Stato `git` & baseline (post-merge+push)

- **`main` = `origin/main` = `9bf2322`** (allineati, 0 divergenza). La cessione è 20 commit FF sopra il precedente
  `1fef6ff` (sospensione); il push ha portato su origin sia i 15 commit sospensione **non ancora pushati** sia i
  20 della cessione (`133cfc7..9bf2322`). Branch di lavoro `feat/subscription-cession` **eliminato** (mergiato).
- **Baseline da NON regredire** (LIVE su `main`): api unit **223** · api e2e **273** (`--runInBand`) ·
  web-staff **348** · ui-kit **111** · web-platform **16** · typecheck (api + `vue-tsc -b`) pulito.
  (Erano 213/264/332 pre-cessione — solo aggiunte, zero regressioni.)
- All'avvio prossima sessione: `git fetch --all --prune`, poi `git checkout main` e **ff** (il locale su zagor si
  apre spesso stale — vedi [[coralyn-machine-sync]]).

## 2. Cosa è stato fatto (D-013 cessione/subentro)

Passaggio di **titolarità** di un abbonamento da A (cedente) a B (subentrante) sulla **stessa** `Booking`
(`customerId` A→B) — **NON** disdetta+nuova prenotazione: span, ombrellone, **seniority** (catena
`previousBookingId`) e **prelazione** sono agganciati alla `Booking` e seguono B. **Occupazione
`BookingCoverage` non toccata** (l'ombrellone resta occupato con continuità). Nuovo **[ADR-0047]**.

- **Modello dati:** nuova child **`BookingTransfer`** (RLS ENABLE+FORCE + policy `tenant_isolation`, pura
  storia; FK Booking `CASCADE`, Customer×2 + Establishment `RESTRICT`; **no `createdBy`** → audit attore in
  D-047). Migration `…_booking_transfer` applicata a **dev + test**.
- **Incasso senza debito (il cuore di ADR-0047):** riconciliazione a **movimento netto** su `Booking.amountCollected`
  (`− refundToPrevious + collectedFromNew`, clamp `[0, totalPrice]`, `paymentStatus` ricalcolato). **`refundedAmount`
  MAI toccato** dalla cessione (è un trasferimento, non una perdita di ricavo come disdetta/sospensione) → `netto =
  amountCollected − refundedAmount` resta **fonte unica** e intatto. La matematica vive in un **helper puro**
  `cession.payment.ts::reconcileCessionPayment` (unit-testato; mirror di `booking.payment.ts::resolvePayment`).
- **API:** `POST /bookings/:id/transfer` **admin-only** (invarianti: subscription/confirmed/non-disdetto/**no
  sospensione aperta→409**/subentrante esiste-tenant-non-anon/≠titolare/`effectiveDate∈[start,end]`/bound cassa →
  422/409/404) + `GET /customers/:id/ceded-subscriptions` (staff, tenant-scoped). `CustomerBookingDTO.transfers[]`
  in projection.
- **FE (web-staff):** `cessionRefund.ts` (pro-rata residuo `[effectiveDate,end]`), hook
  `useTransferSubscription` (doppia invalidazione bookings+ceded) + `useCededSubscriptions`,
  `TransferSubscriptionModal` (selettore subentrante che esclude titolare+anonimizzati, due importi pre-compilati
  al residuo + "regolamento privato", motivo), bottone **"Cedi"** + sezione **"Cessioni effettuate"** in
  `CustomerSubscriptionsCard`, wiring in `CustomerDetailView`, handler MSW.
- **Contracts:** `TransferDTO`, `CededSubscriptionDTO`, `TransferSubscriptionInput`,
  `CustomerBookingDTO.transfers?` (additivi; `BookingDTO` invariato).
- **Design docs ([ADR-0009]):** [`data-model.md`](../design/data-model.md) (ER += `BookingTransfer`,
  `customerId` mutabile via cessione), [`flows.md`](../design/flows.md) (§6 flusso cessione), mockup
  [`subscription-transfer-modal.html`](../design/mockups/subscription-transfer-modal.html).
- **Verifica LIVE (Docker `--profile full`, Postgres reale + auth reale):** happy path (customerId A→B,
  amountCollected 600→600, **refundedAmount 0→0**, transfers[] su B, ceduti su A, occupazione invariata) + tutte
  e 5 le guardie (same-holder 422, OVER_TOTAL 422, bad-date 422, sospensione-aperta 409, staff 403). ✔

### Debito residuo (Minor, non bloccanti — dalla whole-branch review, tutti ok-to-defer)
`prisma format` churn in `schema.prisma`; projection spec non asserisce `createdAt` (parità); `reconcileCessionPayment`
total-0 → `unpaid` (nessun abbonamento a prezzo 0); esclusione-anonimizzati nel selettore implementata ma non
test-coperta; card nasconde "· rimborso €0" quando 0 (cosmetico). **Pre-esistente (fuori scope):** la **sospensione**
è ancora marcata "in design" in `data-model.md:338` / `flows.md:73` / mockup sospensione — merita un micro-cleanup.

## 3. GOTCHA NUOVO (imparato dalla verifica LIVE — importante per le prossime slice FE)

Il typecheck FE per-task usava **`vue-tsc --noEmit`**, che è **più debole** del build di produzione
**`vue-tsc -b`** (project references): un `.spec.ts` senza `import { describe, it, expect } from 'vitest'`
passa `vitest run` **e** `vue-tsc --noEmit`, ma **rompe** `vue-tsc -b` (beccato solo dal rebuild Docker). **Il
gate FE reale è `corepack pnpm --filter @coralyn/web-staff run typecheck` (= `vue-tsc -b --noEmit`), non
`vue-tsc --noEmit`.** Convenzione repo: **ogni** spec importa esplicitamente da `vitest`.

## 4. Priorità di dominio (CONFERMATA dall'utente) — cosa fare dopo

Con D-013 chiusa, la priorità #1 diventa **D-035**. Leggi [`deferred.md`](../architecture/deferred.md) prima di
pianificare. Prossimo ADR libero **0048**, prossimo D libero **D-049**.

1. **D-035 — Servizio clienti parallelo + "assenze comunicate"** (canale rivolto al **cliente del lido**). È un
   **MODULO**, non una slice: **primo passo = `brainstorming` per decomporlo** in sotto-spec. **Invariante di
   dominio irrinunciabile:** la rivendita del posto di un abbonato è lecita **solo su segnalazione esplicita del
   cliente** — la sospensione/cessione D-013 sono già "atti espliciti operatore↔abbonato"; D-035 aggiunge il
   **canale-cliente** della segnalazione (consenso su abbonamento, release per-fascia+giorno, PWA/QR). Riusa la
   fondazione `BookingCoverage` (carve-out per-giorno) e i pattern D-013. Le voci **security-gated**
   (D-026/027/028/029/037/041) diventano **prerequisiti DENTRO** D-035 (esposizione client-facing).
2. **Backlog** (valutare con l'utente): **D-036** report avanzato (lega occupancy% D-048 §7) · **D-012** cabine
   (⚠️ utente lo ritiene poco utile — NON partire senza suo ok) · **D-015** orari arbitrari · refactor
   **D-040/038** · audit **D-047**.

## 5. Metodo (replicare)
Gate review spec con l'utente → (**brainstorming** se modulo, D-035 lo richiede) → **writing-plans** (TDD) →
**subagent-driven** (implementer per task, modello per costo/rischio; review a **due stadi** per task + whole-branch
**opus**; fix solo Crit/Imp, Minor tracciati) → **verifica LIVE su Docker** → **presentare e attendere OK esplicito**
per il merge FF **e per il push** (entrambi fatti stavolta con ok utente).

## 6. Riferimenti
- Registro [`deferred.md`](../architecture/deferred.md) · Rubric [ADR-0002] · Design docs [ADR-0009] ·
  Cessione **[ADR-0047]** · Coverage [ADR-0046] · Incasso [ADR-0011] · Auth [ADR-0024].
- Cessione: [spec](../superpowers/specs/2026-07-08-subscription-cession-design.md) ·
  [piano](../superpowers/plans/2026-07-08-subscription-cession.md).

[ADR-0002]: ../architecture/decisions/0002-decision-rubric.md
[ADR-0009]: ../architecture/decisions/0009-documentazione-di-design.md
[ADR-0011]: ../architecture/decisions/0011-incasso-base-nel-core.md
[ADR-0024]: ../architecture/decisions/0024-strategia-auth.md
[ADR-0046]: ../architecture/decisions/0046-occupazione-a-intervalli-coverage.md
[ADR-0047]: ../architecture/decisions/0047-cessione-subentro-titolarita-incasso.md
