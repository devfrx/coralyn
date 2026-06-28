# Delega — Scheda Cliente: piano Backend + implementazione Frontend (Incremento 1)

> **Cos'è questo documento.** Messaggio di delega **autosufficiente** per una **sessione dedicata** che
> (A) **genera ed esegue il piano Backend** e (B) **implementa il Frontend** della *scheda cliente a 360°*,
> limitatamente all'**Incremento 1: anagrafica ricca end-to-end** (`Cliente` += `telefono/email/note`).
> Il design è **approvato e su `main`**; qui c'è tutto il necessario, inclusa la mappa reale di `apps/api`.

---

## 0. Il tuo compito in una frase

Portare l'anagrafica del `Cliente` da `{nome,cognome}` a `{nome,cognome,telefono,email,note}` **end-to-end**
e dare allo staff una **scheda cliente** (`/clienti/:id`) con header di sintesi, anagrafica editabile e
sezioni "in arrivo" come placeholder — **backend prima** (schema + endpoint + validazione + RLS + e2e),
**frontend poi** (eseguendo il piano FE già scritto). Niente auth (l'header tenant dev resta).

## 1. Skill e metodo (obbligatorio)

- A inizio sessione applica **`superpowers:using-superpowers`**.
- **Backend**: usa **`superpowers:writing-plans`** per generare il piano BE (TDD, task bite-sized) e poi
  **`superpowers:subagent-driven-development`** o **`executing-plans`** per eseguirlo.
- **Frontend**: il piano è **già scritto** — esegui [il piano FE](../plans/2026-06-28-scheda-cliente-fe.md)
  con lo stesso metodo (subagent-driven o executing-plans).
- **TDD** dove tocchi logica; chiudi con **`superpowers:verification-before-completion`** (e2e BE verdi +
  component FE verdi + scheda funzionante nel browser sul backend reale).
- **Decision rubric [ADR-0002]**: scelte motivate, raccomandazioni nette. **ADR-0023** per la modellazione
  dei contatti; **D-024** per la privacy; **D-022** viene affrontato (validazione) → va rimosso dal deferred.
  Lingua: codice EN, dominio/UI IT. Commit atomici, messaggi EN, ognuno col trailer
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Comunica in italiano.**

## 2. Stato attuale (punto di partenza)

- Branch **`main`**, working tree pulita. Node 24, pnpm 11.9.0, Docker. OS Windows (PowerShell + Bash).
- **Design approvato e su `main`**:
  - **Spec**: [docs/specs/2026-06-28-scheda-cliente-design.md](../specs/2026-06-28-scheda-cliente-design.md)
  - **Piano FE** (10 task TDD, MSW-first): [docs/plans/2026-06-28-scheda-cliente-fe.md](../plans/2026-06-28-scheda-cliente-fe.md)
- **Backend Plan 1 su `main`** (`apps/api`): NestJS, `GET/POST /api/clienti` isolati per tenant via header
  `X-Stabilimento-Id` + **RLS** PostgreSQL. `Cliente {id, stabilimentoId, nome, cognome}`.
- **Frontend su `main`** (`apps/web-staff`): Vue 3 + Vite + TanStack Query + Pinia + MSW; proxy Vite già
  corretto (`/api` intatto, [ADR-0022](../architecture/decisions/0022-base-path-api.md)); `/api/mappa` mock.
- **Numeri liberi confermati** (2026-06-28): prossimo **ADR-0023**; prossimo deferred **D-024**.

## 3. Documenti da leggere (prima di toccare codice)

1. Questo handoff. 2. La **spec** e il **piano FE** (§2). 3. [data-model](../design/data-model.md)
   (entità `Cliente`, relazioni — `contatti` previsto come `json`, noi divergiamo: §A.6/ADR-0023) e
   [glossary](../architecture/glossary.md). 4. [ADR-0022](../architecture/decisions/0022-base-path-api.md)
   (`/api` + `/health` a root), [ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md) (RLS).
5. [deferred](../architecture/deferred.md): **D-022** (validazione input — la affronti),
   **D-024** (privacy — la apri).

---

# PARTE A — Backend (`apps/api`): genera il piano, poi implementa

**Mappa reale di `apps/api`** (già esplorata — path e firme esatti, da seguire):

### A.1 Bootstrap — [`src/main.ts`](../../apps/api/src/main.ts)
```ts
app.setGlobalPrefix('api', { exclude: ['health'] });
await app.listen(process.env.PORT ?? 3000);
```
Tutte le rotte sotto `/api`; `/health` a root. **Qui** andrà `app.useGlobalPipes(new ValidationPipe(...))`.

### A.2 Controller — [`src/clienti/clienti.controller.ts`](../../apps/api/src/clienti/clienti.controller.ts)
```ts
@Controller('clienti')
export class ClientiController {
  @Get() list(): Promise<ClienteDTO[]> { return this.clienti.list(); }
  @Post() create(@Body() body: { nome: string; cognome: string }): Promise<ClienteDTO> { return this.clienti.create(body); }
}
```
Da aggiungere: `@Get(':id')` → `getById(@Param('id') id)`, `@Patch(':id')` → `update(@Param('id') id, @Body() dto)`.

### A.3 Service — [`src/clienti/clienti.service.ts`](../../apps/api/src/clienti/clienti.service.ts)
```ts
async list(): Promise<ClienteDTO[]> {
  const tenantId = this.tenant.require();
  const rows = await this.prisma.forTenant(tenantId, (tx) => tx.cliente.findMany());
  return rows.map((c) => ({ id: c.id, nome: c.nome, cognome: c.cognome }));
}
async create(input): Promise<ClienteDTO> {
  const tenantId = this.tenant.require();
  const c = await this.prisma.forTenant(tenantId, (tx) => tx.cliente.create({ data: { stabilimentoId: tenantId, ...input } }));
  return { id: c.id, nome: c.nome, cognome: c.cognome };
}
```
**Pattern obbligatorio:** `this.tenant.require()` (→ 400 se header mancante) **+** `this.prisma.forTenant(tenantId, tx => …)` (RLS). **Estendi la proiezione DTO** a `telefono/email/note` in **tutti** i metodi (mappa `null → undefined`). `getById`: con RLS un cliente di altro tenant **non è visibile** → `findUnique`/`findFirst` ritorna `null` → **lancia `NotFoundException` (404)**. `update`: `tx.cliente.update` su id non visibile fallisce/0 righe → **404**.

### A.4 Tenant + RLS (non toccare; usa così)
- [`src/tenant/tenant-context.ts`](../../apps/api/src/tenant/tenant-context.ts): `require()` → `BadRequestException('Tenant non risolto')` se assente (**400**).
- [`src/tenant/tenant.middleware.ts`](../../apps/api/src/tenant/tenant.middleware.ts): legge `X-Stabilimento-Id`, valida UUID, set `req.tenantId`. Applicato a `*` in [`src/app.module.ts`](../../apps/api/src/app.module.ts).
- [`src/prisma/prisma.service.ts`](../../apps/api/src/prisma/prisma.service.ts):
```ts
async forTenant<T>(tenantId, fn) {
  return this.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    return fn(tx);
  });
}
```

### A.5 Schema & seed
- [`prisma/schema.prisma`](../../apps/api/prisma/schema.prisma): `Cliente {id, stabilimentoId, nome, cognome, …}`. **Aggiungi** `telefono String?`, `email String?`, `note String?` (nullable, additivo).
- Migration: `pnpm --filter @driftly/api exec prisma migrate dev --name cliente_contatti` (in dev; **porta DB 5433** localmente — vedi §C). RLS resta valida (policy su `stabilimentoId`, non sui nuovi campi).
- Seed: [`prisma/seed.ts`](../../apps/api/prisma/seed.ts) upsert dello `Stabilimento` dev `00000000-0000-0000-0000-000000000001` (idempotente).

### A.6 Validazione input (affronta **D-022**)
Oggi **non c'è** validazione (niente `class-validator`, niente `ValidationPipe`; il body è letto untyped).
- Installa `class-validator` + `class-transformer` in `apps/api`.
- Crea i DTO class: `CreateClienteDto { @IsString nome; @IsString cognome; @IsOptional @IsString telefono?; @IsOptional @IsEmail email?; @IsOptional @IsString note?; }` e `UpdateClienteDto` (tutti `@IsOptional`).
- `main.ts`: `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))`.
- **Attenzione**: con `whitelist:true` campi extra vengono scartati — verifica che gli **e2e esistenti** restino verdi. Email malformata → **400**.
- Esito: **D-022 risolto** → rimuovilo da [deferred.md](../architecture/deferred.md) con riferimento all'implementazione.

### A.7 E2E — [`test/clienti.e2e-spec.ts`](../../apps/api/test/clienti.e2e-spec.ts)
Jest + supertest; setup crea due Stabilimenti `s1`/`s2`. Pattern da copiare per i nuovi endpoint:
```ts
await request(app.getHttpServer()).post('/api/clienti').set('X-Stabilimento-Id', s1).send({ nome:'Mario', cognome:'Rossi' }).expect(201);
const r = await request(app.getHttpServer()).get('/api/clienti').set('X-Stabilimento-Id', s1).expect(200);
```
Aggiungi: `GET /:id` (200 per s1; **404** per s2), `PATCH /:id` (aggiorna; **404** cross-tenant; email malformata → **400**), POST coi nuovi campi (ritornati nel DTO). Run: `pnpm --filter @driftly/api test:e2e`.

### A.8 ADR-0023 + data-model + D-024
- **ADR-0023** (`docs/architecture/decisions/0023-contatti-cliente-colonne-tipizzate.md`): contatti come **colonne tipizzate** (`telefono`, `email`) anziché `json contatti` — motiva (validazione, indici, query); aggiorna [data-model](../design/data-model.md) (`Cliente`: da `json contatti` a `telefono`/`email`/`note`).
- **D-024** in [deferred.md](../architecture/deferred.md): cancellazione/anonimizzazione del `Cliente` quando legato a `Prenotazione` (GDPR); in questo incremento **niente DELETE**.

**Scheletro del piano BE** (dettaglialo TDD con `writing-plans`): (1) contracts additivo §B.1 — *una volta sola*; (2) schema + migration; (3) `GET /:id` + e2e; (4) `POST` esteso + e2e; (5) `PATCH /:id` + e2e; (6) validazione + e2e (D-022); (7) ADR-0023 + data-model + D-024. Commit atomico per task.

---

# PARTE B — Frontend (`apps/web-staff`): esegui il piano già scritto

Esegui **[docs/plans/2026-06-28-scheda-cliente-fe.md](../plans/2026-06-28-scheda-cliente-fe.md)** task-per-task (TDD, MSW). Punti di attenzione:

### B.1 Contracts (confine condiviso — **una volta sola**)
Il **Task 1 del piano FE** estende `@driftly/contracts` (`ClienteDTO` += `telefono/email/note`; `CreaClienteInput`, `ModificaClienteInput`). **Lo stesso BE consuma questi tipi** (proiezione DTO, DTO class di validazione). Falla **una volta** all'inizio (la useranno entrambi); se inizi dal BE, considera il Task 1 FE già fatto.

### B.2 Esecuzione
- Hooks `useCliente(id)` / `useModificaCliente(id)`; mock MSW `GET/PATCH /api/clienti/:id` ([server.ts](../../apps/web-staff/src/mocks/server.ts), **solo test**); `ClienteDettaglioView` (header + anagrafica editabile + placeholder "in arrivo"); rotta `/clienti/:id` (`props:true`); righe lista linkate.
- **Non rompere** i mock MSW (test deterministici, `onUnhandledRequest:'error'`); `/api/mappa` resta mock.
- Verifica: `pnpm --filter @driftly/web-staff test` + `typecheck` + `pnpm lint`.

---

## C. Avvio stack & integrazione runtime (evidenza finale)

```bash
docker compose up -d                  # DB; porta 5433 localmente (override gitignored), 5432 altrove
# migra + seed (inietta DATABASE_URL; dotenv-cli può fallire il wrapping su Win — meglio settare l'env):
#   PowerShell: $env:DATABASE_URL='postgresql://driftly_app:driftly_app@localhost:5433/driftly_dev?schema=public'
pnpm --filter @driftly/api exec prisma migrate deploy
pnpm --filter @driftly/api exec prisma db seed
pnpm --filter @driftly/api exec nest start          # backend :3000 (UNA istanza)
pnpm --filter @driftly/web-staff dev                # frontend :5173 (UNA istanza)
```
**Verifica browser** (`http://localhost:5173`): lista clienti → click su una riga → **scheda `/clienti/:id`** dal backend reale; modifica telefono/email/note → `PATCH` reale → rilettura aggiornata; sezioni "in arrivo" come placeholder; `/api/mappa` ancora mock. Sanity: `curl -H "X-Stabilimento-Id: 00000000-0000-0000-0000-000000000001" http://localhost:5173/api/clienti/<id>` → 200.

> ⚠️ **Gotcha runtime** (appreso 2026-06-28): dopo aver toccato `vite.config.ts` riavvia il dev server **da zero**; **non tenere più istanze `pnpm dev`** (porte 5173/5174/5175 confondono). Una sola istanza, riavviata pulita.

## D. Sequenza, branch, ownership

1. **Contracts** additivo (una volta). 2. **Backend**: piano + implementazione (schema→endpoint→validazione→e2e→ADR/data-model/deferred). 3. **Frontend**: esegui il piano FE. 4. **Integrazione** runtime nel browser.
- Branch: `feat/scheda-cliente` (o `feat/scheda-cliente-be` + `feat/scheda-cliente-fe`), merge a `main` in fast-forward. **Possiedi** `apps/api`, `apps/web-staff`, `packages/contracts` (additivo). `/api/mappa`, mappa, auth: **non toccare**.

## E. Definition of Done

- `Cliente` += `telefono/email/note` end-to-end, **isolato per tenant** (e2e: 404 cross-tenant su `/:id` e `PATCH`; 400 senza header; 400 email malformata).
- Scheda `/clienti/:id` nel browser legge/scrive dal **backend reale**; sezioni "in arrivo" come placeholder; lista linka al dettaglio.
- **Verde**: e2e BE (`test:e2e`), component FE (`test`), `typecheck`, `pnpm lint`.
- **ADR-0023** redatto; [data-model](../design/data-model.md) aggiornato; **D-024** aperto; **D-022** rimosso (risolto).
- Tutto committato (trailer), working tree pulita; `MEMORY.md` aggiornato.

## F. Trappole

- **`forTenant` su OGNI query** (anche `getById`/`update`): senza, la RLS non filtra o la query gira fuori contesto.
- **404 corretti**: cross-tenant su `/:id`/`PATCH` deve dare **404** (RLS rende il record invisibile → `null`/0 righe → `NotFoundException`), non 500.
- **`ValidationPipe(whitelist:true)`** può scartare campi/alterare POST esistente → rilancia gli e2e già presenti.
- **Proiezione DTO**: includi i nuovi campi in *tutti* i metodi del service, altrimenti il FE non li riceve pur essendo in DB.
- **Backend/DB giù** → la scheda mostra errore (apiFetch lancia su `!res.ok`): avvia DB+backend prima.
- **Contracts una volta sola** (confine BE/FE); **non** rimuovere i mock MSW dei test FE.
