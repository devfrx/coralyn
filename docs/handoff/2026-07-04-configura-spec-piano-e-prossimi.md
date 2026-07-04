# Handoff / Delega — Stabilimento COMPLETO su `main` · `Configura` struttura: spec + piano Slice 1 PRONTI · roadmap

> Documento di consegna per la **prossima sessione/agente**. **Supera** l'handoff
> [2026-07-04-stabilimento-completo-e-prossimi.md](2026-07-04-stabilimento-completo-e-prossimi.md).
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: mock/spec → brainstorming →
> piano TDD → esecuzione **subagent-driven, un commit per layer, test-first** → review a due stadi → verifica LIVE →
> presenta e attendi conferma. **Leggi questo per primo.**

---

## 0. Situazione GIT — LEGGERE CON ATTENZIONE
- **`origin/main` = `0d210cd`**: **Stabilimento COMPLETO** (overview + Fase 1 rinomina/RBAC **ADR-0039** + Fase 2 gestione
  utenti **D-025 core**). Tutto pushato, verde, verificato LIVE.
- **Branch di lavoro `feat/stabilimento-configura-struttura`** (⚠️ verifica se è pushato con `git branch -vv`) = 4 commit
  di **soli docs** oltre `main`, in ordine:
  1. `docs:` **spec** Configura struttura (editor logico completo).
  2. `docs:` **piano TDD Slice 1** (struttura lettura + Tipologie CRUD).
  3. *(handoff, questo file, 4° commit)*.
  4. `docs(deferred):` coerenza registro (D-025 core FATTO, D-005 = solo pixel, **+D-038** drag-reorder **+D-039** drift
     Prisma).
  ⚠️ **Il branch non contiene codice**, solo la spec + il piano + gli aggiornamenti al registro. `main` è momentaneamente
  **indietro** sul registro (dice ancora "D-025 gestione deferita"): la correzione vive sul branch → **FF-mergiando il
  branch su `main` il registro torna coerente**. Nessun conflitto atteso (il branch tocca solo docs).
- ⚠️ **AZIONE CONSIGLIATA A INIZIO SESSIONE (richiede ok utente):** **FF-mergiare il branch su `main` + push**
  (`git checkout main && git merge --ff-only feat/stabilimento-configura-struttura && git push origin main`) così spec,
  piano, registro coerente e questo handoff sono su `main`, e la prossima implementazione parte da un `main` pulito.
  In alternativa: `git push -u origin feat/stabilimento-configura-struttura` per metterlo al sicuro senza mergiare.
- **Nessuna migrazione pendente.** L'ultima applicata è `20260704191049_add_user_disabled_at`. Lo **Slice 1** di Configura
  ne introdurrà UNA (`add_sector_kind`).
- **Prossimo ADR libero: 0040** (0039 = role-guard; lo Slice 1 di Configura ne creerà uno per il design editor struttura).
- **Prossimo D libero: D-040** (D-038 = drag-reorder, D-039 = drift Prisma, appena registrati).
- ⚠️ **Push su `main` richiede ok ESPLICITO** dell'utente (il classifier blocca il default branch).

## 1. Stato attuale
**Su `origin/main` (FATTO):** Stabilimento completo.
- **Fase 1** — [ADR-0039](../architecture/decisions/0039-rbac-role-guard.md): `@Roles`/`RolesGuard` globale (2° `APP_GUARD`;
  rotte senza `@Roles` invariate, con `@Roles(admin)`→403) + `PATCH /api/establishment` rinomina admin-only + FE modale
  «Modifica».
- **Fase 2** — gestione utenti (D-025 core): migrazione `User.disabledAt`; `POST`/`PATCH /api/establishment/users/:id`
  admin-only (crea staff: email unica→409, ruolo≠superuser→400, pw `@MinLength(8)`, hash argon2; disabilita/riabilita
  soft con invarianti anti-lockout no-self/no-ultimo-admin→422); `login` respinge i disabilitati; overview espone
  `disabledAt`; FE «Aggiungi utente» + disabilita/riabilita per riga + gating staff read-only.
- **Test baseline (NON regredire):** ui-kit **70** · web-staff **191** · api unit **134** · api e2e **182** · typecheck pulito.

**Sul branch (docs pronti, DA IMPLEMENTARE):** completare il bottone **`Configura`** dello Stabilimento = editor **logico**
della struttura (settori/file/ombrelloni/tipologie), fedele al mockup «Struttura della spiaggia».
- **Spec** [2026-07-04-stabilimento-configura-struttura-design.md](../superpowers/specs/2026-07-04-stabilimento-configura-struttura-design.md):
  editor completo (5 modali, 4 entità CRUD admin-only, generatore a numerazione automatica, guardie block-409, colonna
  `Sector.kind`), decomposto in **3 slice**. `Configura` pixel/coordinate-libere = **D-005**, fuori.
- **Piano Slice 1** [2026-07-04-stabilimento-configura-slice1-struttura-tipologie.md](../superpowers/plans/2026-07-04-stabilimento-configura-slice1-struttura-tipologie.md):
  **struttura (lettura) + Tipologie CRUD**, codice completo senza placeholder, 3 commit (contracts/api/web-staff).
  Target test: api unit 140 · api e2e 189 · web-staff 194.

## 2. IL PROSSIMO PASSO
1. (con ok utente) **FF-merge del branch su `main` + push** (§0), oppure push del branch.
2. **Eseguire lo Slice 1** di Configura dal piano, **subagent-driven** (implementer per layer + review a due stadi, un
   commit per layer): contracts → api (migrazione `Sector.kind` + `GET /structure` + Tipologie CRUD) → web-staff (vista
   albero read-only + card Tipologie + rotta admin-gated + bottone «Configura») → **verifica LIVE** → **presenta e attendi
   conferma**.
3. Poi **`superpowers:writing-plans` per lo Slice 2** (Settori + File) dalla stessa spec → subagent-driven → presenta.
   Poi **Slice 3** (Ombrelloni + Genera). A Configura completo: FF-merge su `main` + push (ok esplicito), aggiorna handoff.
4. **Dopo Configura**, sequenza prodotto suggerita (confermare sempre con l'utente): **D-024** (GDPR cliente) o **D-012**
   (cabine/servizi); poi la visione grande **D-035** (canale cliente + "assenze comunicate"). Vedi §4.

## 3. Le 8 schermate del mock — stato reale del FE
Mockup: `docs/design/mockups/gestionale-lidi-aspirazionale.html` (~600KB, React "bundled page", **NON leggerlo raw**).
Config `mockups` in `.claude/launch.json` (`python -m http.server 8090`): `preview_start "mockups"` → naviga a
`http://localhost:8090/docs/design/mockups/gestionale-lidi-aspirazionale.html`. **Gotcha runtime:** è un framework custom
"dc" (globali `__dc*`), non React puro; per la vista **Struttura** naviga tu alla pagina e usa i click reali sui CTA
(`preview_click`/`.click()` funzionano; l'istanza `setState` NON è facilmente raggiungibile). Misura coi computed style,
**mappa sui token**, non copiare hex.

| Schermata | Stato |
|---|---|
| **Mappa** | reale (mappa + drawer + fix pomeriggio + «Abbonamento») |
| **Prenotazioni** | reale (A1 giornaliere · A2 incasso · A3 pricing/pacchetti) |
| **Clienti** + **Scheda cliente 360°** | reali (anagrafica + scheda redisegnata) |
| **Listino** | reale (editor CRUD stagioni/tariffe/pacchetti/fasce/dotazioni — D-032) |
| **Report** | reale (KPI + ECharts + scadenze — ADR-0038) |
| **Rinnovi** | reale (prelazione D-011) |
| **Stabilimento** | **overview + Modifica (rinomina) + Utenti (D-025) reali**; **`Configura` struttura = spec+piano Slice 1 PRONTI** (in costruzione a slice) |
| **Struttura della spiaggia** («Configura») | editor **logico** = spec pronta, Slice 1 pianificato; editor **pixel** (coordinate libere) = **D-005** |
| **Auth/landing** (Login/Registrazione/«Crea stabilimento») | reali (self-registration D-002 **rifiutata**; provisioning fornitore+inviti ADR-0028) |

## 4. Registro decisioni — ADR e D-0xx aperti (fonte autorevole: [`deferred.md`](../architecture/deferred.md))
**ADR:** esistenti fino a **0039**; prox libero **0040** (lo prende lo Slice 1 di Configura per il design editor struttura).
**D-0xx — i rilevanti per il prodotto adesso** (il resto nel registro, non duplicare qui):
- **In costruzione:** editor struttura «Configura» (spec 2026-07-04, Slice 1→2→3). Non più deferito; **D-005** resta solo
  il layer **pixel**.
- **Prossimi prodotto (dopo Configura, confermare):** **D-024** GDPR cliente (soft-delete/anonimizzazione) · **D-012**
  cabine/servizi accessori (risorsa gemella Ombrellone) · **D-035** canale cliente + "assenze comunicate" (visione grande)
  · **D-036** report avanzato · **D-013** sospensione/cessione abbonamento · **D-033** pricing periodico multi-stagione ·
  **D-034** forfait periodico (**DEPRIORITIZZATO**, non riproporlo per primo).
- **UX/manutenzione tracciati:** **D-037** gestione globale 401 FE (interceptor logout+redirect) · **D-038** drag-reorder
  settori/file/ombrelloni (+re-parent) · **D-039** drift Prisma su `Rate_signature_key` (tooling migrate-dev).
- **Hardening auth** (gated su esposizione pubblica): **D-026** refresh/revoca token · **D-027** rate-limiting login ·
  **D-028** RLS su `User` · **D-029** login a tempo costante.
- **Infra/altri:** D-002 (self-signup **rifiutato**) · D-003 i18n · D-004 cassa/fiscale · D-006..D-010 · D-014..D-016 ·
  D-018..D-021 · D-023 · D-031 (timezone per-tenant). **Prossimo D libero: D-040.**
- **Follow-up minore:** `/auth/me` non espone il nome stabilimento → la nav usa il default `'Lido Maestrale'` mentre la
  pagina Stabilimento mostra il nome reale. Fix quando si tocca `/me`/sessione.

## 5. Insidie note (gotcha) — LEGGERE PRIMA DI ESEGUIRE
- **`@coralyn/contracts` compila in `dist/` (gitignored)**: dopo checkout o modifiche a `packages/contracts/src/index.ts`
  → `corepack pnpm --filter @coralyn/contracts build` **PRIMA** di typecheck/test api.
- **Container dev stale = 404**: dopo cambi BE → `docker compose --profile full up -d --build api web`.
- **`RolesGuard` è GLOBALE**: dopo modifiche a guard/rotte ri-esegui **tutta** la suite api (unit + e2e). Endpoint senza
  `@Roles` devono restare invariati.
- **Tabelle mappa (`Sector`/`Row`/`Umbrella`/`UmbrellaType`) sono RLS FORCE**: ogni scrittura/lettura in
  `prisma.forTenant(tenantId, tx => …)`; i `create` passano **`establishmentId: tenantId` esplicito** (mirror di
  `time-slots.service`). `User` **non ha RLS** (ADR-0026) → filtro `establishmentId` esplicito. `Establishment` non ha RLS.
- ⚠️ **Drift Prisma su `Rate_signature_key`** (D-039): se rigeneri una migrazione con `migrate dev`, **controlla** che
  `migration.sql` non contenga un `DROP INDEX "Rate_signature_key"` spurio; se sì, rimuovilo e ricrea l'indice raw
  (`CREATE UNIQUE INDEX … NULLS NOT DISTINCT`, come in `20260630203447_pricing`).
- ⚠️ **`seed.ts` fa UPSERT dell'admin**: lancialo **sempre** con `DEV_ADMIN_PASSWORD=coralyn-admin-8473`.
- **DB**: dev `coralyn_dev`, test `coralyn_test`, entrambi `localhost:5433`, utente/pass `coralyn_app`/`coralyn_app`.
  Prisma non auto-carica il `.env` di root da `apps/api` → `DATABASE_URL` inline per i comandi migrate.
- **Bash tool Windows** (Git Bash/POSIX): heredoc per i commit multi-riga, path assoluti (cwd persiste). Per
  `docker compose exec` con path assoluti usa `MSYS_NO_PATHCONV=1` (altrimenti Git Bash converte `/app/...` → path Windows).
- **Preview LIVE FE**: `preview_start "web-staff"` (Vite); se 5173 è occupata Vite passa a **5174** mentre il proxy del
  preview è su un'altra porta → **naviga direttamente a `http://localhost:5174/…`**. web Docker = `8080`. Login
  `admin@coralyn.dev`/`coralyn-admin-8473`.
- **Sessione FE scaduta ≠ bug** (token 8h): schermata in-errore → **re-login** prima di gridare al bug (D-037).
- **Vitest + ui-kit `Modal`** (reka-ui portal → teleport su `document.body`): nei test del modale usa
  `mountApp(View, { attachTo: document.body })` + `document.querySelector` + `w.unmount()` (come `MapView.spec.ts`).
- **Icone ui-kit**: chiavi in `packages/ui-kit/src/icons/registry.ts` (es. cestino = `trash-2`, non `trash`; `palmtree`
  per la palma). Verifica la chiave prima di usarla.

## 6. Ancore di codice (VERIFICATE 2026-07-04)
- **Stabilimento API**: [`apps/api/src/establishment/`](../../apps/api/src/establishment/) — `establishment.controller.ts`
  (`GET overview`, `PATCH` rinomina), `establishment-users.controller.ts`+`.service.ts` (D-025), `establishment.service.ts`/
  `.projection.ts` (overview), `dto/`.
- **RBAC**: [`apps/api/src/identity/`](../../apps/api/src/identity/) — `roles.decorator.ts`, `roles.guard.ts`,
  `current-user.decorator.ts`, `password-hasher.ts`; 2° `APP_GUARD` in `identity.module.ts`; `identity.service.ts` (login
  respinge disabilitati).
- **Struttura (esistente, consumata dalla Mappa; l'editor Configura la scriverà)**: modelli `Sector`/`Row`/`Umbrella`/
  `UmbrellaType` in `apps/api/prisma/schema.prisma` (con `sortOrder`/`logicalOrder`, `Umbrella.presentationPosition` JSON
  inutilizzato = D-005); lettura albero in [`apps/api/src/map/map.service.ts`](../../apps/api/src/map/map.service.ts)
  (`forTenant` + `include` annidato); CRUD Listino di riferimento in [`apps/api/src/catalog/`](../../apps/api/src/catalog/)
  (guardie block-409, `time-slots.service.ts` = pattern CRUD da mirrorare).
- **FE Stabilimento**: [`apps/web-staff/src/features/establishment/`](../../apps/web-staff/src/features/establishment/)
  (`EstablishmentView.vue`, `useEstablishment.ts`); router role-gating in
  [`apps/web-staff/src/router/index.ts`](../../apps/web-staff/src/router/index.ts) (`meta.role`); DTO struttura
  (`SectorDTO`/`RowDTO`/`UmbrellaDTO`/`UmbrellaTypeDTO`) già in `packages/contracts/src/index.ts` (la Mappa li usa; l'editor
  usa DTO "struttura" più leggeri — vedi spec §4).
- **Riuso**: `prisma.forTenant`/`TenantContext.require()`, `Reflector`, `@Roles`; ui-kit `Modal`/`Field`/`Input`/`Select`/
  `Button`/`Badge`/`Card`; FE `queryResource`/`mutationResource` + `queryKeys.ts`.

## 7. Workflow (ADR-0009) + sync macchina
All'avvio: `git fetch --all --prune`. **Se riprendi Configura:** valuta il FF-merge del branch su `main` (§0), poi
`git checkout main && git merge --ff-only origin/main` e branch nuovo per lo Slice 1. Path `C:\Users\zagor\Desktop\coralyn`
(zagor) / `C:\Users\Jays\Desktop\new` (Jays). Slice creativo: `brainstorming` → `writing-plans` →
`subagent-driven-development` (implementer NON annida + review a due stadi, un commit per layer) → verifica LIVE →
presenta e attendi conferma. Merge su `main` = **FF con ok esplicito**. ⚠️ Rebuild container prima di testare in dev;
rebuild `@coralyn/contracts` dopo checkout.

## 8. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; altra macchina C:\Users\Jays\Desktop\new).
>
> STATO: `origin/main` = **Stabilimento COMPLETO** (overview + rinomina/RBAC ADR-0039 + gestione utenti D-025 core;
> tutto verde e verificato LIVE). Su un **branch di soli docs** `feat/stabilimento-configura-struttura` (⚠️ verifica se
> pushato) ci sono: la **spec** del bottone **`Configura`** dello Stabilimento (editor **logico** della struttura —
> settori/file/ombrelloni/tipologie, fedele al mockup «Struttura della spiaggia»; 5 modali, guardie block-409, colonna
> `Sector.kind`, generatore a numerazione automatica; il layer **pixel** resta D-005), il **piano TDD dello Slice 1**
> (struttura in lettura + Tipologie CRUD, codice completo), e l'aggiornamento del **registro** (D-025 core FATTO,
> +D-038 drag-reorder, +D-039 drift Prisma). Baseline test da non regredire: ui-kit 70 · web-staff 191 · api unit 134 ·
> api e2e 182 · typecheck pulito.
>
> MACCHINA: `git fetch --all --prune`. ⚠️ **PRIMA COSA (con mio ok):** FF-merge del branch di docs su `main` + push
> (`git checkout main && git merge --ff-only feat/stabilimento-configura-struttura && git push origin main`) così spec/
> piano/registro/handoff sono su `main`; poi branch nuovo per lo Slice 1. ⚠️ Ribuilda i contracts dopo checkout
> (`corepack pnpm --filter @coralyn/contracts build`). ⚠️ Rebuild container prima di testare in dev
> (`docker compose --profile full up -d --build api web`; stale=404). ⚠️ `seed.ts` con `DEV_ADMIN_PASSWORD=coralyn-admin-8473`.
> DB `localhost:5433` (coralyn_dev/test); login `admin@coralyn.dev`/`coralyn-admin-8473`; web Docker `8080`; Vite dev che
> ripiega su `5174` se 5173 è occupata (naviga diretto). Push su `main` solo con mio ok. Per `docker compose exec` con
> path assoluti usa `MSYS_NO_PATHCONV=1`. ⚠️ Attento al drift Prisma su `Rate_signature_key` (D-039) se rigeneri una
> migrazione.
>
> PRIMA COSA (ADR-0009): leggi `docs/handoff/2026-07-04-configura-spec-piano-e-prossimi.md` (git §0, stato §1, prossimo
> §2, mock §3, ADR/D-0xx §4, gotcha §5, ancore §6).
>
> TASK: **eseguire lo Slice 1** di `Configura` dal piano
> `docs/superpowers/plans/2026-07-04-stabilimento-configura-slice1-struttura-tipologie.md`, **subagent-driven** (un
> implementer per layer + review a due stadi, un commit per layer): **contracts** (SectorKind + Structure DTO +
> Create/UpdateUmbrellaTypeInput) → **api** (migrazione `Sector.kind` + `GET /establishment/structure` admin-only + CRUD
> `/establishment/umbrella-types` con guardia 409 + unit/e2e; ⚠️ RolesGuard globale → ri-esegui tutta la suite api) →
> **web-staff** (rotta `/establishment/structure` admin-gated + vista albero read-only + card Tipologie CRUD + bottone
> «Configura») → **verifica LIVE** → **presentami lo stato e attendi conferma**. Poi `superpowers:writing-plans` per lo
> **Slice 2** (Settori + File) dalla stessa spec → subagent-driven → presenta. Poi **Slice 3** (Ombrelloni + Genera). A
> Configura completo: FF-merge su `main` + push con mio ok, aggiorna handoff.
