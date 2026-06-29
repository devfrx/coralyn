# Scheda Cliente — Backend Implementation Plan (Incremento 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare `Cliente` da `{nome,cognome}` a `{nome,cognome,telefono,email,note}` end-to-end nel backend `apps/api`: schema+migration additivi, `GET /api/clienti/:id`, `POST` esteso, `PATCH /api/clienti/:id`, validazione input server-side — tutto isolato per tenant (RLS) e coperto da e2e.

**Architecture:** NestJS + Prisma + PostgreSQL RLS. Ogni query passa per `tenant.require()` (→400 se manca l'header `X-Stabilimento-Id`) e `prisma.forTenant(tenantId, tx => …)` (imposta la GUC `app.current_tenant`, le policy RLS filtrano). I contatti sono **colonne tipizzate** nullable (ADR-0023), non un `json`. La proiezione DTO mappa `null → undefined` e include i nuovi campi in *tutti* i metodi del service. La validazione usa `class-validator` + `ValidationPipe({ whitelist, transform })`. TDD via e2e (Jest + supertest).

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL (RLS), `class-validator` + `class-transformer`, Jest + supertest, `@driftly/contracts`.

**Pre-requisito (fuori da questo piano):** `@driftly/contracts` già esteso in modo additivo (`ClienteDTO += telefono?/email?/note?`, `CreaClienteInput`, `ModificaClienteInput`) e buildato. È il confine condiviso FE/BE: fatto una volta sola prima del Task 1.

---

## File Structure

- `apps/api/prisma/schema.prisma` — *modify*: `Cliente += telefono/email/note String?` (additivo, nullable).
- `apps/api/prisma/migrations/<ts>_cliente_contatti/migration.sql` — *create*: generata da `prisma migrate dev`.
- `apps/api/src/clienti/clienti.service.ts` — *modify*: helper `toDTO`, proiezione estesa, `getById`, `update`, `create` esteso.
- `apps/api/src/clienti/clienti.controller.ts` — *modify*: `@Get(':id')`, `@Patch(':id')`, `@Body()` tipizzati con DTO class.
- `apps/api/src/clienti/dto/create-cliente.dto.ts` — *create*: `CreateClienteDto` (class-validator).
- `apps/api/src/clienti/dto/update-cliente.dto.ts` — *create*: `UpdateClienteDto` (tutti opzionali).
- `apps/api/src/main.ts` — *modify*: `app.useGlobalPipes(new ValidationPipe(...))`.
- `apps/api/package.json` — *modify*: dipendenze `class-validator` + `class-transformer`.
- `apps/api/test/clienti.e2e-spec.ts` — *modify*: e2e per nuovi campi, `GET/:id`, `PATCH/:id`, validazione, isolamento tenant.
- `docs/architecture/decisions/0023-contatti-cliente-colonne-tipizzate.md` — *create*: ADR-0023.
- `docs/design/data-model.md` — *modify*: `Cliente` da `json contatti` a `telefono/email/note`.
- `docs/architecture/deferred.md` — *modify*: apri D-024 (privacy), rimuovi D-022 (risolto).

Convenzione: codice EN, dominio/UI IT ([ADR-0003](../architecture/decisions/0003-language-convention.md)). Commit atomici col trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Schema Prisma + migration (contatti additivi)

**Files:**
- Modify: `apps/api/prisma/schema.prisma:16-24`
- Create: `apps/api/prisma/migrations/<ts>_cliente_contatti/migration.sql`

- [ ] **Step 1: Aggiungere le colonne nullable al model `Cliente`**

```prisma
model Cliente {
  id             String       @id @default(uuid()) @db.Uuid
  stabilimentoId String       @db.Uuid
  nome           String
  cognome        String
  telefono       String?
  email          String?
  note           String?
  stabilimento   Stabilimento @relation(fields: [stabilimentoId], references: [id])

  @@index([stabilimentoId])
}
```

- [ ] **Step 2: Generare la migration (dev, DB su porta 5433)**

Imposta l'env (PowerShell), poi genera. Le colonne nullable non rompono i dati esistenti; la RLS resta valida (policy su `stabilimentoId`).

```bash
# PowerShell: $env:DATABASE_URL='postgresql://driftly_app:driftly_app@localhost:5433/driftly_dev?schema=public'
pnpm --filter @driftly/api exec prisma migrate dev --name cliente_contatti
```
Expected: nuova cartella `prisma/migrations/<ts>_cliente_contatti/` con `ALTER TABLE "Cliente" ADD COLUMN ...`; client Prisma rigenerato.

- [ ] **Step 3: Verificare che gli e2e esistenti restino verdi**

Run: `pnpm --filter @driftly/api test:e2e`
Expected: PASS (il test "crea un cliente per s1 e non lo mostra a s2" resta verde).

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add nullable contatti columns to Cliente (telefono, email, note)"
```

---

### Task 2: Proiezione DTO estesa + POST con i nuovi campi

**Files:**
- Modify: `apps/api/src/clienti/clienti.service.ts`
- Modify: `apps/api/src/clienti/clienti.controller.ts:14-17`
- Test: `apps/api/test/clienti.e2e-spec.ts`

- [ ] **Step 1: Scrivere l'e2e che fallisce (POST ritorna i nuovi campi)**

Aggiungi a `test/clienti.e2e-spec.ts` dentro il `describe`:

```ts
it('crea un cliente coi contatti e li ritorna nel DTO', async () => {
  const res = await request(app.getHttpServer())
    .post('/api/clienti')
    .set('X-Stabilimento-Id', s1)
    .send({
      nome: 'Anna',
      cognome: 'Bianchi',
      telefono: '+39 333 1234567',
      email: 'anna.bianchi@email.it',
      note: 'Cliente storica',
    })
    .expect(201);
  expect(res.body).toMatchObject({
    nome: 'Anna',
    cognome: 'Bianchi',
    telefono: '+39 333 1234567',
    email: 'anna.bianchi@email.it',
    note: 'Cliente storica',
  });
  expect(res.body.id).toBeDefined();
});
```

- [ ] **Step 2: Eseguire (deve fallire)**

Run: `pnpm --filter @driftly/api test:e2e`
Expected: FAIL (il DTO ritornato non contiene `telefono/email/note` — la proiezione li scarta).

- [ ] **Step 3: Estendere il service con helper `toDTO` e `create` esteso**

Sostituisci il contenuto di `apps/api/src/clienti/clienti.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { Cliente } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { ClienteDTO, CreaClienteInput } from '@driftly/contracts';

@Injectable()
export class ClientiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** Proietta una riga Cliente nel DTO condiviso, mappando null → undefined. */
  private toDTO(c: Cliente): ClienteDTO {
    return {
      id: c.id,
      nome: c.nome,
      cognome: c.cognome,
      telefono: c.telefono ?? undefined,
      email: c.email ?? undefined,
      note: c.note ?? undefined,
    };
  }

  async list(): Promise<ClienteDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) => tx.cliente.findMany());
    return rows.map((c) => this.toDTO(c));
  }

  async create(input: CreaClienteInput): Promise<ClienteDTO> {
    const tenantId = this.tenant.require();
    const c = await this.prisma.forTenant(tenantId, (tx) =>
      tx.cliente.create({ data: { stabilimentoId: tenantId, ...input } }),
    );
    return this.toDTO(c);
  }
}
```

- [ ] **Step 4: Allargare il tipo del `@Body()` nel controller (transitorio, diventa DTO class nel Task 5)**

In `apps/api/src/clienti/clienti.controller.ts` aggiorna l'import e la `create`:

```ts
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ClientiService } from './clienti.service';
import { ClienteDTO, CreaClienteInput } from '@driftly/contracts';

@Controller('clienti')
export class ClientiController {
  constructor(private readonly clienti: ClientiService) {}

  @Get()
  list(): Promise<ClienteDTO[]> {
    return this.clienti.list();
  }

  @Post()
  create(@Body() body: CreaClienteInput): Promise<ClienteDTO> {
    return this.clienti.create(body);
  }
}
```

- [ ] **Step 5: Eseguire (deve passare)**

Run: `pnpm --filter @driftly/api test:e2e`
Expected: PASS (POST ritorna i contatti; il test di isolamento resta verde).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/clienti/clienti.service.ts apps/api/src/clienti/clienti.controller.ts apps/api/test/clienti.e2e-spec.ts
git commit -m "feat(api): extend Cliente DTO projection and POST with contatti"
```

---

### Task 3: `GET /api/clienti/:id` (404 cross-tenant via RLS)

**Files:**
- Modify: `apps/api/src/clienti/clienti.service.ts`
- Modify: `apps/api/src/clienti/clienti.controller.ts`
- Test: `apps/api/test/clienti.e2e-spec.ts`

- [ ] **Step 1: Scrivere l'e2e che fallisce (200 per il proprietario, 404 cross-tenant)**

```ts
it('GET /:id ritorna il cliente al proprietario e 404 ad altro tenant', async () => {
  const created = await request(app.getHttpServer())
    .post('/api/clienti')
    .set('X-Stabilimento-Id', s1)
    .send({ nome: 'Carlo', cognome: 'Verdi' })
    .expect(201);
  const id = created.body.id as string;

  await request(app.getHttpServer())
    .get(`/api/clienti/${id}`)
    .set('X-Stabilimento-Id', s1)
    .expect(200)
    .expect((r) => expect(r.body).toMatchObject({ id, nome: 'Carlo', cognome: 'Verdi' }));

  await request(app.getHttpServer())
    .get(`/api/clienti/${id}`)
    .set('X-Stabilimento-Id', s2)
    .expect(404);
});
```

- [ ] **Step 2: Eseguire (deve fallire)**

Run: `pnpm --filter @driftly/api test:e2e`
Expected: FAIL (rotta `GET /:id` inesistente → 404 anche per s1, oppure 200 con body vuoto).

- [ ] **Step 3: Aggiungere `getById` al service**

In `apps/api/src/clienti/clienti.service.ts` aggiorna l'import e aggiungi il metodo:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
```

```ts
async getById(id: string): Promise<ClienteDTO> {
  const tenantId = this.tenant.require();
  const c = await this.prisma.forTenant(tenantId, (tx) =>
    tx.cliente.findFirst({ where: { id } }),
  );
  if (!c) throw new NotFoundException('Cliente non trovato');
  return this.toDTO(c);
}
```

> Con la RLS attiva, un cliente di un altro tenant **non è visibile**: `findFirst` ritorna `null` → `NotFoundException` (404), non un 500/leak.

- [ ] **Step 4: Aggiungere la rotta al controller**

```ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
```

```ts
@Get(':id')
getById(@Param('id') id: string): Promise<ClienteDTO> {
  return this.clienti.getById(id);
}
```

- [ ] **Step 5: Eseguire (deve passare)**

Run: `pnpm --filter @driftly/api test:e2e`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/clienti/clienti.service.ts apps/api/src/clienti/clienti.controller.ts apps/api/test/clienti.e2e-spec.ts
git commit -m "feat(api): GET /clienti/:id with tenant isolation (404 cross-tenant)"
```

---

### Task 4: `PATCH /api/clienti/:id` (aggiorna anagrafica, 404 cross-tenant)

**Files:**
- Modify: `apps/api/src/clienti/clienti.service.ts`
- Modify: `apps/api/src/clienti/clienti.controller.ts`
- Test: `apps/api/test/clienti.e2e-spec.ts`

- [ ] **Step 1: Scrivere l'e2e che fallisce (aggiorna; 404 cross-tenant)**

```ts
it('PATCH /:id aggiorna i contatti del proprietario e 404 ad altro tenant', async () => {
  const created = await request(app.getHttpServer())
    .post('/api/clienti')
    .set('X-Stabilimento-Id', s1)
    .send({ nome: 'Dora', cognome: 'Neri' })
    .expect(201);
  const id = created.body.id as string;

  const patched = await request(app.getHttpServer())
    .patch(`/api/clienti/${id}`)
    .set('X-Stabilimento-Id', s1)
    .send({ telefono: '+39 340 0000000', note: 'preferisce prima fila' })
    .expect(200);
  expect(patched.body).toMatchObject({
    id,
    telefono: '+39 340 0000000',
    note: 'preferisce prima fila',
  });

  await request(app.getHttpServer())
    .patch(`/api/clienti/${id}`)
    .set('X-Stabilimento-Id', s2)
    .send({ telefono: '+39 111' })
    .expect(404);
});
```

- [ ] **Step 2: Eseguire (deve fallire)**

Run: `pnpm --filter @driftly/api test:e2e`
Expected: FAIL (rotta `PATCH /:id` inesistente → 404 anche per s1).

- [ ] **Step 3: Aggiungere `update` al service**

In `apps/api/src/clienti/clienti.service.ts` aggiungi l'import del tipo input e il metodo:

```ts
import { ClienteDTO, CreaClienteInput, ModificaClienteInput } from '@driftly/contracts';
```

```ts
async update(id: string, input: ModificaClienteInput): Promise<ClienteDTO> {
  const tenantId = this.tenant.require();
  const c = await this.prisma.forTenant(tenantId, async (tx) => {
    const existing = await tx.cliente.findFirst({ where: { id } });
    if (!existing) return null;
    return tx.cliente.update({ where: { id }, data: input });
  });
  if (!c) throw new NotFoundException('Cliente non trovato');
  return this.toDTO(c);
}
```

> `findFirst` + `update` nella **stessa** transazione `forTenant`: cross-tenant il record è invisibile → `existing` è `null` → 404. Evita il `P2025` di un `update` su id non visibile.

- [ ] **Step 4: Aggiungere la rotta al controller**

```ts
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
```

```ts
@Patch(':id')
update(@Param('id') id: string, @Body() body: ModificaClienteInput): Promise<ClienteDTO> {
  return this.clienti.update(id, body);
}
```

(aggiungi `ModificaClienteInput` all'import da `@driftly/contracts` nel controller)

- [ ] **Step 5: Eseguire (deve passare)**

Run: `pnpm --filter @driftly/api test:e2e`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/clienti/clienti.service.ts apps/api/src/clienti/clienti.controller.ts apps/api/test/clienti.e2e-spec.ts
git commit -m "feat(api): PATCH /clienti/:id with tenant isolation (404 cross-tenant)"
```

---

### Task 5: Validazione input server-side (risolve D-022)

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/clienti/dto/create-cliente.dto.ts`
- Create: `apps/api/src/clienti/dto/update-cliente.dto.ts`
- Modify: `apps/api/src/clienti/clienti.controller.ts`
- Modify: `apps/api/src/main.ts`
- Test: `apps/api/test/clienti.e2e-spec.ts`

- [ ] **Step 1: Installare `class-validator` + `class-transformer`**

```bash
pnpm --filter @driftly/api add class-validator class-transformer
```
Expected: aggiunte alle `dependencies` di `apps/api/package.json`.

- [ ] **Step 2: Scrivere l'e2e che fallisce (email malformata → 400)**

```ts
it('rifiuta email malformata con 400', async () => {
  await request(app.getHttpServer())
    .post('/api/clienti')
    .set('X-Stabilimento-Id', s1)
    .send({ nome: 'Eva', cognome: 'Gialli', email: 'non-una-email' })
    .expect(400);
});
```

- [ ] **Step 3: Eseguire (deve fallire)**

Run: `pnpm --filter @driftly/api test:e2e`
Expected: FAIL (senza `ValidationPipe` l'email malformata viene accettata → 201).

- [ ] **Step 4: Creare i DTO class**

`apps/api/src/clienti/dto/create-cliente.dto.ts`:

```ts
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { CreaClienteInput } from '@driftly/contracts';

export class CreateClienteDto implements CreaClienteInput {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsString()
  @IsNotEmpty()
  cognome!: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
```

`apps/api/src/clienti/dto/update-cliente.dto.ts`:

```ts
import { IsEmail, IsOptional, IsString } from 'class-validator';
import type { ModificaClienteInput } from '@driftly/contracts';

export class UpdateClienteDto implements ModificaClienteInput {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  cognome?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
```

- [ ] **Step 5: Tipizzare i `@Body()` del controller con le DTO class**

In `apps/api/src/clienti/clienti.controller.ts` usa le DTO class (è ciò che attiva la validazione dei metadati):

```ts
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ClientiService } from './clienti.service';
import { ClienteDTO } from '@driftly/contracts';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

@Controller('clienti')
export class ClientiController {
  constructor(private readonly clienti: ClientiService) {}

  @Get()
  list(): Promise<ClienteDTO[]> {
    return this.clienti.list();
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<ClienteDTO> {
    return this.clienti.getById(id);
  }

  @Post()
  create(@Body() body: CreateClienteDto): Promise<ClienteDTO> {
    return this.clienti.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateClienteDto): Promise<ClienteDTO> {
    return this.clienti.update(id, body);
  }
}
```

- [ ] **Step 6: Abilitare il `ValidationPipe` globale in `main.ts`**

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
```

- [ ] **Step 7: Allineare il setup e2e al `ValidationPipe` (parità con `main.ts`)**

In `test/clienti.e2e-spec.ts`, nel `beforeAll`, dopo `app.setGlobalPrefix(...)` aggiungi:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
```
```ts
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```

> ⚠️ `whitelist:true` scarta i campi non dichiarati nei DTO: rilancia **tutta** la suite e2e per confermare che i POST esistenti restino verdi.

- [ ] **Step 8: Eseguire l'intera suite (deve passare)**

Run: `pnpm --filter @driftly/api test:e2e`
Expected: PASS (email malformata → 400; tutti i test precedenti verdi).

- [ ] **Step 9: Commit**

```bash
git add apps/api/package.json apps/api/src/clienti/dto apps/api/src/clienti/clienti.controller.ts apps/api/src/main.ts apps/api/test/clienti.e2e-spec.ts ../../pnpm-lock.yaml
git commit -m "feat(api): server-side validation for Cliente input (class-validator, ValidationPipe)"
```

---

### Task 6: ADR-0023 + data-model + deferred (D-024 aperta, D-022 risolta)

**Files:**
- Create: `docs/architecture/decisions/0023-contatti-cliente-colonne-tipizzate.md`
- Modify: `docs/design/data-model.md`
- Modify: `docs/architecture/deferred.md`

- [ ] **Step 1: Redigere ADR-0023**

Crea `docs/architecture/decisions/0023-contatti-cliente-colonne-tipizzate.md` seguendo il formato degli ADR esistenti (Status: Accettata, Contesto, Decisione, Conseguenze). Contenuto chiave: contatti del `Cliente` come **colonne tipizzate** (`telefono`, `email`) + `note` come `text`, anziché `json contatti`. Motivazione: campi pochi e noti → validazione (`@IsEmail`), indici/query pulite; il `json` sarebbe un blob opaco. Divergenza consapevole dal data-model (che indicava `json contatti`) → il data-model va aggiornato. Estendibile in modo additivo se in futuro servono più contatti.

- [ ] **Step 2: Aggiornare il data-model**

In `docs/design/data-model.md`, nella descrizione dell'entità `Cliente`, sostituisci `contatti json` con i campi `telefono`, `email` (colonne tipizzate) e `note` (text), con un rimando a [ADR-0023](../architecture/decisions/0023-contatti-cliente-colonne-tipizzate.md).

- [ ] **Step 3: Aprire D-024 e rimuovere D-022 dal deferred**

In `docs/architecture/deferred.md`:
- **Rimuovi** la riga `D-022` dalla tabella e aggiungi in fondo, nella sezione "Risolte": `**D-022** — Validazione server-side input API → risolta da [ADR-0023] (DTO class-validator + ValidationPipe globale), Task 5 del piano BE scheda cliente.`
- **Aggiungi** la riga `D-024`: Tema = cancellazione/anonimizzazione del `Cliente` (GDPR) quando legato a `Prenotazione`/storico; Perché rimandata = in questo incremento niente DELETE, manca ancora il legame con `Prenotazione`; Trigger = `Cliente` legato a prenotazioni/storico; Impatto = hard-delete non ammissibile → servirà soft-delete/anonimizzazione.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/decisions/0023-contatti-cliente-colonne-tipizzate.md docs/design/data-model.md docs/architecture/deferred.md
git commit -m "docs(adr): ADR-0023 contatti tipizzati; resolve D-022; open D-024 (privacy)"
```

---

### Task 7: Verifica finale Backend

**Files:** nessuna modifica (solo verifica).

- [ ] **Step 1: Suite e2e completa**

Run: `pnpm --filter @driftly/api test:e2e`
Expected: PASS (isolamento, contatti su POST, GET/:id 200+404, PATCH 200+404, email 400).

- [ ] **Step 2: Build/typecheck**

Run: `pnpm --filter @driftly/api build`
Expected: build OK (nessun errore TS).

---

## Self-Review (copertura spec)

- `Cliente += telefono/email/note` end-to-end → Task 1 (schema) + Task 2 (POST/proiezione).
- `GET /api/clienti/:id` con 404 cross-tenant → Task 3.
- `POST` esteso → Task 2.
- `PATCH /api/clienti/:id` con 404 cross-tenant → Task 4.
- Validazione (D-022) + email 400 → Task 5.
- 400 senza header tenant → già garantito da `tenant.require()` (BadRequestException) su ogni metodo del service; coperto implicitamente. *(Opzionale: aggiungere un e2e `GET /:id` senza header → 400 nel Task 3.)*
- ADR-0023 + data-model + D-024 + D-022 risolta → Task 6.
- Pattern `tenant.require()` + `forTenant` su OGNI query (incluso getById/update) → Task 2/3/4.
- Proiezione DTO estesa in *tutti* i metodi (`toDTO`) → Task 2.
</content>
</invoke>
