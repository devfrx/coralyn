# Handoff / Delega — Stabilimento: overview FATTO (origin/main) · Fase 1 (scritture) IN CORSO su branch · Fase 2 + D-0xx

> Documento di consegna per la **prossima sessione/agente**. **Supera** l'handoff
> [2026-07-04-stabilimento-overview-done-e-completare.md](2026-07-04-stabilimento-overview-done-e-completare.md).
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: mock/spec → RISOLVI le
> decisioni con l'utente (brainstorming) → **piano TDD** → esecuzione **subagent-driven, un commit per layer,
> test-first** → review a due stadi → **DOPO ogni slice: presenta e attendi conferma.**

---

## 0. Situazione GIT — LEGGERE CON ATTENZIONE (stato non banale)
- **`origin/main`** = solo lo **Stabilimento overview** (slice precedente, pushata). **NON** contiene nulla del lavoro
  qui sotto.
- **Branch di lavoro `feat/stabilimento-rbac-rename`** (⚠️ **NON ancora pushato**) = 4 commit oltre `origin/main`, in ordine:
  1. `docs:` chiusura overview + **D-037** (gestione globale 401 FE) — *era il vecchio handoff/deferred*.
  2. `docs(establishment):` **spec** Stabilimento scritture (Modifica + gestione utenti D-025).
  3. `docs(establishment):` **piano Fase 1** (RBAC role-guard + rinomina).
  4. `feat(contracts):` **`UpdateEstablishmentInput`** — **Fase 1, layer contracts: DONE** (buildato in `dist/`, che è
     gitignored → va **ribuildato** sulla macchina che riprende, vedi §6).
  + questo stesso handoff (5° commit `docs:`).
- **`main` locale** è **1 commit avanti** a `origin/main` (lo stesso commit `docs:` #1 sopra, che vive anche sul branch)
  — **non pushato**. È innocuo: quando il branch verrà FF-mergiato su `main` e pushato, tutto si riconcilia.
- ⚠️ **AZIONE CONSIGLIATA A INIZIO PROSSIMA SESSIONE (richiede ok utente):** *pushare il branch*
  `git push -u origin feat/stabilimento-rbac-rename` così il lavoro è al sicuro e accessibile anche dall'altra macchina.
  Finché non è pushato, esiste **solo** su questa macchina (`C:\Users\Jays\Desktop\new`).
- **Nessuna migrazione pendente** (la Fase 2 ne introdurrà UNA: `User.disabledAt`). Prossimo **ADR: 0039** —
  **RISERVATO** al role-guard, **file non ancora creato** (lo crea la Fase 1, piano Task 3 step 7); dopo sarà 0040.
  Prossimo **D libero: D-038**.
- ⚠️ **Push su `main` richiede ok ESPLICITO dell'utente** (il classifier blocca il push sul default branch).

## 1. Stato attuale
**Su `origin/main` (pushato):** Stabilimento **overview read-only** — `GET /api/establishment/overview` (proiezione pura
tenant-scoped: nome · stagione-attiva=copre-oggi|null · fasce · conteggi struttura · team senza superuser, admin-first)
+ `EstablishmentView` reale (4 card lettura + Sessione, azioni "in arrivo"). Test: ui-kit 70 · web-staff 183 · api unit
122 · api e2e 169 · typecheck pulito.

**Sul branch `feat/stabilimento-rbac-rename` (non pushato) — completamento Stabilimento, DECISO con l'utente:**
- **Spec** [2026-07-04-stabilimento-scritture-design.md](../superpowers/specs/2026-07-04-stabilimento-scritture-design.md):
  attivare `Modifica` (rinomina) + `Inviti e gestione` (**D-025 core**: crea/elenca/disabilita staff), con **role-guard**
  (nuovo **ADR-0039**). `Configura`/planimetria = **D-005**, fuori. **Direct-create** utenti (invito-email deferito),
  **soft-disable** (`disabledAt`) + **invarianti anti-lockout** (no self-disable, no ultimo-admin). Due fasi.
- **Fase 1** [piano](../superpowers/plans/2026-07-04-stabilimento-fase1-rbac-rename.md) — **layer contracts DONE**
  (`UpdateEstablishmentInput`). **DA FARE:** Task 2 (`@Roles`/`RolesGuard` + unit + registrazione APP_GUARD), Task 3
  (`PATCH /api/establishment` rinomina admin-only + e2e + **crea ADR-0039**), Task 4 (FE modale rinomina + gating admin).
- **Fase 2** (spec §5.2/§6.2) — non ancora pianificata: migrazione `disabledAt` → contratti (`CreateStaffUserInput`/
  `UpdateStaffUserInput` + `disabledAt` su member) → endpoint users (`POST`/`PATCH /:id`) admin-only + invarianti +
  login-reject-disabled → FE «Aggiungi utente»/disabilita.

## 2. IL PROSSIMO PASSO
1. (con ok utente) **pushare il branch** (§0).
2. **Riprendere la Fase 1 dal Task 2** del piano, subagent-driven (un implementer per layer + review a due stadi):
   **layer api** (Task 2+3: guard+ADR-0039+PATCH+e2e, un commit) → **layer web-staff** (Task 4: modale+gating, un commit)
   → **verifica LIVE** → **presenta e attendi conferma**.
3. Poi **`superpowers:writing-plans` per la Fase 2** (gestione utenti) dallo spec §5.2/§6.2 → subagent-driven → presenta.
4. A Stabilimento completo: **FF-merge del branch su `main` + push** (ok esplicito), aggiorna handoff.

## 3. Come VEDERE i mock (React SPA "Bundled Page", una schermata alla volta)
`docs/design/mockups/gestionale-lidi-aspirazionale.html` (~625KB, **NON leggerlo raw**). Config **`mockups`** in
`.claude/launch.json` (`python -m http.server 8090`): `preview_start` "mockups" → naviga a
`http://localhost:8090/docs/design/mockups/gestionale-lidi-aspirazionale.html`. Per lo Stabilimento: i click sintetici
**non** triggerano gli handler React → invoca l'`onClick` del fiber via `preview_eval`
(`el[Object.keys(el).find(k=>k.startsWith('__reactProps$'))].onClick(...)`) sul selettore stabilimento. Misura con
`getComputedStyle`, **mappa sui token**, non copiare hex.

## 4. Le 8 schermate del mock — stato reale del FE
| Schermata | Stato |
|---|---|
| **Mappa** | reale (mappa + drawer + fix pomeriggio + «Abbonamento») |
| **Prenotazioni** | reale (A1 giornaliere · A2 incasso · A3 pricing/pacchetti) |
| **Clienti** + **Scheda cliente 360°** | reali (anagrafica + scheda redisegnata) |
| **Listino** | reale (editor CRUD stagioni/tariffe/pacchetti/fasce/dotazioni — D-032) |
| **Report** | reale (KPI + ECharts + scadenze — ADR-0038) |
| **Rinnovi** | reale (prelazione D-011) |
| **Stabilimento** | **overview reale**; scritture (Modifica/Utenti) = **Fase 1/2 in corso**; `Configura`=D-005 |
| **Struttura/planimetria** | **mock** → editor libero = **D-005** (deferito) |
| **Auth/landing** (Login/Registrazione/«Crea stabilimento») | reali (self-registration D-002 **rifiutata**; provisioning fornitore+inviti ADR-0028) |

## 5. Registro decisioni — stato ADR e D-0xx (fonte: [`deferred.md`](../architecture/deferred.md))
**ADR:** esistenti fino a **0038**; **0039 RISERVATO** al role-guard (creato in Fase 1); prox libero dopo = 0040.
**D-0xx aperti** (30) — i **rilevanti per il prodotto adesso**:
- **D-025 — Gestione utenti & RBAC** → **è la Fase 2** in corso (overview read-only già consegnato; gestione da fare).
- **D-005 — Editor planimetria libero** → sblocca `Configura` struttura dello Stabilimento (fuori dalla Fase 1/2).
- **D-037 — Gestione globale 401 FE** (NUOVO) → interceptor unico logout+redirect login su token scaduto (app-wide;
  lega a D-026). Osservato durante la verifica overview.
- **D-024 — GDPR cliente** (soft-delete/anonimizzazione) · **D-012 — Cabine/servizi accessori** (risorsa gemella
  Ombrellone; slice grande) · **D-035 — Canale cliente + "assenze comunicate"** (visione grande) · **D-036 — Report
  avanzato** · **D-013 — sospensione/cessione abbonamento** · **D-033 — pricing periodico multi-stagione** ·
  **D-034 — forfait periodico** (DEPRIORITIZZATO, non riproporlo per primo).
- **Hardening auth** (gated su esposizione pubblica): **D-026** refresh/revoca token · **D-027** rate-limiting login ·
  **D-028** RLS su `User` · **D-029** login a tempo costante.
- **Infra/altri:** D-002 multi-tenancy SaaS (self-signup **rifiutato**) · D-003 i18n · D-004 · D-006..D-010 ·
  D-014..D-016 · D-018..D-021 · D-023 · D-031 (timezone per-tenant). **Dettaglio completo nel registro `deferred.md`**
  (non duplicare qui). **Prossimo D libero: D-038.**

> Sequenza prodotto suggerita dall'utente (dopo il completamento Stabilimento): valutare **D-024** (GDPR) o **D-012**
> (cabine/servizi); poi la visione grande **D-035**. Confermare sempre con l'utente prima di partire.

## 6. Insidie note (gotcha) — LEGGERE PRIMA DI ESEGUIRE
- **`@coralyn/contracts` compila in `dist/` (gitignored)**: dopo un checkout o modifiche a
  `packages/contracts/src/index.ts` → `corepack pnpm --filter @coralyn/contracts build` **PRIMA** di typecheck/test/e2e
  api (l'api consuma il buildato). ⚠️ Il branch ha già `UpdateEstablishmentInput` in `src` ma **`dist` va ricostruito**.
- **Container dev stale = 404**: dopo cambi BE → `docker compose --profile full up -d --build api web`.
- ⚠️ **Nuovo `RolesGuard` sarà GLOBALE** (2° APP_GUARD): se dopo la Fase-1 qualche e2e pre-esistente va in **403**, il
  guard sta bloccando rotte senza `@Roles` → il guard deve ritornare `true` quando non ci sono ruoli richiesti (piano
  Task 2). Ri-esegui **tutta** la suite api dopo aver aggiunto il guard.
- ⚠️ **Sessione FE scaduta ≠ bug**: a token JWT scaduto (8h) + navigazione client-side le view mostrano il **banner
  d'errore** invece di redirigere al login (D-037). Fix = **re-login**. Prima di gridare al bug su schermata vuota,
  `curl` l'endpoint con token fresco (login `admin@coralyn.dev`/`coralyn-admin-8473`): se **200**, è la sessione.
- **`User` NON ha RLS** ([ADR-0026](../architecture/decisions/0026-identita-rls-utente.md)): query utenti dentro
  `forTenant` vanno filtrate **esplicitamente** per `establishmentId`. `Establishment` **non ha RLS** (update per PK
  `id = tenantId` è sicuro — la rinomina lo sfrutta).
- ⚠️ **`seed.ts` fa UPSERT dell'admin**: lancialo **sempre** con `DEV_ADMIN_PASSWORD=coralyn-admin-8473` (altrimenti
  resetta la password e rompe il login atteso).
- **Vitest su Node 24/Windows + `<img src="/…">`:** `transformAssetUrls: false` in `apps/web-staff/vitest.config.ts`
  (già presente). **ECharts + jsdom:** i test dei grafici stubbano `VChart`.
- **Tool Bash su Windows** (Git Bash/POSIX): niente here-string PowerShell `@'…'@`; commit multi-riga con
  `git commit -F -` + heredoc. La cwd del Bash tool **persiste** (usa path assoluti).
- **Dev server:** web Docker `localhost:8080` (build dal working tree, usalo per la verifica LIVE); Vite dev `5173`
  (proxy `/api` → `localhost:3000`). DB host `5433`. `.env`/`.env.test` alla ROOT (gitignored) → `coralyn_*`.
- **Comandi test** (root, `corepack pnpm`): api unit `--filter @coralyn/api test`; api e2e `--filter @coralyn/api test:e2e`;
  web-staff `--filter web-staff test`; ui-kit `--filter @coralyn/ui-kit test`; typecheck `--filter web-staff typecheck`.

## 7. Ancore di codice (VERIFICATE 2026-07-04)
- **Stabilimento (overview, su main):** [`apps/api/src/establishment/`](../../apps/api/src/establishment/)
  (`establishment.controller.ts`, `establishment.service.ts`, `establishment.projection.ts`); FE
  [`apps/web-staff/src/features/establishment/`](../../apps/web-staff/src/features/establishment/)
  (`EstablishmentView.vue`, `useEstablishment.ts`); DTO in `packages/contracts/src/index.ts`.
- **Fase 1 (da implementare, ancore nel piano):** guard in
  [`apps/api/src/identity/`](../../apps/api/src/identity/) (mirrorare `public.decorator.ts`/`jwt-auth.guard.ts` per
  `roles.decorator.ts`/`roles.guard.ts`; registrazione in `identity.module.ts`); `PATCH` nel controller stabilimento;
  DTO `update-establishment.dto.ts`; ADR da creare `docs/architecture/decisions/0039-rbac-role-guard.md`.
- **Fase 2 (D-025):** [`identity.service.ts`](../../apps/api/src/identity/identity.service.ts) (`login` → reject
  disabled), `prisma/schema.prisma` (`User.disabledAt`), `PasswordHasher` (argon2id) per la create.
- **Riuso:** `prisma.forTenant`, `TenantContext.require()`, `Reflector`, ui-kit `Modal`/`Field`/`Input`/`Button`;
  FE `queryResource`/`mutationResource` + `queryKeys.ts`.

## 8. Follow-up minori tracciati (non bloccanti)
- **`/auth/me` non espone il nome stabilimento** → la **nav header** usa il default hardcoded `'Lido Maestrale'` mentre
  la pagina Stabilimento mostra il nome reale. Fix quando si tocca `/me`/D-025 (nome nello `UserDTO`/sessione).
- **D-037** (401 → redirect login) tracciato in `deferred.md`.
- **`initials` team = `email.slice(0,2)`** (solo email disponibile) — accettabile.

## 9. Workflow (ADR-0009) + sync macchina
All'avvio: `git fetch --all --prune` → **se riprendi il lavoro Stabilimento**: `git checkout feat/stabilimento-rbac-rename`
(NON `main`, che non ha il branch) → altrimenti `git checkout main && git merge --ff-only origin/main`. Path
`C:\Users\zagor\Desktop\coralyn` (zagor) / `C:\Users\Jays\Desktop\new` (Jays). Slice creativo:
`superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:subagent-driven-development` (implementer NON
annida + review a due stadi, un commit per layer) → review finale → presenta e attendi conferma. Merge su `main` = FF,
**con ok esplicito**. ⚠️ Rebuild container prima di testare in dev; rebuild `@coralyn/contracts` dopo checkout.

## 10. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; altra macchina C:\Users\Jays\Desktop\new).
>
> STATO: `origin/main` ha lo **Stabilimento overview** (read-only). Il **completamento Stabilimento** è iniziato su un
> **branch NON pushato** `feat/stabilimento-rbac-rename` (sulla macchina Jays): contiene i docs di chiusura overview +
> **D-037**, la **spec** "Stabilimento scritture" (Modifica + gestione utenti D-025, role-guard **ADR-0039** riservato,
> direct-create + soft-disable + invarianti anti-lockout, `Configura`/planimetria=D-005 fuori), il **piano Fase 1**, e
> la **Fase 1 layer contracts già fatto** (`UpdateEstablishmentInput`). Verde (baseline overview): ui-kit 70 · web-staff
> 183 · api unit 122 · api e2e 169 · typecheck pulito.
>
> MACCHINA: `git fetch --all --prune`. ⚠️ **PRIMA COSA, con mio ok: pusha il branch**
> `git push -u origin feat/stabilimento-rbac-rename` (ora vive solo su Jays). Poi `git checkout
> feat/stabilimento-rbac-rename`. ⚠️ **Ribuilda i contracts** dopo il checkout: `corepack pnpm --filter
> @coralyn/contracts build`. ⚠️ Rebuild container prima di testare in dev (`docker compose --profile full up -d --build
> api web`; stale=404). ⚠️ `seed.ts` con `DEV_ADMIN_PASSWORD=coralyn-admin-8473`. DB `localhost:5433`; login
> `admin@coralyn.dev`/`coralyn-admin-8473`; web Docker `8080`; Vite dev `5173`. Push su `main` solo con mio ok. ⚠️ Se
> una schermata appare vuota/in-errore in dev, verifica prima che non sia la **sessione scaduta** (re-login; D-037).
>
> PRIMA COSA (ADR-0009): leggi `docs/handoff/2026-07-04-stabilimento-fase1-in-corso-e-prossimi.md` (git §0, stato §1,
> prossimo §2, mock §3-4, ADR/D-0xx §5, gotcha §6, ancore §7).
>
> TASK: **riprendere la Fase 1 dal Task 2** del piano
> `docs/superpowers/plans/2026-07-04-stabilimento-fase1-rbac-rename.md`, subagent-driven: layer **api** (`@Roles`/
> `RolesGuard` + unit + registrazione 2° APP_GUARD + `PATCH /api/establishment` rinomina admin-only + e2e + **crea
> ADR-0039**) → layer **web-staff** (modale rinomina + gating admin) → verifica LIVE → **presentami lo stato e attendi
> conferma**. Poi `superpowers:writing-plans` per la **Fase 2** (gestione utenti D-025) dallo spec §5.2/§6.2 →
> subagent-driven → presenta. A Stabilimento completo: FF-merge su `main` + push con mio ok. ⚠️ Il `RolesGuard` è
> globale: ri-esegui TUTTA la suite api dopo averlo aggiunto (rischio 403 su rotte senza `@Roles`).
