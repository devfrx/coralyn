# Delega — Prossimo slice Backend del Core: `identità & auth` (poi `mappa`)

> **Cos'è questo documento.** Messaggio di delega **autosufficiente** per una **sessione dedicata**
> che continua il **backend** dopo il Plan 1 (Core Foundation, su `main`). Il prossimo modulo per
> **dipendenza** è **`identita`** (utenti staff, login, JWT, risoluzione tenant): l'auth è il
> prerequisito di tutto il resto. Subito dopo: **`mappa`**. Tutto ciò che serve è qui o nei link.

---

## 0. Il tuo compito in una frase

Progettare ed eseguire il modulo **`identita`**: modello `Utente`, login, emissione **JWT**, e
**sostituzione** del `TenantMiddleware` provvisorio (header `X-Stabilimento-Id`) con una **guard JWT**
che ricava il tenant dal token e imposta `req.tenantId`. I moduli di dominio (`clienti`) e
`TenantContext`/`forTenant` **non cambiano**. Poi predisponi `mappa`. **Niente plan scritto esiste
ancora**: lo produci tu (brainstorming → spec → plan → implementazione).

## 1. Skill e metodo (obbligatorio)

- A inizio sessione: **`superpowers:using-superpowers`**.
- C'è **design** da fare (stack auth, forma del token, ruoli, superuser) → **`superpowers:brainstorming`**,
  poi **`superpowers:writing-plans`**, poi esegui con **`superpowers:subagent-driven-development`** (o
  `executing-plans`), un task alla volta. **TDD** dove prescritto. Chiudi con
  **`superpowers:verification-before-completion`**: nessun "fatto" senza l'output dei test.
- **Decision rubric [ADR-0002]** (professionalità, convenzioni, modularità, zero debito), raccomandazioni
  nette. **Un ADR per ogni decisione architetturale** (prossimo libero: **0024**; l'auth ne richiederà
  almeno uno: libreria JWT, stateless vs sessione, forma del token, hashing password). Rinvii in
  `deferred.md`. Lingua: codice EN, dominio IT, docs IT. Commit atomici col trailer
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Comunica in italiano.**

## 2. Stato attuale (il tuo punto di partenza)

- Branch **`main`**, working tree pulita. Node 24, pnpm 11.9.0, Docker 29, Windows (PowerShell + Bash).
- **Plan 1 (Core Foundation) + Scheda Cliente Incremento 1 FATTI e su `main`** — `apps/api`:
  - NestJS, `GET /health` (root); **global prefix `/api`** con `/health` escluso (ADR-0022).
  - Modulo `clienti` (esteso nell'Incremento 1, **ADR-0023**): `GET /api/clienti`, **`GET /api/clienti/:id`**
    (404 cross-tenant), `POST /api/clienti`, **`PATCH /api/clienti/:id`** (404 cross-tenant) — tutti isolati per tenant.
  - **Validazione input GIÀ ATTIVA**: `app.useGlobalPipes(new ValidationPipe({ whitelist, transform }))` in
    `main.ts` + DTO `class-validator` (`src/clienti/dto/` con `normalize` `''→null`). Email malformata → **400**,
    campi extra scartati. **I tuoi DTO auth (login, ecc.) saranno validati automaticamente.**
  - PostgreSQL via Docker, ruolo applicativo **non-superuser** `coralyn_app` (la RLS lo richiede).
  - Prisma: modelli `Stabilimento`, `Cliente {…, telefono?, email?, note?}`; migrazioni `init` + `rls` +
    `cliente_contatti`; seed dev (`Stabilimento` 00..001).
  - **RLS multi-tenant**: `PrismaService.forTenant(tenantId, tx => ...)` imposta la GUC
    `app.current_tenant` in transazione; policy `tenant_isolation` su `Cliente` (`ENABLE`+`FORCE`).
  - **Tenant provvisorio**: `TenantMiddleware` legge l'header `X-Stabilimento-Id` e setta `req.tenantId`;
    `TenantContext.require()` lo espone (400 se assente).
- Avvio backend: DB up (porta **5433** locale via override gitignored), `prisma migrate deploy`, poi
  `nest start` (bundle in `apps/api/dist/src/main.js`).

## 3. Documenti da leggere (in quest'ordine, prima di toccare codice)

1. **Questo handoff.**
2. [Plan 1 — Core Foundation](../plans/2026-06-28-core-foundation.md), in particolare **"Note per i piani
   successivi"** (l'header è provvisorio; ogni nuova tabella tenant-scoped segue il pattern RLS).
3. **Spec madre del Core**: [`docs/specs/2026-06-27-core-operativo-design.md`](../specs/2026-06-27-core-operativo-design.md)
   — §6 "Moduli del Core" definisce l'ordine: `core → identita → mappa → clienti → catalogo →
   prenotazioni → audit`. **Il prossimo è `identita`.**
4. [data-model](../design/data-model.md) — entità e scoping tenant.
5. ADR rilevanti: **0015** (superuser di piattaforma + AuditLog + osservabilità), **0010** (RLS),
   **0007/0008** (stile/stack), **0023** (contatti tipizzati + **pattern DTO/validazione** da riusare),
   e per i passi dopo `identita`: **0005/0014/0016** (mappa), **0006/0011/0012/0013**
   (prenotazioni/pricing/abbonamenti/slot).
6. **Esempio di slice incrementale già eseguito** (pattern da imitare per endpoint `:id` + DTO + validazione +
   e2e + RLS): spec [scheda-cliente](../specs/2026-06-28-scheda-cliente-design.md), piani
   [BE](../plans/2026-06-29-scheda-cliente-be.md) / [FE](../plans/2026-06-28-scheda-cliente-fe.md), e il
   codice in `apps/api/src/clienti/` (controller con `:id`, DTO `class-validator`, `normalize.ts`, service con
   proiezione `null→undefined` e **404 cross-tenant** via RLS).

## 4. Cosa cambia con l'auth (e cosa NON cambia)

Il design provvisorio del Plan 1 è stato pensato per questo passaggio:

- **Sostituisci** `apps/api/src/tenant/tenant.middleware.ts` (legge l'header) con una **guard/strategy
  JWT** che valida il token, ne estrae il tenant (e il ruolo) e imposta `req.tenantId`.
- **INVARIATI**: `TenantContext` (legge `req.tenantId` a prescindere da come è stato settato),
  `PrismaService.forTenant`, e tutti i moduli di dominio (`ClientiService` ecc.). **Non toccarli.**
- `Ruolo` è già in [contracts](../../packages/contracts/src/index.ts): `Admin | Staff | Superuser`.
- **Superuser di piattaforma** (ADR-0015): ruolo cross-tenant; il suo accesso a `Stabilimento` (non
  tenant-scoped) e ai dati va progettato qui. Attenzione: i superuser **bypassano la RLS solo se sono
  superuser PostgreSQL** — NON lo sono; l'accesso cross-tenant va modellato a livello applicativo, non
  rimuovendo la RLS.

## 5. Il pattern RLS da generalizzare (rischio di correttezza)

Ogni nuova tabella **tenant-scoped** deve: avere `stabilimentoId`, abilitare RLS con la **stessa policy**,
ed essere usata **solo** via `forTenant`. Migrazione di riferimento (`apps/api/prisma/migrations/<ts>_rls/`):

```sql
ALTER TABLE "<Tabella>" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "<Tabella>" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "<Tabella>"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "stabilimentoId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "stabilimentoId");
```

> **Usa `nullif(..., '')`** (non il cast diretto): con il connection pooling la GUC, dopo essere stata
> impostata, torna come **stringa vuota** sulla connessione riusata; `''::uuid` lancia `22P02`. Senza
> tenant → NULL → zero righe. (È la lezione del Plan 1; vedi commit della migrazione `rls`.)

**Da fare nel Piano 3**: estrarre questo in un **pattern/helper riutilizzabile** (generatore di migrazione
o middleware Prisma) invece di replicarlo a mano per ogni tabella.

**Caso speciale `Utente`/`AuditLog`**: hanno `stabilimento_id` **nullable** (null = superuser/evento
globale). La policy sopra **non basta** così com'è (un null non deve né bloccare il superuser né far
trapelare dati cross-tenant). **Progetta la policy con cura** (ADR dedicato) quando modelli queste tabelle.

## 6. Entità ancora da modellare (oltre `Stabilimento`+`Cliente`)

> `Cliente` è già stato **esteso** nell'Incremento 1 (anagrafica ricca `telefono/email/note`, ADR-0023);
> resta da modellare il resto del dominio. Da [data-model](../design/data-model.md) (tenant-scoped salvo nota):

| Modulo | Entità | Note di scoping |
|---|---|---|
| `identita` | `Utente` | `stabilimento_id` **nullable** (null per superuser) |
| `mappa` | `Settore` (scoped), `Fila`, `Ombrellone`, `Tipologia` (scoped) | `Fila`/`Ombrellone` scoped via FK; `Ombrellone.etichetta`=numero fisico reale; `Tipologia` ortogonale (ADR-0016) |
| `catalogo` | `Pacchetto`, `Stagione`, `Listino`, `Tariffa`, `Fascia` | pricing engine (ADR-0006/0013) |
| `prenotazioni` | `Prenotazione`, `Lista_attesa` | incasso **inline** su `Prenotazione` (ADR-0011, NON entità `Pagamento`); rinnovo via self-FK (ADR-0012); anti-overlap per slot (Ombrellone, data, Fascia) |
| `audit` | `AuditLog` | `stabilimento_id` nullable (eventi globali) |

Il FE **mocka già `/api/mappa`** con `MappaGiornoDTO` (in `contracts`): quando implementi `mappa`,
**conforma il backend a quel DTO** (proposta FE da allineare col dominio — additivo su contracts).

## 7. Deferred backend da conoscere (`docs/architecture/deferred.md`)

- ~~**D-022** (validazione input)~~ → **RISOLTO** da ADR-0023 (`ValidationPipe` globale + DTO `class-validator`).
  Già attivo: i tuoi DTO auth sono validati automaticamente — non rifarlo, riusa il pattern in `src/clienti/dto/`.
- **D-023** — least-privilege del ruolo DB: `coralyn_app` ha `CREATEDB` solo per lo shadow DB di
  `prisma migrate dev` (dev); in prod (`migrate deploy`) non serve — separare il ruolo o `shadowDatabaseUrl`.
  *(Tocca proprio l'area auth/ruoli DB: valuta se affrontarlo in questo slice.)*
- **D-024** — privacy/GDPR del `Cliente`: cancellazione/anonimizzazione quando sarà legato a
  `Prenotazione`/storico (oggi niente DELETE). Rilevante quando modellerai le relazioni del `Cliente`.
- **D-009** (entità `Pagamento` ricca → modulo Cassa), **D-010** (silo per tenant grande), **D-002**
  (infra SaaS completa), **D-006/D-011/D-013** (waitlist/abbonamenti avanzati).

## 8. Confini e ownership

- Possiedi `apps/api` (e `apps/api/prisma`); editor primario di `packages/contracts` (**solo aggiunte**).
  **NON toccare** `apps/web-staff` né `packages/ui-kit`.
- Branch sequenziali, **niente worktree**: lavora su `main` o brevi `feat/api-*` mergiati a `main`.
- **Scope**: parti da `identita` (auth) — è la dipendenza di tutto. Non saltare a moduli a valle prima che
  l'auth regga. Definisci tu lo scope del plan, senza scope-creep.

## 9. Ambiente & comandi (ereditati dal Plan 1)

```bash
docker compose up -d                                                            # DB su :5433 (override locale)
pnpm dlx dotenv-cli -e .env      -- pnpm --filter @coralyn/api exec prisma migrate dev --name <n>   # dev
pnpm dlx dotenv-cli -e .env.test -- pnpm --filter @coralyn/api exec prisma migrate deploy           # test
pnpm --filter @coralyn/api test                                                 # unit (no DB)
pnpm dlx dotenv-cli -e .env.test -- pnpm --filter @coralyn/api test:e2e         # integrazione+e2e (RLS, API)
```

Trappole RLS (rileggile): app come `coralyn_app` **non-superuser**; `FORCE ROW LEVEL SECURITY`; init
`init/01-app-role.sql` gira **solo alla prima init del volume** (`docker compose down -v` se preesistente);
`.env`/`.env.test` gitignored; il backend serve `/api/*` (prefix) con `/health` a root.

## 10. Definition of Done (per il tuo plan)

La definirai nel plan, ma come minimo: auth funzionante (login → JWT → `req.tenantId` dal token, RLS che
continua a isolare), `TenantMiddleware` sostituito senza modifiche ai moduli di dominio, test (unit + e2e)
verdi, lint pulito, ADR per le decisioni auth, tutto committato. Aggiorna data-model/diagrammi se tocchi il
dominio (ADR-0009) e `MEMORY.md` con il nuovo stato.
