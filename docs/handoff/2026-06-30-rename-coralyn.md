# Handoff 2026-06-30 — Stato del progetto + delega: migrazione `Driftly → Coralyn`

> Documento di consegna per il prossimo agente/sessione. La sessione corrente ha
> saturato il contesto. Qui c'è **lo stato attuale** (cosa è stato fatto e verificato)
> e il **task delegato** (rename completo del progetto), con strati, verifiche e insidie.

---

## 1. Stato attuale del repo (`main`)

Tutto verificato e su `main` (pushato). Test verdi: **ui-kit 14/14 · web-staff 40/40 · api unit 6/6 · api e2e 16/16**; typecheck + build OK.

Commit chiave recenti:
- `19d98f4` merge modulo **identità & auth** (JWT) — login/`me`, `JwtAuthGuard` globale, `Utente` (no RLS, ADR-0026), argon2id, migrazione `utente`.
- `98f3459` Docker: rende eseguibile l'auth nel container (argon2 rebuild, seed `NODE_ENV=development`, env JWT).
- `cb5346c` **FE login reale (JWT) end-to-end** + provisioning su invito (ADR-0028).
- `5467e18` allineamento riferimenti residui all'header tenant rimosso.
- `<questo handoff>`.

Cosa è completo:
- **Redesign FE Coralyn** (app-shell, ui-kit, tutte le viste) — su `main`.
- **Docker full-stack**: `docker-compose.yml` con profilo `full` (db+api+web). `apps/api/Dockerfile` (NestJS; `prisma generate` PRIMA di `nest build`; `pnpm rebuild argon2`), `docker-entrypoint.sh` (`prisma migrate deploy` + seed con `NODE_ENV=development`), `apps/web-staff/Dockerfile` (build Vite → nginx, proxy `/api` e `/health`). Override locale gitignored `docker-compose.override.yml` mappa il DB su host **5433** (la 5432 è occupata da un altro progetto).
- **Auth reale**: backend `apps/api/src/identita/*`; FE cablato (TDD) — `lib/authToken.ts` (token in `localStorage` key `coralyn.auth.token`), `lib/http.ts` (`Authorization: Bearer` + `ApiError`), `stores/session.ts` (`login/logout/rehydrate`), `main.ts` (rehydrate via `/me` all'avvio), `LoginView.vue` reale, `useClienti`/`useMappaGiorno` senza `tenantId` (tenant dal JWT).
- **Provisioning** deciso ([ADR-0028](../architecture/decisions/0028-provisioning-tenant.md)): fornitore + inviti, **no self-registration**. `RegistrazioneView.vue` è una pagina informativa "attivazione su invito".
- Coerenza doc↔codice verificata (audit): README/ADR allineati.

⚠️ **Working tree non pulito**: `docker-compose.yml` ha una modifica **non committata** voluta dall'utente — credenziali admin dev impostate a **`admin@coralyn.dev` / `coralyn-admin-8473`**. Da **assorbire nel rename** (sono già i valori target Coralyn).

---

## 2. Task delegato: rename completo `Driftly → Coralyn`

**Decisione dell'utente:** migrazione **totale** — codice, config, **identificatori DB** (richiede `down -v`), **tutti i doc inclusi gli snapshot storici** (plan/handoff/spec datati), + un **ADR che risolve D-017** (brand = Coralyn). Mantenere la narrativa storica "ex-codename Driftly" **solo** dove spiega il perché (README + ADR di risoluzione D-017).

Contesto: `Driftly` era il codename provvisorio (D-017, brand/dominio rimandati); il brand reale è **Coralyn** (già nella UI, cartella repo e remote `devfrx/coralyn`). Resta da migrare lo scope pacchetti `@driftly/*`, gli identificatori DB e la documentazione.

**Raggio d'impatto misurato:** ~**420** occorrenze di `driftly` — codice **82** (44 file), config **30**, doc **309**.

### Eseguire a strati, verificando ad ogni strato

**Strato A — scope pacchetti `@driftly/*` → `@coralyn/*`**
- 5 `package.json`: `@driftly/root|api|web-staff|contracts|ui-kit` → `@coralyn/*`.
- Tutti gli import `@driftly/contracts` e `@driftly/ui-kit` (apps + packages).
- Riferimenti in `tsconfig*`, `jest.config.ts`, `vitest.config.ts`, scripts root (`build:contracts`), `.claude/launch.json` (`--filter @driftly/web-staff`).
- Comandi `pnpm --filter @driftly/...` ovunque: **Dockerfile api/web**, `docker-entrypoint.sh`, README, docs.
- Rigenerare lockfile: `pnpm install`.
- ⚠️ **NON** toccare i nomi delle *dipendenze* esterne (`argon2`, `@prisma/client`, `@nestjs/*`, `@tanstack/*`, `@iconify-json/*`, `@fontsource/*`, ecc.) né le chiavi `allowBuilds` in `pnpm-workspace.yaml` (sono pacchetti npm di terzi). Toccare **solo** lo scope `@driftly/*`.
- I pacchetti sono `private` → `@coralyn/*` è sicuro (nessuna pubblicazione npm).
- **Verifica:** `pnpm -r build`, `pnpm --filter @coralyn/web-staff typecheck`, test ui-kit + web-staff + api unit.

**Strato B — infra / identificatori DB** (richiede wipe volume)
- `docker-compose.yml`: container `driftly-db|api|web` → `coralyn-*`; volume `driftly-pgdata` → `coralyn-pgdata`; `POSTGRES_USER/PASSWORD/DB` (`driftly`/`driftly_dev` → `coralyn`/`coralyn_dev`); `DATABASE_URL` (`driftly_app`→`coralyn_app`, `driftly_dev`→`coralyn_dev`); healthcheck (`driftly_app`→`coralyn_app`); `DEV_ADMIN_*` (già `coralyn` nella modifica non committata).
- `init/01-app-role.sql`: ruolo `driftly_app`→`coralyn_app`; db `driftly_dev`/`driftly_test`→`coralyn_dev`/`coralyn_test`; owner.
- `.env.example` (DATABASE_URL).
- `apps/api/prisma/seed.ts`: default `DEV_ADMIN_EMAIL` `admin@driftly.dev`→`admin@coralyn.dev` (allineare al compose). `DEV_STABILIMENTO_ID` invariato.
- **Backend e2e**: env/helper che usano `driftly_app|dev|test` → `coralyn_*`; rigenerare il `.env.test` locale (gitignored) coi nuovi nomi.
- **FE test**: `apps/web-staff/src/mocks/server.ts` `MOCK_ADMIN.email` `admin@driftly.dev`→`admin@coralyn.dev`; controllare `session.spec.ts` / `LoginView.spec.ts` che usano quell'email/`driftly-admin`.
- Override locale: la **porta host 5433** resta (5432 occupata); il nome servizio `db` non cambia.
- ⚠️ **`docker compose --profile full down -v`** prima di ricostruire coi nuovi nomi (il volume vecchio ha i ruoli/DB `driftly_*`).
- **Verifica:** `down -v && up -d --build`; login `admin@coralyn.dev` / `coralyn-admin-8473` → `/api/clienti` 200 con Bearer / 401 senza; `/api/auth/me` OK; api e2e contro `coralyn_test`.

**Strato C — brand strings**
- `apps/web-staff/vite.config.ts`: manifest `name` `'Driftly · Staff'`→`'Coralyn · Staff'`, `short_name` `'Driftly'`→`'Coralyn'`.
- `apps/web-staff/index.html`: `<title>` (`Driftly · Staff`→`Coralyn · Staff`).
- Eventuali stringhe "Driftly" residue nella UI (i colori PWA sono già Coralyn).
- **Verifica:** build.

**Strato D — documentazione + risoluzione D-017**
- Nuovo **ADR-0029** (prossimo numero libero) che **risolve D-017**: brand = Coralyn, scope pacchetti `@coralyn/*`, identificatori infra `coralyn_*`. **Rimuovere D-017** da `deferred.md` (con rimando all'ADR — è la convenzione: una voce affrontata diventa ADR e si toglie).
- `README.md`: riscrivere il blocco "codename Driftly provvisorio" → Coralyn; aggiornare ogni `@driftly`→`@coralyn`, comandi, nomi container/porte.
- Sweep di **tutti** i doc (309 match): `@driftly`→`@coralyn`, `driftly_app|dev|test`→`coralyn_*`, container/volume, "Driftly"→"Coralyn" — **inclusi** plan/handoff/spec storici (scelta utente: full). Conservare la narrativa "ex-codename Driftly" solo dove serve a spiegare la storia (README + ADR D-017).
- Aggiornare l'indice ADR in `docs/architecture/README.md`.

### Insidie note (dalla sessione corrente)
- `prisma generate` **prima** di `nest build` (Dockerfile), altrimenti `TS7006`.
- `argon2` è nativo → `pnpm rebuild argon2` nel Dockerfile (con `--ignore-scripts` il binding non si installa, `require('argon2')` esplode a runtime).
- Il seed ha una guardia `NODE_ENV=production` → l'entrypoint seeda con `NODE_ENV=development`.
- Host DB su **5433** (override locale gitignored), non 5432.
- Git Bash storpia i path di `docker exec -w` → usare PowerShell o `MSYS_NO_PATHCONV=1`.
- Auth mockata **solo** nei test (`mocks/server.ts`); in dev il login va al backend reale via proxy Vite (`/api`→`:3000`).
- `.gitattributes` forza **LF** su `*.sh`/`Dockerfile`/`nginx.conf` — mantenere.
- `packageManager` pinnato `pnpm@11.9.0`, `engines.node >=22`.
- `localStorage` key è già `coralyn.auth.token` — nessun cambio.

### Definition of Done
- `pnpm -r build` OK; typecheck OK; test ui-kit 14 / web-staff 40 / api unit 6 / api e2e 16 verdi (contro `coralyn_test`).
- `docker compose --profile full down -v && up -d --build`: db/api healthy, web up; login `admin@coralyn.dev` end-to-end OK.
- `rg -i "driftly"` sul repo (escl. `node_modules`/`dist`) = **0 residui non voluti** (a parte la narrativa storica intenzionale).
- D-017 rimosso da `deferred.md`; ADR-0029 presente e linkato nell'indice.

### Operatività suggerita
Branch dedicato `chore/rename-coralyn`; commit per strato con verifica; poi PR/merge su `main`. La baseline (login + coerenza) è già su `main`.

---

## 3. File di riferimento
- **Infra:** `docker-compose.yml`, `docker-compose.override.yml` (gitignored, locale), `init/01-app-role.sql`, `apps/api/Dockerfile`, `apps/api/docker-entrypoint.sh`, `apps/web-staff/Dockerfile`, `apps/web-staff/nginx.conf`, `.env.example`, `.gitattributes`.
- **Pacchetti:** `package.json` (root) + `apps/api`, `apps/web-staff`, `packages/contracts`, `packages/ui-kit`.
- **Auth/login:** `apps/api/src/identita/*`, `apps/api/prisma/{schema.prisma,seed.ts}`, `apps/web-staff/src/{lib/authToken.ts,lib/http.ts,stores/session.ts,main.ts,features/auth/*,mocks/server.ts}`.
- **Doc:** `README.md`, `docs/architecture/{README.md,deferred.md,decisions/*}`, `docs/design/*`, `docs/specs/*`, `docs/plans/*`, `docs/handoff/*`.
