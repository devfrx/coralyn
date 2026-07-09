# Handoff — Hardening macchina a stati CTA abbonamento (§4.2) CHIUSO · prossimi: §4.1/§4.3/§4.b + D-035 S3/S4 + backlog D-0xx

> **Data:** 2026-07-09 · **Autore sessione:** agente hardening CTA.
> **TL;DR:** l'**audit sistematico della macchina a stati dei 7 CTA abbonamento** (i 4 di **D-013** + i 3 di
> **D-035**) — segnalato come **§4.2** nell'handoff precedente — è **implementato (7 task TDD, subagent-driven,
> review a due stadi + whole-branch opus Ready-to-merge 0/0), LIVE-verificato 8/8 su Docker (Postgres reale + JWT
> reale), mergiato FF e PUSHATO** su `origin/main` (`6211e2d`). **Nessun nuovo ADR** (correttezza additiva su
> ADR-0011/0046/0047/0048). **Restano aperti** gli altri difetti dell'handoff precedente — **§4.1** (pagina
> «Configura»), **§4.3** («da incassare» + tipo/durata prenotazione), **§4.b** (reset DB dev) — e **D-035 S3/S4**
> (canale cliente), oltre al backlog `deferred.md`. Metodo: **[ADR-0009]** (design docs versionati = DoD) +
> [ADR-0002] (rubric). Registro autoritativo: [`deferred.md`](../architecture/deferred.md).

---

## 1. Stato `git` & baseline (post-merge+push)

- **`main` = `origin/main` = `6211e2d`** (allineati, 0 divergenza). L'hardening = 9 commit FF sopra il precedente
  `72c50b7` (2 doc: spec+piano; 7 di implementazione). Branch di lavoro `feat/cta-state-machine-hardening`
  **eliminato** (mergiato).
- **Baseline da NON regredire** (LIVE su `main`): api unit **227** · api e2e **299** (`--runInBand`) ·
  web-staff **371** · ui-kit **111** · web-platform **16** · typecheck (api `tsc` + `vue-tsc -b --noEmit`) pulito.
  (Erano 227/289/364 pre-hardening — solo aggiunte: +10 e2e, +7 web-staff, zero regressioni.)
- All'avvio prossima sessione: `git fetch --all --prune`, poi `git checkout main` e **ff** (il locale su zagor si
  apre spesso stale — vedi [[coralyn-machine-sync]]).
- **Nota DB dev:** gli artefatti della verifica LIVE (5 abbonamenti demo + coverage/sospensioni/release) sono stati
  **ripuliti** (DELETE 5, figli in cascade a 0). `coralyn_dev` è pulito. Il container `coralyn-api` è stato
  **ricostruito** (`docker compose --profile full up -d --build api`) e ora gira il codice di `main`.

## 2. Cosa è stato fatto (audit macchina a stati CTA — §4.2)

I 7 CTA del ciclo abbonamento (`terminate`, `suspend`, `reactivate`, `transfer`, `setAbsenceConsent`,
`releaseAbsence`, `cancelAbsenceRelease`) erano costruiti e testati **in isolamento su un abbonamento pulito**:
solo due archi cross-famiglia erano guardati. Le **combinazioni** producevano guardie mancanti + effetti errati su
`BookingCoverage` e sulla cassa. Questa slice ha enumerato la **matrice completa stato × CTA**, deciso ogni cella e
chiuso i buchi. Spec [`2026-07-09-audit-macchina-stati-cta-abbonamento-design.md`](../superpowers/specs/2026-07-09-audit-macchina-stati-cta-abbonamento-design.md),
piano [omonimo](../superpowers/plans/2026-07-09-audit-macchina-stati-cta-abbonamento.md).

**Slice 1 — guardie di precondizione** (additive, `bookings.service.ts` + gating FE speculare):
- **D1** — `terminate` rifiuta la **sospensione aperta** → **409** «Sospensione aperta: riattiva prima di disdire»
  (mirror del guard di `transfer`).
- **D2** — `reactivate` rifiuta `terminated`/`cancelled` → **422**. Chiude il path reale
  `suspend-open → cancel (DELETE) → reactivate` (che ricopriva giorni su un abbonamento annullato).
- **D5+C2** — `releaseAbsence` e `cancelAbsenceRelease` rifiutano **OPEN_SUSPENSION** → **422**;
  `cancelAbsenceRelease` rifiuta anche `terminated`/`cancelled` → **422** (prima aveva **zero** guardie di ciclo).
- **C1** — il consenso «assenze comunicate» è **indipendente dall'occupazione**: toggle FE da `canSuspend` a
  `canToggleConsent = confirmed && !terminated` (il backend `setAbsenceConsent` era già senza guardia sospensione).
  Risolve il difetto "consenso incastrato su ON" (non revocabile durante sospensione/scadenza).

**Slice 2 — correttezza `terminate`** (delicata, TDD stretto):
- **D3** — carve **per-frammento** su `BookingCoverage` (`startDate > lastValid` → delete; `start ≤ lastValid <
  end` → clamp; altrimenti invariato). Sostituisce l'`updateMany` a tappeto che, dopo una **sospensione chiusa**
  (head+coda) o una **release attiva** (frammenti), poteva creare **range invertiti** → violazione
  `coverage_no_overlap` → **500**. Provato shrink/delete-only, nessun rischio sul constraint.
- **D4** — `refundedAmount` è ora un **ledger cumulativo**: bound sul **residuo** (`amountCollected −
  refundedAmount`) e `{ increment }` invece del SET assoluto (coerente con `suspend`/`reactivate`). Prima il SET
  **cancellava dal ledger** i rimborsi già erogati da una sospensione, e il bound su `amountCollected` consentiva
  over-refund. FE `terminationRefund.ts::suggestedRefund` clampa il suggerimento al residuo.
- **C3** — `terminate` **permesso** con una release attiva; le righe `AbsenceRelease` restano **storia** (D3
  gestisce i frammenti).

**Docs (ADR-0009 DoD):** [`flows.md §8`](../design/flows.md) — macchina a stati (`stateDiagram-v2`) + **matrice
guardie stato × CTA** (verbatim spec §5) + invarianti; JSDoc dei 4 metodi aggiornata con le guardie. **Verificato
coerente col codice** in chiusura sessione (ogni cella della matrice = throw reale nel service).

**Matrice guardie (riferimento rapido, dettaglio in `flows.md §8`):**

| Stato | terminate | reactivate | transfer | release / annulla | consenso |
|---|---|---|---|---|---|
| suspended-open | ✗ 409 OPEN_SUSPENSION (D1) | ✓ | ✗ 409 OPEN_SUSPENSION | ✗ 422 OPEN_SUSPENSION (C2) | ✓ (C1) |
| terminated | ✗ 409 ALREADY_TERMINATED | ✗ 422 TERMINATED (D2) | ✗ 422 | ✗ 422 TERMINATED (D5) | ✗ 422 |
| cancelled | ✗ 422 NOT_CONFIRMED | ✗ 422 NOT_CONFIRMED (D2) | ✗ 422 | ✗ 422 NOT_CONFIRMED (D5) | ✗ 422 |

**Verifica LIVE (Docker, Postgres reale + JWT reale) — 8/8 PASS:** D1 suspend-open→terminate **409** ·
D4+D3 suspend-closed(100)→terminate(50)→`refundedAmount` **150** + status **200** · C2/D5+D3/C3 consent→release→
terminate **200 (nessun 500)**→release sopravvive→cancel-release **422** · D2 suspend-open→cancel→reactivate
**422** · C1 suspend-open→consent grant/revoke **200/200** · coverage integrity: **0 range invertiti**, 2
frammenti/abbonamento.

### Debito residuo (Minor, non bloccanti — dalla whole-branch review, ok-to-defer)
Un `expect(cov).toHaveLength(2)` in più sul test D3 pinnerebbe il ramo "frammento intatto" (oggi coperto per
costruzione); N+1 delete/update nel loop del carve (immateriale a 2-3 frammenti/abbonamento); i test D1/D2
asseriscono lo status non il body message (convenzione del file). Nessuno merita un fix ora.

## 3. GOTCHA / lezioni di questa slice

- **⚠️ api e2e mirati richiedono `--config ./test/jest-e2e.json`** o jest matcha **0 test** e riporta un **falso
  pass**: `corepack pnpm --filter @coralyn/api exec jest --config ./test/jest-e2e.json --runInBand -t '<pattern>'`.
  (La suite completa via `run test:e2e` è già configurata.)
- **`apps/api` non ha script `typecheck`**: `cd apps/api && corepack pnpm exec tsc -p tsconfig.json --noEmit`.
  Gate FE = `corepack pnpm --filter @coralyn/web-staff run typecheck` (= `vue-tsc -b --noEmit`, project-refs).
- **Ordine dei task cross-slice:** una guardia il cui **test** dipende da un fix di un'altra slice va riordinata.
  Qui il test `release → terminate → cancel-release` (D5) richiedeva prima il fix coverage D3 (altrimenti terminate
  **500**a): in Slice 1 il test D5 è stato fatto via `cancel` (NOT_CONFIRMED), e l'assertion via `terminate` è
  stata **spostata in Slice 2** (dopo D3). Le guardie sono early-return tipizzati → codici mappati a eccezioni Nest
  esistenti; **nessun cambio schema/migration/contracts**.
- **`terminate` assumeva "1 coverage"**: falso dopo qualsiasi carve. Ogni CTA che tocca la coverage va pensato su
  **N frammenti**, non su uno span singolo.
- **Verifica LIVE su Docker:** ricostruisci l'`api` (`docker compose --profile full up -d --build api`) — il
  container NON si rebuilda da solo ([[coralyn-dev-preview-env]], "STALE API CONTAINER"). Login admin
  `admin@coralyn.dev` / `coralyn-admin-8473`. Ispezione coverage/release via `psql -U $POSTGRES_USER` dentro
  `coralyn-db` (superuser bypassa RLS FORCE). **⚠️ Python su Windows scrive stdout in CRLF** → se generi liste di
  id in un file e le leggi in un array bash, `tr -d '\r'` o l'`\r` finisce nel JSON ("Bad control character").

## 4. Difetti ancora aperti (dall'handoff precedente §4 — DA PRIORITIZZARE CON L'UTENTE)

Da **riprodurre, triage e fixare** (metodo per ciascuno: **`systematic-debugging`** — riprodurre prima di fixare —
+ DoD **[ADR-0009]** + rubric [ADR-0002]). L'utente non ha fissato l'ordine tra questi e S3/S4.

1. **§4.1 — Pagina «Configura» struttura stabilimento: molti errori/bug**, sospetto da **dati legacy** nel DB dev
   (stato creato in precedenza). Indagare `EstablishmentStructureView.vue` (~406 righe → lega a **D-040**) + gli
   endpoint struttura (settori/file/ombrelloni/tipologie). **Il reset DB dev (§4.b) è un abilitatore**: riprodurre
   su dati puliti.
2. **§4.3 — «Pagamenti e saldo» (Scheda cliente):**
   - **«Da incassare» conteggia abbonamenti vecchi/annullati/disdetti mai incassati** (bug outstanding): il calcolo
     non esclude `status=cancelled` / `terminatedAt != null` / prenotazioni non più attive. Indagare la projection
     pagamenti (`CustomerPaymentsCard` + derivazione) e l'eventuale `GET /reports/summary` (`outstanding`).
     ⚠️ Nota: `cancel` (DELETE) e `terminate` **non** sono simmetrici — `cancelled` esclude via `status`, i disdetti
     restano `status=confirmed` con `terminatedAt`/`endDate` troncato: l'outstanding va escluso su **entrambe** le
     dimensioni.
   - **Tipo di prenotazione** (giornaliera/periodica/abbonamento) non mostrato nella lista pagamenti.
   - **Durata/periodo delle periodiche** non mostrata.
3. **§4.b — Reset TOTALE del DB dev:** comando che azzera i dati di business (clienti, abbonamenti, prenotazioni,
   storici `BookingSuspension`/`BookingTransfer`/`AbsenceRelease`/`BookingCoverage`, e — da confermare — la
   struttura) lasciando **solo `User` + `Establishment`** per loggarsi. Da progettare con cura per **RLS + ordine
   FK** (es. `pnpm --filter @coralyn/api run db:reset-business`, o truncate ordinato che preservi
   `User`/`Establishment`/`CredentialSetupToken`). **NON ancora fatto.** Nota: molte child sono FK CASCADE su
   `Booking` (verificato in cleanup LIVE: cancellare i `Booking` rimuove coverage/suspension/release).
4. **Audit generale casi-limite cross-feature** — l'utente vuole cercare sistematicamente edge non coperti anche
   nelle altre funzionalità. Candidato a un `writing-plans` "hardening / edge-case audit" per-feature (enumerare
   stati/transizioni → guardie mancanti → e2e), sullo stesso metodo usato qui per i CTA.

## 5. D-035 S3 → S4 (canale cliente self-service) — decomposizione già concordata

Con S1+S2 (operatore) e §4.2 (hardening) chiuse, resta il **canale cliente**. Prossimo ADR libero **0049**,
prossimo D libero **D-049**. Invariante non negoziabile (regge in S1+S2): **rivendita SOLO su release esplicita
registrata; nessuna presunzione d'assenza**; release a **zero cassa** sull'abbonato ([ADR-0048]).

1. **S3 — auth/identità del cliente.** Il `Customer` (oggi **senza login**, solo anagrafica
   `firstName`/`lastName`/`phone`/`email`/`notes`, anonimizzabile GDPR — **non** è uno `User`, no `passwordHash`)
   deve autenticarsi al **suo** canale senza essere uno `User`: magic-link/OTP (telefono/email → Mailpit in dev) o
   token-QR per abbonamento. Qui atterrano le security-gated **[D-026]** (refresh/revoca token) · **[D-027]**
   (rate-limit login) · **[D-028]** (RLS su identità) · **[D-029]** (login a tempo costante).
   **⚠️ Forza una decisione di TENANT-ROUTING PUBBLICO che oggi NON esiste:** web-staff/web-platform risolvono il
   tenant dal **JWT** dopo il login ([ADR-0024]); ma il bagnante arriva **prima** di autenticarsi → deve atterrare
   sul tenant giusto senza token. Tre opzioni: **sottodominio** (`lidosole.coralyn.it`), **path**
   (`coralyn.it/l/lido-sole`), o **QR** che incapsula tenant+abbonamento (spesso il più naturale). È un frammento
   di **[D-002]** (infra SaaS, [ADR-0010]) tirato dentro D-035 — **solo** per il canale cliente. **Decisione
   strutturale più pesante del modulo → aprire con gate review + brainstorming.**
2. **S4 — PWA/QR self-service release.** Il cliente autenticato (S3) sceglie il giorno e invia la release —
   **riusa la meccanica S2** (`AbsenceRelease.source='customer'` è **già predisposto**, additivo zero-retrofit
   sulla stessa tabella; il carve/guardie sono gli stessi ora hardened). Qui atterra **[D-037]** (gestione globale
   `401` nel data-layer FE). È la **quarta superficie** dell'app (nuovo scaffold Vite/PWA, come `web-platform`
   è la terza — [ADR-0041]).

## 6. Altri D-0xx aperti (backlog `deferred.md`) — da valutare con l'utente

Non toccati da questa slice; dettaglio + trigger in [`deferred.md`](../architecture/deferred.md):
- **D-036** — report cruscotto avanzato (heatmap/medie/export; lega all'occupancy% D-048 §7).
- **D-012** — cabine/servizi accessori come risorse prenotabili. **⚠️ l'utente lo ritiene poco utile — NON partire
  senza sua riconferma.**
- **D-040** — estrazione di `EstablishmentStructureView.vue` (~406 righe) in composabili/child (utile prima di
  toccare §4.1); **D-038** — drag-reorder/re-parent nell'editor struttura.
- **D-047** — audit di tenant per le azioni admin-in-tenant (tabella RLS-FORCE + scrittura atomica nelle tx);
  **D-041** — filtro globale Prisma `P2002` → `409`.
- Minori/infra: D-015 (orari arbitrari), D-021 (zod runtime), D-023 (least-privilege DB), D-024 (consenso GDPR
  residuo), D-025 (cambio-ruolo residuo), D-031 (timezone per-tenant), D-033/034 (pricing multi-stagione/forfait),
  D-042/043/044/046 (platform console).

## 7. Metodo (replicare)
Gate review spec con l'utente → (**brainstorming** se modulo/decisione strutturale — obbligatorio per **S3**) →
**writing-plans** (TDD) → **subagent-driven** (implementer per task col modello per costo/rischio; review a **due
stadi** per task + whole-branch **opus**; fix solo Crit/Imp, Minor nel ledger `.superpowers/sdd/progress.md`) →
**verifica LIVE su Docker** → **presentare e attendere OK esplicito** per il merge FF **e per il push** (entrambi
con ok utente — fatti così stavolta). **Preferenza utente:** nelle scelte "coerente vs scorciatoia" vuole sempre la
soluzione professionale/senza-debiti; non proporre la scorciatoia come pari-merito.

## 8. Riferimenti
- Registro [`deferred.md`](../architecture/deferred.md) · Rubric [ADR-0002] · Design docs [ADR-0009] ·
  Occupazione [ADR-0046] · Incasso [ADR-0011] · Cessione [ADR-0047] · Assenze [ADR-0048] · Auth [ADR-0024] ·
  Multi-tenant [ADR-0010] · App platform [ADR-0041].
- Hardening CTA: [spec](../superpowers/specs/2026-07-09-audit-macchina-stati-cta-abbonamento-design.md) ·
  [piano](../superpowers/plans/2026-07-09-audit-macchina-stati-cta-abbonamento.md) · [`flows.md §8`](../design/flows.md).
- Handoff precedente (D-035 S1+S2, con §4 difetti): [2026-07-09-d035-s1s2-assenze-comunicate-e-prossimi.md](2026-07-09-d035-s1s2-assenze-comunicate-e-prossimi.md).

[ADR-0002]: ../architecture/decisions/0002-decision-rubric.md
[ADR-0009]: ../architecture/decisions/0009-documentazione-di-design.md
[ADR-0010]: ../architecture/decisions/0010-isolamento-multi-tenant.md
[ADR-0011]: ../architecture/decisions/0011-incasso-base-nel-core.md
[ADR-0024]: ../architecture/decisions/0024-strategia-auth.md
[ADR-0041]: ../architecture/decisions/0041-app-frontend-dedicata-platform.md
[ADR-0046]: ../architecture/decisions/0046-occupazione-a-intervalli-coverage.md
[ADR-0047]: ../architecture/decisions/0047-cessione-subentro-titolarita-incasso.md
[ADR-0048]: ../architecture/decisions/0048-assenze-comunicate-release-occupazione.md
[D-002]: ../architecture/deferred.md
[D-026]: ../architecture/deferred.md
[D-027]: ../architecture/deferred.md
[D-028]: ../architecture/deferred.md
[D-029]: ../architecture/deferred.md
[D-037]: ../architecture/deferred.md
