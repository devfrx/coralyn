# Spec — Audit e hardening della macchina a stati dei CTA abbonamento (D-013 + D-035)

> Design **CONFERMATO** in brainstorming con l'utente (2026-07-09). Deriva dai **difetti/edge-case aperti**
> segnalati nell'handoff [2026-07-09-d035-s1s2-assenze-comunicate-e-prossimi.md](../../handoff/2026-07-09-d035-s1s2-assenze-comunicate-e-prossimi.md) §4.2.
> I sette CTA del ciclo abbonamento — i quattro di **D-013** (disdetta · sospensione chiusa/aperta ·
> riattivazione · cessione) e i tre di **D-035** (consenso · segnala assenza · annulla release) — sono stati
> costruiti e testati **in isolamento su un abbonamento pulito**. Solo **due** archi cross-famiglia hanno una
> guardia (`suspend-open→transfer 409`; il ciclo interno `suspend→reactivate`). Tutte le altre **combinazioni**
> sono non guardate e non testate → guardie mancanti, effetti errati su `BookingCoverage` e sulla cassa. Questa
> spec **enumera la matrice completa stato × CTA**, decide ogni cella e converge in un **hardening a 2 slice**.
> **Nessun nuovo ADR** (correttezza additiva su [ADR-0011]/[ADR-0046]/[ADR-0047]/[ADR-0048]); aggiorna
> `docs/design/flows.md` (ADR-0009 = DoD). Prossima azione dopo l'ok utente: `writing-plans` (TDD).

---

## 1. Problema

I CTA del ciclo abbonamento mutano **due dimensioni ortogonali** ([ADR-0046]): lo **span di contratto** su
`Booking` (`startDate`/`endDate`/`terminatedAt`/titolarità) e l'**occupazione fisica** a intervalli su
`BookingCoverage` (carve/ricopertura), più la **cassa** (`amountCollected`/`refundedAmount`). Ogni CTA assume
implicitamente uno **stato di partenza pulito** (`confirmed`, non disdetto, senza sospensione aperta, senza
release attive). Quando lo stato di partenza è **non pulito** — perché un CTA precedente lo ha modificato — le
precondizioni mancano e gli effetti diventano scorretti:

- `terminate` **non** rifiuta una sospensione aperta (a differenza di `transfer`) e ri-copre il buco liberato;
- `reactivate` **non** guarda `terminatedAt`/`status` → ri-copre giorni su un abbonamento disdetto/annullato;
- `terminate` assume "1 coverage" e tronca a tappeto tutti i frammenti → **range invertiti**/ri-copertura dopo
  una sospensione chiusa o una release;
- `terminate` **SETTA** `refundedAmount` in assoluto → **cancella dal ledger** i rimborsi già erogati da una
  sospensione;
- `cancelAbsenceRelease` non ha **alcuna** guardia di ciclo → ri-copre un giorno oltre l'`endDate` troncato;
- il consenso resta **"incastrato su ON"**: la toggle FE è gated su `canSuspend`, quindi su un sospeso/scaduto
  non è più revocabile.

**Obiettivo:** rendere la macchina a stati **chiusa e coerente** — ogni CTA lecito solo negli stati in cui i suoi
effetti su span/occupazione/cassa sono corretti — e coprirla con e2e per ogni combinazione rilevante.

**Invariante di dominio da preservare (D-035):** rivendita **solo** su release esplicita registrata; nessuna
presunzione d'assenza; la release è a **zero cassa** sull'abbonato ([ADR-0048]).

## 2. Ambito

- **CTA:** `terminate`, `suspend`, `reactivate`, `transfer`, `setAbsenceConsent` (grant/revoke), `releaseAbsence`,
  `cancelAbsenceRelease` — tutti in [`bookings.service.ts`](../../../apps/api/src/bookings/bookings.service.ts),
  tutti admin-only, gating FE in
  [`CustomerSubscriptionsCard.vue`](../../../apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue).
- **Stati distinguibili** di un `Booking` abbonamento: **active** (`confirmed`, `!terminatedAt`,
  `endDate≥oggi`, nessuna sospensione aperta), **suspended-open** (esiste `BookingSuspension` con `endDate=null`),
  **suspended-closed** (solo sospensioni chiuse nello storico), **terminated** (`terminatedAt` valorizzato),
  **cancelled** (`status='cancelled'`), **expired** (`confirmed`, `endDate<oggi`). Ortogonali: **consenso attivo**
  (`absenceConsentAt`), **release attiva** (`AbsenceRelease` non annullata/non rivenduta).
- **Fuori ambito:** i difetti §4.1 (pagina «Configura») e §4.3 («da incassare»/tipo/durata) dell'handoff — slice
  separate; la cessione non introduce nuovi difetti oltre a quelli in matrice; la rivendita giornaliera è invariata.

## 3. Principio unificante (confermato)

Ogni CTA ricade in una di tre classi, e la classe detta le precondizioni:

1. **CTA che toccano l'occupazione** (`suspend`, `reactivate`, `transfer`, `releaseAbsence`,
   `cancelAbsenceRelease`): richiedono `confirmed` + `!terminatedAt` + stato-sospensione coerente. Carve/
   ricopertura su un abbonamento morto o **dentro un buco di sospensione** è sempre incoerente.
2. **CTA di sola clausola** (`setAbsenceConsent`): tocca solo `Booking.absenceConsentAt`, **ortogonale
   all'occupazione** → richiede `confirmed` + `!terminatedAt`, **indipendente dalla sospensione**.
3. **`terminate`**: `confirmed` + `!terminatedAt` + **`!openSuspension`** + gestione corretta dei frammenti
   coverage.

## 4. Decisioni (CONFERMATE con l'utente 2026-07-09)

- **D1 — `terminate` rifiuta la sospensione aperta.** Mirror del guard di `transfer`: **409**
  «Riattiva prima di disdire». (Alternativa "permettere chiudendo la sospensione" scartata: più codice/edge-case;
  la coerenza col precedente `transfer` vince — rubric filtro 2.)
- **D2 — `reactivate` rifiuta `terminated`/`!confirmed`.** Copre il path reale `suspend-open → cancel →
  reactivate` (`cancel` non guarda la sospensione aperta) e, in difesa, `terminate → reactivate`.
- **D3 — `terminate` gestisce i frammenti coverage.** Sostituisce il troncamento a tappeto con logica
  per-frammento (§6). Corretto dopo sospensione-chiusa (head+tail) e release attiva.
- **D4 — `refundedAmount` è un ledger cumulativo.** `terminate` usa `increment` (come `suspend`/`reactivate`),
  con bound sul **residuo** (`amountCollected − refundedAmount`). (La scelta coerente/senza-debiti; il SET
  assoluto scartato.)
- **D5 — `cancelAbsenceRelease` guarda il ciclo.** Rifiuta `terminated`/`cancelled` (e `OPEN_SUSPENSION`, vedi C2).
- **C1 — consenso indipendente dall'occupazione.** Grant/revoke leciti quando `confirmed` + `!terminatedAt`, a
  prescindere da sospensione/scadenza → risolve D6 ("incastrato su ON"). Il backend `setAbsenceConsent` **è già
  corretto** (non ha guardia di sospensione); il cambiamento è **solo FE**.
- **C2 — release/annulla rifiutati durante sospensione aperta.** `releaseAbsence` e `cancelAbsenceRelease`
  aggiungono la guardia `OPEN_SUSPENSION` → **422**. Durante la sospensione il posto è già liberato/a-hold:
  segnalare/ri-coprire un singolo giorno è privo di senso e ri-coprirebbe dentro il buco.
- **C3 — `terminate` permesso con release attiva.** Nessuna guardia di blocco; D3 gestisce i frammenti, le righe
  `AbsenceRelease` restano storia. I giorni `≤ lastValid` restano rivendibili; quelli `> lastValid` diventano
  privi di effetto (fuori span) ma la riga resta come fatto storico.

## 5. Matrice intended (✓ lecito · ✗ rifiutato con codice)

| Stato | terminate | suspend | reactivate | transfer | consenso grant/revoke | release | annulla release |
|---|---|---|---|---|---|---|---|
| **active** | ✓ | ✓ | ✗ NO_OPEN 409 | ✓ | ✓ | ✓ (se consenso) | ✓ (se release) |
| **suspended-open** | ✗ **OPEN_SUSPENSION 409 (D1)** | ✗ OPEN_EXISTS 409 | ✓ | ✗ OPEN_SUSPENSION 409 | **✓ (C1)** | ✗ **OPEN_SUSPENSION 422 (C2)** | ✗ **OPEN_SUSPENSION 422 (C2)** |
| **suspended-closed** | ✓ *(D3 multi-frammento)* | ✓ | ✗ NO_OPEN 409 | ✓ | ✓ | ✓ | ✓ |
| **terminated** | ✗ ALREADY_TERMINATED 409 | ✗ TERMINATED 422 | ✗ **TERMINATED 422 (D2)** | ✗ TERMINATED 422 | ✗ TERMINATED 422 | ✗ TERMINATED 422 | ✗ **TERMINATED 422 (D5)** |
| **cancelled** | ✗ NOT_CONFIRMED 422 | ✗ NOT_CONFIRMED 422 | ✗ **NOT_CONFIRMED 422 (D2)** | ✗ NOT_CONFIRMED 422 | ✗ NOT_CONFIRMED 422 | ✗ NOT_CONFIRMED 422 | ✗ **NOT_CONFIRMED 422 (D5)** |

**Grassetto** = cella da chiudere in questa spec. Le celle non in grassetto sono già corrette e restano
invariate. (**expired** si comporta come **active** per le guardie di stato, ma i controlli di data pre-esistenti
di ogni CTA — `effectiveDate`/`returnDate`/`date` dentro lo span — rifiutano da sé le operazioni prive di senso;
nessuna nuova guardia dedicata a `expired`.)

## 6. Slice 1 — Guardie di precondizione + matrice e2e (additivo, basso rischio)

Ogni fix = precondizione backend (early-return tipizzato → error code) + guardia FE speculare + e2e della
combinazione. Nessuna modifica a schema/migration/contracts (solo nuovi codici d'errore, tutti mappati a
eccezioni Nest esistenti).

**Backend** (`bookings.service.ts`):
- **D1** — `terminate`: dopo `include: { suspensions: true }`, se `existing.suspensions.some(s => s.endDate === null)` → `OPEN_SUSPENSION` → `ConflictException('Sospensione aperta: riattiva prima di disdire')` (stesso wording di `transfer`).
- **D2** — `reactivate`: aggiungere `if (existing.status !== 'confirmed') NOT_CONFIRMED` (422) e `if (existing.terminatedAt) TERMINATED` (422), **prima** di cercare la sospensione aperta.
- **D5** — `cancelAbsenceRelease`: caricare `status`/`terminatedAt`/`suspensions` del booking; rifiutare `cancelled` (NOT_CONFIRMED 422), `terminated` (TERMINATED 422).
- **C2** — `releaseAbsence` **e** `cancelAbsenceRelease`: se esiste sospensione aperta → `OPEN_SUSPENSION` → `UnprocessableEntityException` (422).
- **C1** — nessuna modifica backend (`setAbsenceConsent` già corretto).

**Frontend** (`CustomerSubscriptionsCard.vue`):
- **D1** — `canTerminate(b)` aggiunge `&& !openSuspension(b)`.
- **D2** — il pulsante `Riattiva` (dentro il blocco `openSuspension`) aggiunge `&& !b.terminatedAt && b.status === 'confirmed'`.
- **D5/C2** — il pulsante `Annulla` release aggiunge la guardia di ciclo (`!b.terminatedAt && b.status === 'confirmed' && !openSuspension(b)`).
- **C1** — la toggle consenso passa da `canSuspend(b)` a un nuovo `canToggleConsent(b) = b.status === 'confirmed' && !b.terminatedAt` (indipendente da sospensione). `Segnala assenza` **resta** su `canSuspend && consentActive` (release non ammessa durante sospensione, coerente con C2).

**e2e Slice 1** (`bookings.e2e-spec.ts`, ognuna parte da uno stato costruito con i CTA reali):
`suspend-open → terminate` ⇒ 409 · `suspend-open → cancel → reactivate` ⇒ 422 · `terminate → reactivate` ⇒ 422 ·
`terminate → cancel-release` ⇒ 422 · `suspend-open → release` ⇒ 422 · `suspend-open → cancel-release` ⇒ 422 ·
`suspend-open → consent revoke` ⇒ 200 (C1) · `suspend-open → consent grant` ⇒ 200.

## 7. Slice 2 — Correttezza coverage/cassa di `terminate` (delicato, TDD stretto)

**D3 — carve per-frammento.** Sostituire (righe ~575-578) l'`updateMany` a tappeto con, per ogni
`BookingCoverage` del booking:
- `startDate > lastValid` → **delete** (posto liberato per quei giorni);
- `startDate ≤ lastValid < endDate` → **update** `endDate = lastValid` (clamp);
- `endDate ≤ lastValid` → invariato.

Gestisce correttamente lo span singolo (identico a oggi), la sospensione-chiusa (head `[start,S-1]` conservato/
clampato, coda `[R,end]` eliminata o clampata) e i frammenti di una release attiva. **Nessun range invertito.**
Sono tutte operazioni di **restringimento/delete** → **nessun rischio** sul constraint `coverage_no_overlap`
(solo create/estensioni possono violarlo). Aggiornare il commento fuorviante "L'abbonamento ha 1 coverage".

**D4 — rimborso ledger cumulativo.** In `terminate`: bound su `residuo = amountCollected − refundedAmount`
(oggi il bound è su `amountCollected`); `data.refundedAmount` da `input.refundAmount` (SET) a
`{ increment: input.refundAmount }`. FE `TerminateSubscriptionModal`: il rimborso pro-rata suggerito si **clampa
al residuo** per non generare un 422 (il server resta l'autorità sui bound).

**C3** — coperto da D3 (nessuna guardia); e2e dedicata.

**e2e Slice 2:**
`suspend-closed(rimborso 100) → terminate(rimborso 50)` ⇒ `refundedAmount = 150` (cumulativo, non 50) ·
`terminate` dopo sospensione-chiusa con `lastValid < R` ⇒ coda eliminata, **nessun** range invertito, coverage
finale = solo `[start, lastValid]` · `terminate` con release attiva a `date ≤ lastValid` ⇒ frammenti corretti +
riga `AbsenceRelease` preservata · bound: `terminate(rimborso > residuo)` ⇒ 422.

## 8. Effetti su BookingCoverage e cassa — invarianti da preservare

- **Occupazione:** dopo ogni sequenza, `BookingCoverage` del booking non contiene mai **range invertiti**
  (`startDate > endDate`) né frammenti che eccedono `endDate` del `Booking` (per gli stati non-disdetti) o
  `lastValid` (per i disdetti).
- **Cassa:** `refundedAmount` è **monotòna non decrescente** lungo il ciclo di vita (somma storica dei rimborsi:
  suspend + reactivate + terminate), sempre `≤ amountCollected`. `terminate`/`releaseAbsence`/`transfer` non
  violano gli invarianti già stabiliti (release = zero cassa sull'abbonato [ADR-0048]; cessione = movimento netto,
  `refundedAmount` intatto [ADR-0047]).
- **Non-regressione:** i path già corretti (happy path di ogni CTA, le due sequenze già testate) restano verdi.

## 9. Testing & DoD

- **Baseline da non regredire:** api unit **227** · api e2e **289** (`--runInBand`) · web-staff **364** ·
  typecheck pulito (`cd apps/api && pnpm exec tsc -p tsconfig.json --noEmit` + `corepack pnpm --filter
  @coralyn/web-staff run typecheck`). Le nuove e2e **alzano** il conteggio e2e; eventuali spec FE per le guardie.
- **Metodo:** i metodi service con `tx` si verificano **via e2e** (non esiste `bookings.service.spec.ts` né
  mock-tx); solo eventuali helper puri estratti avrebbero unit spec (qui non se ne prevedono — le guardie sono
  early-return, il carve è tx-bound).
- **ADR-0009 (DoD):** aggiornare `docs/design/flows.md` con la **macchina a stati** dei CTA + la **matrice
  guardie** (§5) — è un cambio di state-machine documentato. Nessun mockup nuovo (le UI dei CTA sono invariate,
  cambiano solo le condizioni di visibilità).
- **Nessun nuovo ADR:** hardening/correttezza additivo su [ADR-0011]/[ADR-0046]/[ADR-0047]/[ADR-0048]. La
  semantica ledger-cumulativa di `refundedAmount` è una **chiarificazione di coerenza** (allinea `terminate` al
  già-esistente `increment` di suspend/reactivate), non una nuova decisione architetturale.
- **Verifica LIVE su Docker** (Postgres reale + auth reale) delle sequenze chiave prima di presentare per il merge.

## 10. Fuori scope (deferiti, tracciati)

- Difetti handoff **§4.1** (pagina «Configura» struttura) e **§4.3** («da incassare» outstanding, tipo/durata
  prenotazione) — slice separate.
- **Reset totale DB dev** (§4.b) — task a sé.
- **D-035 S3/S4** (canale cliente) — invariati; questa spec non li tocca.
- Guardie su `cancel` generico oltre a quanto serve a D2 (il path pericoloso `cancel → reactivate` è chiuso lato
  `reactivate`): `cancel` resta un void generale; non si restringe qui.

## 11. Riferimenti

- Handoff [2026-07-09-d035-s1s2](../../handoff/2026-07-09-d035-s1s2-assenze-comunicate-e-prossimi.md) §4.2 ·
  Registro [`deferred.md`](../../architecture/deferred.md) (D-013, D-035, D-040) · Rubric [ADR-0002] ·
  Design docs [ADR-0009].
- Occupazione a intervalli [ADR-0046] · Incasso base [ADR-0011] · Cessione/titolarità [ADR-0047] ·
  Assenze comunicate [ADR-0048].

[ADR-0002]: ../../architecture/decisions/0002-decision-rubric.md
[ADR-0009]: ../../architecture/decisions/0009-documentazione-di-design.md
[ADR-0011]: ../../architecture/decisions/0011-incasso-base-nel-core.md
[ADR-0046]: ../../architecture/decisions/0046-occupazione-a-intervalli-coverage.md
[ADR-0047]: ../../architecture/decisions/0047-cessione-subentro-titolarita-incasso.md
[ADR-0048]: ../../architecture/decisions/0048-assenze-comunicate-release-occupazione.md
