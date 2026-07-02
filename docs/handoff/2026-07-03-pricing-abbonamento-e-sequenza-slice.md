# Handoff / Delega — Slice "Pricing: Abbonamento partizione tipo" + sequenza slice/D-0xx

> Documento di consegna per la **prossima sessione**. Lo slice **"Archiviazione pacchetti"** è **COMPLETO, MERGIATO su
> `main` e PUSHATO**. Lo slice **"Pricing — Abbonamento partizione tipo"** ha **spec di design approvata** (decisioni
> risolte con l'utente), **da pianificare ed eseguire** — è il **prossimo passo reale**.
>
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: per ogni slice, spec di design →
> RISOLVI le decisioni con l'utente → **piano TDD** → implementa **subagent-driven, un commit per layer, test-first, da un
> NUOVO branch da `main`**. **DOPO ogni slice: presenta lo stato e attendi conferma prima del successivo.**

---

## 0. Situazione GIT (all'avvio fai il sync §8 e fidati di `git log`, non degli SHA qui)
- **`main` = `origin/main`** (al momento della scrittura `ff1eb05`). Include: lo slice "Archiviazione pacchetti" (4 commit
  `42122c5`→`c0a5ba0`) e la spec del pricing + questo handoff (`ff1eb05`). **Nessun branch pendente** (il branch
  dell'archiviazione è stato eliminato dopo il FF-merge).
- **Migrazioni:** `20260702204532_add_package_archived_at` (`Package.archivedAt` nullable) applicata a `coralyn_dev` e
  `coralyn_test`; `prisma migrate status` pulito su entrambi. **Lo slice Pricing NON richiede migrazioni** (logica pura).
- **Prossimo ADR libero:** **0035** lo consuma il pricing (§3). Dopo: **0036**. **Prossimo D libero:** **D-035**.

## 1. Stato attuale (post "Archiviazione", MERGIATO)
- **Baseline test da NON regredire (su `main`, verificata live 2026-07-03):** **api unit 91 · api e2e 129 · web-staff 148
  (globa ui-kit) · ui-kit standalone 55.** Typecheck web-staff pulito. *(La suite `web-staff` INCLUDE i 55 spec di
  `ui-kit`: 148 comprende i 55 — non doppio-contare.)*
- **"Archiviazione pacchetti"** (merged): soft-delete reversibile (`Package.archivedAt`) + hard-delete esplicito (200 solo
  se archiviato+0rif, altrimenti 409); `listPackages` default solo attivi + `?includeArchived=true`;
  `POST /packages/:id/archive|restore`; FE editor "Archivia" (no conferma) + sezione "Archiviati (N)" a scomparsa
  (Ripristina + Elimina definitivamente con ConfirmDialog); `useEntityLabels`→`useAllPackages` così lo storico
  prenotazioni risolve i nomi archiviati. Review finale opus: 0 Critical/Important (il fix regressione nomi archiviati è
  stato applicato). Live-verificato via API.

## 2. LA SEQUENZA (risposta a "prossimo passo tra slice e D-0xx")
**Gli slice vengono PRIMA dei D-0xx.** Ordine:

1. **Slice "Pricing — Abbonamento partizione tipo"** — **spec pronta**, `pianifica + esegui` (§3). È un **bug di prezzo dal
   vivo** (abbonamento prezzato €28 invece di €800), piccolo e ad alto valore. **Questo è il prossimo passo.**
2. **Slice C "Equipment personalizzato"** — editor "voce+quantità" sul JSONB `Package.equipment` (`schema.prisma` model
   Package; FE oggi edita solo `sunbeds` in `PricingView.vue`; `equipmentLabel` gestisce già chiavi ignote). **Brainstorming
   +spec PRIMA** (decisione con l'utente: free-form JSONB — rec: YAGNI — vs entità `EquipmentType` → nuovo ADR). Confina con
   `Package` e con **D-012**.
3. **Poi i D-0xx**, iniziando da quelli che confinano con ciò che è appena stato costruito (vedi §4).

**In una riga:** il prossimo passo NON è un D-0xx, è lo **slice Pricing** (spec approvata → piano → esecuzione). I D-0xx
vengono dopo gli slice; il primo naturale sarà **D-034** (forfait periodico), gemello del lavoro sul pricing/tipo.

## 3. Lo slice "Pricing — Abbonamento partizione tipo" (già progettato)
Spec approvata: **[docs/specs/2026-07-02-pricing-abbonamento-partizione-tipo-design.md](../specs/2026-07-02-pricing-abbonamento-partizione-tipo-design.md)**.
Decisioni **già risolte** (spec §7). Resta: **piano TDD + esecuzione** (subagent-driven, da nuovo branch da `main`).

**Problema (dal vivo):** un abbonamento (Giorno Intero) viene prezzato **€28** (una tariffa fascia-specifica a `type=Tutti`)
invece della tariffa dedicata **Abbonamento €800**, perché la precedenza ADR-0032 mette `tipo` per **ultimo** (più debole di
`fascia`); e per subscription il prezzo è usato come **forfait di stagione** → €28 per tutta la stagione. Errore di categoria.

**Soluzione (decisa — "partizione dura del tipo"):** un abbonamento è prezzato **solo** da tariffe `type='subscription'`; il
wildcard `type=null` è la famiglia **a prezzo/giorno** (daily/periodic), non il forfait. Fix di radice, non riordino.

**Layer (un solo layer di sostanza, backend):**
1. **Motore** `isApplicable` ([`pricing.engine.ts:32`](../../apps/api/src/catalog/pricing.engine.ts:32), check tipo `:33`):
   per `ctx.type === 'subscription'` applicabili solo le tariffe `r.type === 'subscription'`; daily/periodic invariati
   (wildcard applica). **Precedenza invariata** (`specificity` `:47-56`; la partizione basta — spec §3.2).
2. **422 specifico** in `throwPriceError` ([`bookings.service.ts:50`](../../apps/api/src/bookings/bookings.service.ts:50),
   call site `71` e `197`): per NO_RATE + `type='subscription'` → "Nessuna tariffa Abbonamento configurata per questa
   stagione"; altrimenti il generico. Aggiungere il param `type` all'helper.
3. **ADR-0035** (nuovo): raffina ADR-0032 §1 (semantica wildcard + ruolo di `type` post-"Chiarezza tipi") + riga di rimando
   in ADR-0032. **FE invariato** (il mock quote già ritorna €800; nessun avviso editor — "Chiarezza tipi" §7.4 = NO).
4. **Test (spec §5):** unit motore — sostituisci 1:1 il test "subscription→forfait" ([`pricing.engine.spec.ts:79`](../../apps/api/src/catalog/pricing.engine.spec.ts:79),
   usa una tariffa `subscription`, non wildcard); aggiungi: €800 batte €28 fascia-specifica; subscription+solo-catch-all→
   NO_RATE; daily/periodic invariati. e2e: subscription senza tariffa Abbonamento → 422 specifico; €800/€850 invariati.
5. **Impatto (verificato):** seed dev ([`seed.ts:159-191`](../../apps/api/prisma/seed.ts:159)) + helper e2e
   ([`seed-pricing.ts`](../../apps/api/test/helpers/seed-pricing.ts)) hanno già tariffe subscription → nessun cambio dati;
   **1 solo test unit** aggiornato 1:1; resto additivo. Baseline `main` da non regredire: **api unit 91 · e2e 129**
   (attesi +3/4 unit, +1/2 e2e).

## 4. D-0xx da affrontare DOPO gli slice (registro: `docs/architecture/deferred.md`)
Ordinati per adiacenza a ciò che è appena stato costruito:
- **D-034 — forfait per prenotazione periodica** (pacchetto-periodo a prezzo fisso). **Gemello del pricing/tipo**: dopo la
  partizione del tipo, reintrodurre il forfait-periodo è il seguito naturale (es. forfait a livello `Package`), senza
  toccare le precedenze.
- **D-012 — cabine/servizi accessori** come risorse prenotabili: **confina con Slice C (Equipment)**.
- **D-018** — prezzo per tipologia ombrellone (aggiungere un `ambito` al pricing engine). **D-015** — orari arbitrari fasce.
  **D-033** — pricing periodico multi-stagione. **D-030** — exclusion constraint DB anti-overlap. Tutti additivi, rimandati.
- Fuori area Catalogo: auth/hardening (D-025/026/027/028/029), i18n (D-003), GDPR (D-024), fuso per-tenant (D-031).

## 5. Insidie note (gotcha) — LEGGI PRIMA DI ESEGUIRE
- **Subagent-driven: l'implementer NON deve delegare/annidare.** Istruisci ogni implementer: "fai TU il lavoro con i tuoi
  tool, NON spawnare subagent". Se finisce a mani vuote, verifica `git log`/working-tree PRIMA di ri-dispatchare.
- **⚠️ REBUILDA i container prima di testare in dev:** `docker compose --profile full up -d --build api web`. Il pricing è
  puro (nessuna migrazione), ma il container va comunque rifatto per vedere il nuovo motore. Login dev
  `admin@coralyn.dev` / `coralyn-admin-8473`; API `localhost:3000/api` (health a `/health`, escluso dal prefisso `/api`);
  web docker `8080`; DB host `5433`. Stagioni dev: 2026 `70000000-…-0001`, 2027 `70000000-…-0002`.
- **Verifica live del pricing (curl):** login → `GET /api/bookings/quote?umbrellaId=…&timeSlotId=…&type=subscription&…`
  deve dare €800 (matchedRate `type=subscription`), non €28. Con una stagione senza tariffa subscription → 422 specifico.
- **Comandi test** (root, `corepack pnpm`): api unit `--filter @coralyn/api test`; api e2e `--filter @coralyn/api test:e2e`
  (auto-carica `.env.test` al ROOT del repo); web-staff `--filter web-staff test` (INCLUDE i 55 di ui-kit → 148); typecheck
  `--filter web-staff typecheck`. Il "worker failed to exit gracefully" di Jest è rumore di teardown pre-esistente, non un
  fallimento.
- **`.env.test` è al ROOT del repo** (non in `apps/api/`). Per comandi prisma sotto `--filter`, passa `DATABASE_URL`
  esplicito (Prisma non auto-carica il root `.env`), caricandolo dal file **senza stamparlo** (il classifier blocca la
  materializzazione di credenziali). P1002 advisory-lock su `migrate deploy` → `pg_terminate_backend(<pid>)` sul lock-holder
  (`pg_locks` locktype='advisory'). *(Non serve al pricing: nessuna migrazione.)*

## 6. Ancore di codice (file:riga, VERIFICATE su `main` `ff1eb05` — 2026-07-03)
- **Motore:** [`apps/api/src/catalog/pricing.engine.ts`](../../apps/api/src/catalog/pricing.engine.ts) — `isApplicable`
  **`:32-44`** (check tipo `:33`), `specificity` `:47-56` (INVARIATO), `resolvePrice` `:80-93`. Spec
  `pricing.engine.spec.ts` (test subscription→forfait **`:79`** da sostituire 1:1).
- **Service:** [`apps/api/src/bookings/bookings.service.ts`](../../apps/api/src/bookings/bookings.service.ts) —
  `throwPriceError` **`:50-56`** (aggiungi param `type`); call site `quote` **`:71`** (`input.type`) e `priceAndWrite`
  **`:197`** (`p.type`). e2e `apps/api/test/bookings.e2e-spec.ts`; helper `apps/api/test/helpers/seed-pricing.ts` (già
  seeda una tariffa subscription).
- **ADR:** crea `docs/architecture/decisions/0035-pricing-tipo-partiziona-la-formula.md`; rimando in
  `0032-pricing-engine-precedenza.md`.

## 7. Workflow per lo slice Pricing (ADR-0009)
1. Spec — **fatta** (§3). 2. Decisioni — **risolte** (spec §7). 3. **Piano TDD** — `superpowers:writing-plans` →
   `docs/superpowers/plans/`. 4. **Esegui** — `superpowers:subagent-driven-development`: implementer (NON delega) + task-review
   + review whole-branch finale (opus), **un commit per layer** (qui probabile 1 commit motore+service+e2e + 1 commit doc
   ADR), da un **nuovo branch da `main`**. 5. **DOPO**: rebuild container + verifica live (quote subscription = €800; 422
   specifico), presenta lo stato all'utente e attendi conferma prima del successivo (Slice C: brainstorming+spec).

## 8. Sync macchina "zagor"/"Jays"
All'avvio: `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main`. Path
`C:\Users\zagor\Desktop\coralyn` (zagor) o `C:\Users\Jays\Desktop\new` (Jays). ⚠️ Rebuilda i container prima di testare in
dev (password admin container `coralyn-admin-8473`).

## 9. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; altra macchina C:\Users\Jays\Desktop\new).
>
> STATO: lo slice **"Archiviazione pacchetti"** è COMPLETO, MERGIATO su `main` e PUSHATO (soft-delete `Package.archivedAt`
> + hard-delete esplicito; editor "Archivia" + sezione "Archiviati"). Verde su tutti i test (api unit 91 · e2e 129 ·
> web-staff 148 · ui-kit 55 · typecheck pulito), live-verificato. Lo slice **"Pricing — Abbonamento partizione tipo"** ha
> spec di design **approvata** e committata su `main` (decisioni risolte con me), **da pianificare ed eseguire**.
>
> MACCHINA: esegui SEMPRE `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main` prima di
> fidarti del tree o creare un branch. ⚠️ Rebuilda i container prima di testare in dev: `docker compose --profile full up
> -d --build api web`. DB host localhost:5433; password admin container `coralyn-admin-8473`; login dev
> `admin@coralyn.dev`/`coralyn-admin-8473`.
>
> PRIMA COSA (ADR-0009): leggi l'handoff `docs/handoff/2026-07-03-pricing-abbonamento-e-sequenza-slice.md` (sequenza §2,
> slice pricing §3, D-0xx §4, gotcha §5, ancore di codice §6 VERIFICATE), poi la spec
> `docs/specs/2026-07-02-pricing-abbonamento-partizione-tipo-design.md`, poi ADR-0032 (precedenza, che questo slice raffina
> con ADR-0035) e ADR-0006 (dominio).
>
> TASK, in sequenza: (1) PIANIFICA (piano TDD) ed ESEGUI lo slice "Pricing — Abbonamento partizione tipo" — partizione dura
> del tipo: un abbonamento è prezzato SOLO da tariffe `type='subscription'`; motore `isApplicable` (`pricing.engine.ts:33`),
> 422 specifico in `throwPriceError` (`bookings.service.ts:50`, call site 71/197), nuovo ADR-0035, test (sostituzione 1:1
> di `pricing.engine.spec.ts:79` + casi additivi); **precedenza e FE invariati**. (2) Poi Slice C "Equipment personalizzato"
> (brainstorming+spec, decisione free-form JSONB vs entità `EquipmentType` con me). Tieni i D-0xx DOPO gli slice: **D-034**
> (forfait periodico) è il gemello del pricing; **D-012** confina con Equipment; poi D-018/D-015/D-033/D-030. Workflow
> ADR-0009 per OGNI slice: spec → risolvi decisioni con me → piano TDD → subagent-driven, un commit per layer, test-first,
> da un NUOVO branch da main. Non regredire i conteggi test (riverificali dal vivo: api unit 91 · e2e 129 · web-staff 148 ·
> ui-kit 55).
>
> DOPO ogni slice: presentami lo stato e attendi conferma prima del successivo.
