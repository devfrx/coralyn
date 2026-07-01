# Editor CRUD del listino (D-032) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire il mock di `PricingView` con un editor CRUD reale del listino (Stagioni, Pacchetti, Tariffe), con gli endpoint backend che li reggono.

**Architecture:** Backend NestJS: nuovi `SeasonsController`/`RatesController` + estensione di `PackagesController`, tutti dentro `CatalogModule` (accanto al motore prezzo, che **non si tocca**). Pattern identico a `customers/`: tenant-scoping via `PrismaService.forTenant`, DTO `class-validator`, proiezione `null → undefined`. `Pricing` è plumbing 1:1 con `Season` (mai esposto): creato/eliminato automaticamente. Frontend Vue: `PricingView.vue` passa da array locali a query reali (`useSeasons`/`usePackages`/`useRates` sopra `useQueryResource`), riusando i componenti `ui-kit` del refactor ADR-0033.

**Tech Stack:** NestJS 10 · Prisma 5 · PostgreSQL 16 · `class-validator`/`class-transformer` · Jest (unit + e2e supertest) · Vue 3 + TanStack Query + Pinia · Vitest + `@vue/test-utils` + MSW · `@coralyn/ui-kit` · `@coralyn/contracts`.

## Global Constraints

- **Codice e DB in inglese; UI a video e commenti/doc in italiano** (ADR-0030). Termini di dominio dal [glossario](../../architecture/glossary.md): `Season`, `Pricing`, `Rate`, `Package`, `RateUnit`, `BookingType`.
- **Nessuna migrazione DB.** Il vincolo di non-ambiguità `Rate_signature_key` (`NULLS NOT DISTINCT`) esiste **già** in DB dalla migrazione `20260630203447_pricing` (verificato con `pg_indexes`); non compare in `schema.prisma` perché Prisma non emette quella clausola. **NON aggiungere `@@unique` su `Rate` in `schema.prisma`** (genererebbe un secondo indice ridondante). Vedi spec §3.
- **`pricing.engine.ts` non si tocca** (puro, testato — ADR-0032).
- **Prezzo server-autoritativo**: nessun endpoint del listino accetta prezzi calcolati dal client; il motore resta l'unica fonte del totale di prenotazione.
- **Riuso deliberato dei componenti `ui-kit`** (validazione ADR-0033): `PageToolbar`, `ModalFooter`, `Field`/`Input`/`Select`, `DataTable`, `formatEuro`, `useQueryResource`. Nessun nuovo componente `ui-kit` salvo emerga un pattern non coperto (YAGNI, ADR-0033 §4).
- **Non regredire i test.** Baseline verificata dal vivo il 2026-07-01: `ui-kit` **41** (14 file) · `web-staff` **83** (29 file, include ui-kit) · api **unit 68** (13 suite) · api **e2e 73** (5 suite). Ogni layer aggiunge test, mai ne toglie.
- **Convenzione DTO date**: `yyyy-mm-dd` validato da `IsCalendarDate` (data di calendario reale); UUID validati per *forma* con `UUID_SHAPE` (non `@IsUUID()`, che rifiuterebbe gli UUID sintetici del seed/tenant).
- **Convenzione DELETE**: gli handler `@Delete` ritornano il DTO dell'entità eliminata (200 + body JSON) — coerente con `DELETE /api/bookings/:id` esistente e con `apiFetch<T>` (che fa sempre `res.json()`).
- **Ordine dei commit richiesto: un commit per layer → (1) contratti, (2) backend, (3) frontend.** Task-by-task in TDD dentro ogni layer; il `git commit` è l'ultimo step del layer.

---

## File Structure

**Layer 1 — Contratti**
- Modifica: `packages/contracts/src/index.ts` — aggiunge `SeasonDTO`, `CreateSeasonInput`, `RateDTO`, `CreateRateInput`, `UpdateRateInput`, `CreatePackageInput`, `UpdatePackageInput`.

**Layer 2 — Backend** (tutto sotto `apps/api/src/`)
- Sposta (refactor DRY, per non far dipendere `catalog` da `bookings`):
  - `common/is-calendar-date.ts` ← da `bookings/dto/is-calendar-date.ts`
  - `common/uuid.ts` ← estrae `UUID_SHAPE` da `bookings/dto/create-booking.dto.ts`
- Crea (catalog CRUD):
  - `catalog/season.projection.ts` — `toSeasonDTO`
  - `catalog/rate.projection.ts` — `toRateDTO`
  - `catalog/dto/create-season.dto.ts`
  - `catalog/dto/create-rate.dto.ts`, `catalog/dto/update-rate.dto.ts`
  - `catalog/dto/create-package.dto.ts`, `catalog/dto/update-package.dto.ts`
  - `catalog/seasons.service.ts`, `catalog/seasons.controller.ts`
  - `catalog/rates.service.ts`, `catalog/rates.controller.ts`
- Modifica:
  - `catalog/catalog.service.ts` — aggiunge `createPackage`/`updatePackage`/`deletePackage`
  - `catalog/packages.controller.ts` — aggiunge `POST`/`PATCH`/`DELETE`
  - `catalog/catalog.module.ts` — registra i nuovi controller/service
  - `app.module.ts` — importa esplicitamente `CatalogModule`
  - I 5 file DTO di `bookings/dto/` che importavano `./is-calendar-date` / `UUID_SHAPE`
- Test:
  - `catalog/dto/create-season.dto.spec.ts`, `catalog/dto/create-rate.dto.spec.ts` (unit DTO)
  - `test/seasons.e2e-spec.ts`, `test/packages.e2e-spec.ts`, `test/rates.e2e-spec.ts`

**Layer 3 — Frontend** (tutto sotto `apps/web-staff/src/`)
- Modifica: `lib/queryKeys.ts` — aggiunge `seasons`, `rates`.
- Crea: `features/pricing/useSeasons.ts`, `features/pricing/useRates.ts`.
- Modifica: `features/bookings/usePackages.ts` — aggiunge `useCreatePackage`/`useUpdatePackage`/`useDeletePackage`.
- Riscrive: `features/pricing/PricingView.vue` (mock → reale).
- Modifica: `mocks/server.ts` — handler MSW per `/seasons`, `/rates`, scritture `/packages`.
- Test: `features/pricing/useSeasons.spec.ts`, `features/pricing/PricingView.spec.ts`.

---

## LAYER 1 — CONTRATTI

### Task 1: DTO e input condivisi del listino

**Files:**
- Modify: `packages/contracts/src/index.ts` (append in coda al file — `BookingType` e `RateUnit` sono già definiti sopra)

**Interfaces:**
- Produces: `SeasonDTO`, `CreateSeasonInput`, `RateDTO`, `CreateRateInput`, `UpdateRateInput`, `CreatePackageInput`, `UpdatePackageInput`.

- [ ] **Step 1: Aggiungi i tipi in coda a `packages/contracts/src/index.ts`**

```ts
// --- Listino / editor (D-032) -----------------------------------------------

/** Stagione operativa dello Stabilimento (ADR-0031). Date ISO yyyy-mm-dd. */
export interface SeasonDTO {
  id: string;
  name: string;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string;   // ISO yyyy-mm-dd
}

/** Input per creare una stagione (il Pricing 1:1 lo crea il backend). */
export interface CreateSeasonInput {
  name: string;
  startDate: string;
  endDate: string;
}

/** Tariffa (Rate): regola di prezzo multi-dimensione. Ogni dimensione assente = wildcard.
 *  Esposta al FE con `seasonId` (non `pricingId`): `Pricing` è plumbing interno. */
export interface RateDTO {
  id: string;
  seasonId: string;
  type?: BookingType;
  sectorId?: string;
  rowId?: string;
  packageId?: string;
  timeSlotId?: string;
  periodStart?: string; // ISO yyyy-mm-dd
  periodEnd?: string;   // ISO yyyy-mm-dd
  price: number;        // EUR, max 2 decimali
  unit: RateUnit;
}

/** Input creazione tariffa: come RateDTO senza `id` (include `seasonId`). */
export type CreateRateInput = Omit<RateDTO, 'id'>;

/** Input modifica tariffa: tutte le dimensioni/prezzo opzionali; `seasonId` non modificabile. */
export type UpdateRateInput = Partial<Omit<RateDTO, 'id' | 'seasonId'>>;

/** Input creazione pacchetto. */
export interface CreatePackageInput {
  name: string;
  equipment: Record<string, number>;
}

/** Input modifica pacchetto: tutti i campi opzionali. */
export type UpdatePackageInput = Partial<CreatePackageInput>;
```

- [ ] **Step 2: Compila i contratti (verifica il type-check)**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: PASS (nessun errore `tsc`). I contratti sono tipi puri: il "test" è la compilazione.

- [ ] **Step 3: Verifica che il monorepo compili ancora**

Run: `corepack pnpm -r build`
Expected: PASS.

- [ ] **Step 4: Commit (chiude il Layer 1)**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): DTO e input per l'editor del listino (D-032)"
```

---

## LAYER 2 — BACKEND

> Ordine TDD: prima si spostano i validator generici in `common/` (per non far dipendere `catalog` da `bookings`), poi i DTO (unit test), poi Seasons, Packages, Rates (e2e test-first), infine il wiring del modulo. **Un solo commit alla fine del layer.**

### Task 2: Sposta i validator generici in `common/`

Motivazione: `IsCalendarDate` e `UUID_SHAPE` vivono oggi in `bookings/dto/` ma sono generici e privi di dominio. `catalog` deve poterli usare **senza dipendere da `bookings`** (la direzione consentita è `bookings → catalog`, mai il contrario — ADR-0032). Si spostano in `common/`, aggiornando i 5 importatori esistenti. Comportamento identico: gli spec DTO di bookings restano verdi.

**Files:**
- Create: `apps/api/src/common/is-calendar-date.ts`
- Create: `apps/api/src/common/uuid.ts`
- Delete: `apps/api/src/bookings/dto/is-calendar-date.ts`
- Modify: `apps/api/src/bookings/dto/create-booking.dto.ts`, `quote-booking.dto.ts`, `renew-booking.dto.ts`, `settle-payment.dto.ts`, `bookings-query.dto.ts`

- [ ] **Step 1: Crea `apps/api/src/common/is-calendar-date.ts`** (contenuto identico, import da `./dates`)

```ts
import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidCalendarDate } from './dates';

/** Valida 'yyyy-mm-dd' come data di calendario reale (no 2026-13-40). */
export function IsCalendarDate(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options: { message: 'date must be a real yyyy-mm-dd calendar date', ...options },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidCalendarDate(value);
        },
      },
    });
  };
}
```

- [ ] **Step 2: Crea `apps/api/src/common/uuid.ts`**

```ts
// UUID in forma canonica 8-4-4-4-12, SENZA vincolo di versione/variante RFC-4122: il seed di
// sviluppo e l'id del tenant usano UUID sintetici che Postgres accetta come `uuid` ma che @IsUUID()
// rifiuterebbe. Validiamo la *forma* e lasciamo alla FK il controllo di esistenza nel tenant.
export const UUID_SHAPE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
```

- [ ] **Step 3: Elimina il vecchio file e aggiorna gli import in `bookings/dto/`**

Elimina `apps/api/src/bookings/dto/is-calendar-date.ts`.

In `create-booking.dto.ts`: cambia la riga import e sostituisci la definizione di `UUID_SHAPE` con un re-export (così `quote-booking.dto.ts`, che importa `{ TYPES, UUID_SHAPE } from './create-booking.dto'`, continua a funzionare senza altre modifiche):

```ts
// da: import { IsIn, IsOptional, Matches } from 'class-validator';
//     import type { BookingType, CreateBookingInput } from '@coralyn/contracts';
//     import { IsCalendarDate } from './is-calendar-date';
//     export const UUID_SHAPE = /.../;
// a:
import { IsIn, IsOptional, Matches } from 'class-validator';
import type { BookingType, CreateBookingInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';
export { UUID_SHAPE } from '../../common/uuid';
import { UUID_SHAPE } from '../../common/uuid';
```

In `quote-booking.dto.ts`, `renew-booking.dto.ts`, `settle-payment.dto.ts`, `bookings-query.dto.ts`: cambia solo il path dell'import di `IsCalendarDate`:

```ts
// da: import { IsCalendarDate } from './is-calendar-date';
// a:
import { IsCalendarDate } from '../../common/is-calendar-date';
```

- [ ] **Step 4: Verifica che gli spec DTO esistenti restino verdi**

Run (dalla root): `cd apps/api && corepack pnpm test -- create-booking.dto renew-booking.dto settle-payment.dto`
Expected: PASS (nessuna regressione: comportamento identico, solo path cambiati).

---

### Task 3: DTO di scrittura del listino (unit test-first)

**Files:**
- Create: `apps/api/src/catalog/dto/create-season.dto.ts`, `create-rate.dto.ts`, `update-rate.dto.ts`, `create-package.dto.ts`, `update-package.dto.ts`
- Test: `apps/api/src/catalog/dto/create-season.dto.spec.ts`, `create-rate.dto.spec.ts`

**Interfaces:**
- Consumes: `IsCalendarDate` (`common/is-calendar-date`), `UUID_SHAPE` (`common/uuid`), contratti del Task 1.
- Produces: `CreateSeasonDto`, `CreateRateDto`, `UpdateRateDto`, `CreatePackageDto`, `UpdatePackageDto`.

- [ ] **Step 1: Scrivi lo spec fallito `create-season.dto.spec.ts`**

```ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateSeasonDto } from './create-season.dto';

const errs = (obj: unknown) => validateSync(plainToInstance(CreateSeasonDto, obj), { whitelist: true });

describe('CreateSeasonDto', () => {
  it('accetta nome + date ISO valide', () => {
    expect(errs({ name: 'Estate 2028', startDate: '2028-06-01', endDate: '2028-09-30' })).toHaveLength(0);
  });
  it('rifiuta una data non-calendario', () => {
    expect(errs({ name: 'X', startDate: '2028-13-40', endDate: '2028-09-30' }).length).toBeGreaterThan(0);
  });
  it('rifiuta nome vuoto', () => {
    expect(errs({ name: '', startDate: '2028-06-01', endDate: '2028-09-30' }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `cd apps/api && corepack pnpm test -- create-season.dto`
Expected: FAIL ("Cannot find module './create-season.dto'").

- [ ] **Step 3: Implementa `create-season.dto.ts`**

```ts
import { IsNotEmpty, IsString } from 'class-validator';
import type { CreateSeasonInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';

export class CreateSeasonDto implements CreateSeasonInput {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsCalendarDate()
  startDate!: string;

  @IsCalendarDate()
  endDate!: string;
}
```

> Nota: l'invariante `startDate <= endDate` è validata nel `SeasonsService` (→ 400), non nel DTO (serve confronto cross-field): vedi Task 4.

- [ ] **Step 4: Scrivi lo spec fallito `create-rate.dto.spec.ts`**

```ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateRateDto } from './create-rate.dto';

const UUID = '11111111-1111-1111-1111-111111111111';
const errs = (obj: unknown) => validateSync(plainToInstance(CreateRateDto, obj), { whitelist: true });

describe('CreateRateDto', () => {
  it('accetta una catch-all (solo seasonId + price + unit)', () => {
    expect(errs({ seasonId: UUID, price: 28, unit: 'day' })).toHaveLength(0);
  });
  it('accetta le dimensioni opzionali valide', () => {
    expect(errs({ seasonId: UUID, packageId: UUID, timeSlotId: UUID, type: 'subscription', price: 800, unit: 'period' })).toHaveLength(0);
  });
  it('rifiuta seasonId non-UUID', () => {
    expect(errs({ seasonId: 'nope', price: 28, unit: 'day' }).length).toBeGreaterThan(0);
  });
  it('rifiuta unit fuori enum', () => {
    expect(errs({ seasonId: UUID, price: 28, unit: 'week' }).length).toBeGreaterThan(0);
  });
  it('rifiuta prezzo con più di 2 decimali', () => {
    expect(errs({ seasonId: UUID, price: 28.999, unit: 'day' }).length).toBeGreaterThan(0);
  });
  it('rifiuta prezzo negativo', () => {
    expect(errs({ seasonId: UUID, price: -1, unit: 'day' }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Esegui e verifica che fallisca**

Run: `cd apps/api && corepack pnpm test -- create-rate.dto`
Expected: FAIL ("Cannot find module './create-rate.dto'").

- [ ] **Step 6: Implementa `create-rate.dto.ts`**

```ts
import { IsIn, IsNumber, IsOptional, Matches, Min } from 'class-validator';
import type { BookingType, CreateRateInput, RateUnit } from '@coralyn/contracts';
import { UUID_SHAPE } from '../../common/uuid';
import { IsCalendarDate } from '../../common/is-calendar-date';

const TYPES: BookingType[] = ['daily', 'periodic', 'subscription'];
const UNITS: RateUnit[] = ['day', 'period'];

export class CreateRateDto implements CreateRateInput {
  @Matches(UUID_SHAPE, { message: 'seasonId must be a UUID' })
  seasonId!: string;

  @IsOptional()
  @IsIn(TYPES)
  type?: BookingType;

  @IsOptional()
  @Matches(UUID_SHAPE, { message: 'sectorId must be a UUID' })
  sectorId?: string;

  @IsOptional()
  @Matches(UUID_SHAPE, { message: 'rowId must be a UUID' })
  rowId?: string;

  @IsOptional()
  @Matches(UUID_SHAPE, { message: 'packageId must be a UUID' })
  packageId?: string;

  @IsOptional()
  @Matches(UUID_SHAPE, { message: 'timeSlotId must be a UUID' })
  timeSlotId?: string;

  @IsOptional()
  @IsCalendarDate()
  periodStart?: string;

  @IsOptional()
  @IsCalendarDate()
  periodEnd?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsIn(UNITS)
  unit!: RateUnit;
}
```

- [ ] **Step 7: Implementa `update-rate.dto.ts`** (nessuno spec dedicato: stessa forma senza `seasonId`, coperta di riflesso dagli e2e)

```ts
import { IsIn, IsNumber, IsOptional, Matches, Min } from 'class-validator';
import type { BookingType, RateUnit, UpdateRateInput } from '@coralyn/contracts';
import { UUID_SHAPE } from '../../common/uuid';
import { IsCalendarDate } from '../../common/is-calendar-date';

const TYPES: BookingType[] = ['daily', 'periodic', 'subscription'];
const UNITS: RateUnit[] = ['day', 'period'];

export class UpdateRateDto implements UpdateRateInput {
  @IsOptional() @IsIn(TYPES) type?: BookingType;
  @IsOptional() @Matches(UUID_SHAPE, { message: 'sectorId must be a UUID' }) sectorId?: string;
  @IsOptional() @Matches(UUID_SHAPE, { message: 'rowId must be a UUID' }) rowId?: string;
  @IsOptional() @Matches(UUID_SHAPE, { message: 'packageId must be a UUID' }) packageId?: string;
  @IsOptional() @Matches(UUID_SHAPE, { message: 'timeSlotId must be a UUID' }) timeSlotId?: string;
  @IsOptional() @IsCalendarDate() periodStart?: string;
  @IsOptional() @IsCalendarDate() periodEnd?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price?: number;
  @IsOptional() @IsIn(UNITS) unit?: RateUnit;
}
```

- [ ] **Step 8: Implementa `create-package.dto.ts` e `update-package.dto.ts`**

`create-package.dto.ts`:
```ts
import { IsNotEmpty, IsObject, IsString } from 'class-validator';
import type { CreatePackageInput } from '@coralyn/contracts';

export class CreatePackageDto implements CreatePackageInput {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsObject()
  equipment!: Record<string, number>;
}
```

`update-package.dto.ts`:
```ts
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import type { UpdatePackageInput } from '@coralyn/contracts';

export class UpdatePackageDto implements UpdatePackageInput {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsObject() equipment?: Record<string, number>;
}
```

- [ ] **Step 9: Esegui gli spec DTO e verifica che passino**

Run: `cd apps/api && corepack pnpm test -- create-season.dto create-rate.dto`
Expected: PASS.

---

### Task 4: Seasons — service, controller, proiezione (e2e test-first)

**Files:**
- Create: `apps/api/src/catalog/season.projection.ts`, `seasons.service.ts`, `seasons.controller.ts`
- Modify: `apps/api/src/catalog/catalog.module.ts`, `apps/api/src/app.module.ts`
- Test: `apps/api/test/seasons.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService.forTenant`, `TenantContext.require()`, `CreateSeasonDto`, `toDbDate`/`formatDbDate` (`common/dates`).
- Produces: `SeasonsService.list()/create(input)/remove(id)` → `SeasonDTO`; rotte `GET/POST/DELETE /api/seasons`.

- [ ] **Step 1: Scrivi lo spec e2e fallito `apps/api/test/seasons.e2e-spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';

describe('Seasons (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let token1: string;
  let token2: string;
  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Seas A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Seas B' } })).id;
    await createUser(prisma, { email: 'admin.se1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'admin.se2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    token1 = await login(app, 'admin.se1@e2e.test', 'pw1');
    token2 = await login(app, 'admin.se2@e2e.test', 'pw2');
  });

  afterAll(async () => {
    for (const s of [s1, s2]) {
      await prisma.forTenant(s, async (tx) => {
        await tx.rate.deleteMany({});
        await tx.pricing.deleteMany({});
        await tx.season.deleteMany({});
      });
    }
    await prisma.user.deleteMany({ where: { email: { in: ['admin.se1@e2e.test', 'admin.se2@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('senza token → 401', async () => {
    await request(app.getHttpServer()).get('/api/seasons').expect(401);
  });

  it('POST crea la stagione E il suo Pricing 1:1, non visibile ad altro tenant', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/seasons').set(...bearer(token1))
      .send({ name: 'Estate 2028', startDate: '2028-06-01', endDate: '2028-09-30' })
      .expect(201);
    expect(res.body).toMatchObject({ name: 'Estate 2028', startDate: '2028-06-01', endDate: '2028-09-30' });
    const seasonId = res.body.id as string;

    // Pricing 1:1 creato automaticamente (verifica diretta in DB, tenant-scoped).
    const pricing = await prisma.forTenant(s1, (tx) => tx.pricing.findFirst({ where: { seasonId } }));
    expect(pricing).not.toBeNull();

    const listS1 = await request(app.getHttpServer()).get('/api/seasons').set(...bearer(token1)).expect(200);
    expect(listS1.body.some((s: { id: string }) => s.id === seasonId)).toBe(true);
    const listS2 = await request(app.getHttpServer()).get('/api/seasons').set(...bearer(token2)).expect(200);
    expect(listS2.body.some((s: { id: string }) => s.id === seasonId)).toBe(false);
  });

  it('POST rifiuta startDate > endDate con 400', async () => {
    await request(app.getHttpServer())
      .post('/api/seasons').set(...bearer(token1))
      .send({ name: 'Rovescia', startDate: '2028-09-30', endDate: '2028-06-01' })
      .expect(400);
  });

  it('DELETE cancella a cascata (Rate → Pricing → Season) e ritorna la stagione', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/seasons').set(...bearer(token1))
      .send({ name: 'Da cancellare', startDate: '2029-06-01', endDate: '2029-09-30' })
      .expect(201);
    const seasonId = created.body.id as string;
    const pricing = await prisma.forTenant(s1, (tx) => tx.pricing.findFirst({ where: { seasonId } }));
    // semina una Rate catch-all DIRETTAMENTE in DB per esercitare la cascata (nessuna dipendenza da /api/rates)
    await prisma.forTenant(s1, (tx) =>
      tx.rate.create({ data: { establishmentId: s1, pricingId: pricing!.id, price: 20, unit: 'day' } }),
    );

    const del = await request(app.getHttpServer()).delete(`/api/seasons/${seasonId}`).set(...bearer(token1)).expect(200);
    expect(del.body.id).toBe(seasonId);

    const ratesLeft = await prisma.forTenant(s1, (tx) => tx.rate.count({ where: { pricingId: pricing!.id } }));
    const pricingLeft = await prisma.forTenant(s1, (tx) => tx.pricing.count({ where: { seasonId } }));
    const seasonLeft = await prisma.forTenant(s1, (tx) => tx.season.count({ where: { id: seasonId } }));
    expect([ratesLeft, pricingLeft, seasonLeft]).toEqual([0, 0, 0]);
  });

  it('DELETE di una stagione inesistente → 404', async () => {
    await request(app.getHttpServer())
      .delete('/api/seasons/99999999-9999-9999-9999-999999999999').set(...bearer(token1)).expect(404);
  });
});
```

> Questo spec è **autonomo**: semina la `Rate` di prova direttamente in DB (non via `/api/rates`), quindi il Task 4 è verde da solo, senza dipendere dal Task 6.

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `cd apps/api && corepack pnpm test:e2e -- seasons`
Expected: FAIL (rotte `/api/seasons` non esistono → 404).

- [ ] **Step 3: Implementa `season.projection.ts`**

```ts
import type { Season } from '@prisma/client';
import type { SeasonDTO } from '@coralyn/contracts';
import { formatDbDate } from '../common/dates';

/** Proietta una riga Season nel DTO (Date @db.Date → ISO yyyy-mm-dd). */
export function toSeasonDTO(s: Season): SeasonDTO {
  return {
    id: s.id,
    name: s.name,
    startDate: formatDbDate(s.startDate),
    endDate: formatDbDate(s.endDate),
  };
}
```

- [ ] **Step 4: Implementa `seasons.service.ts`**

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateSeasonInput, SeasonDTO } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { toDbDate } from '../common/dates';
import { toSeasonDTO } from './season.projection';

@Injectable()
export class SeasonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async list(): Promise<SeasonDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) =>
      tx.season.findMany({ orderBy: { startDate: 'asc' } }),
    );
    return rows.map(toSeasonDTO);
  }

  async create(input: CreateSeasonInput): Promise<SeasonDTO> {
    if (input.startDate > input.endDate) {
      throw new BadRequestException('La data di inizio deve precedere la data di fine.');
    }
    const tenantId = this.tenant.require();
    const season = await this.prisma.forTenant(tenantId, async (tx) => {
      const s = await tx.season.create({
        data: {
          establishmentId: tenantId,
          name: input.name,
          startDate: toDbDate(input.startDate),
          endDate: toDbDate(input.endDate),
        },
      });
      // Pricing 1:1 (plumbing, mai esposto): creato insieme alla Season.
      await tx.pricing.create({ data: { establishmentId: tenantId, seasonId: s.id } });
      return s;
    });
    return toSeasonDTO(season);
  }

  async remove(id: string): Promise<SeasonDTO> {
    const tenantId = this.tenant.require();
    // FK ON DELETE RESTRICT su Pricing/Rate: cascata APPLICATIVA (Rate → Pricing → Season)
    // in una singola transazione. Vedi spec §5/§7.
    const season = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.season.findFirst({ where: { id } });
      if (!existing) return null;
      const pricing = await tx.pricing.findFirst({ where: { seasonId: id } });
      if (pricing) {
        await tx.rate.deleteMany({ where: { pricingId: pricing.id } });
        await tx.pricing.delete({ where: { id: pricing.id } });
      }
      await tx.season.delete({ where: { id } });
      return existing;
    });
    if (!season) throw new NotFoundException('Stagione non trovata');
    return toSeasonDTO(season);
  }
}
```

- [ ] **Step 5: Implementa `seasons.controller.ts`**

```ts
import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import type { SeasonDTO } from '@coralyn/contracts';
import { SeasonsService } from './seasons.service';
import { CreateSeasonDto } from './dto/create-season.dto';

@Controller('seasons')
export class SeasonsController {
  constructor(private readonly seasons: SeasonsService) {}

  @Get()
  list(): Promise<SeasonDTO[]> {
    return this.seasons.list();
  }

  @Post()
  create(@Body() body: CreateSeasonDto): Promise<SeasonDTO> {
    return this.seasons.create(body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<SeasonDTO> {
    return this.seasons.remove(id);
  }
}
```

- [ ] **Step 6: Registra in `catalog.module.ts` e importa `CatalogModule` in `app.module.ts`**

`catalog.module.ts` (aggiungi `SeasonsController`/`SeasonsService`; i Rates arrivano nel Task 6):
```ts
import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { PackagesController } from './packages.controller';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';

@Module({
  controllers: [PackagesController, SeasonsController],
  providers: [CatalogService, SeasonsService],
  exports: [CatalogService],
})
export class CatalogModule {}
```

`app.module.ts` — aggiungi l'import esplicito (spec §1: oggi `CatalogModule` è raggiunto solo transitivamente via `BookingsModule`):
```ts
import { CatalogModule } from './catalog/catalog.module';
// ...
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TenantModule,
    IdentityModule,
    CustomersModule,
    MapModule,
    CatalogModule,
    BookingsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 7: Esegui lo spec Seasons e verifica che passi**

Run: `cd apps/api && corepack pnpm test:e2e -- seasons`
Expected: PASS (401, create+Pricing+isolamento, cascade delete, 400 date rovesce, 404 delete inesistente).

---

### Task 5: Packages — scritture su CatalogService/PackagesController (e2e test-first)

**Files:**
- Modify: `apps/api/src/catalog/catalog.service.ts`, `apps/api/src/catalog/packages.controller.ts`
- Test: `apps/api/test/packages.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService.forTenant`, `TenantContext`, `CreatePackageDto`/`UpdatePackageDto`, `toPackageDTO`.
- Produces: `CatalogService.createPackage/updatePackage/deletePackage` → `PackageDTO`; rotte `POST/PATCH/DELETE /api/packages`.

- [ ] **Step 1: Scrivi lo spec e2e fallito `apps/api/test/packages.e2e-spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';

describe('Packages (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let token1: string;
  let token2: string;
  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Pkg A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Pkg B' } })).id;
    await createUser(prisma, { email: 'admin.pk1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'admin.pk2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    token1 = await login(app, 'admin.pk1@e2e.test', 'pw1');
    token2 = await login(app, 'admin.pk2@e2e.test', 'pw2');
  });

  afterAll(async () => {
    for (const s of [s1, s2]) await prisma.forTenant(s, (tx) => tx.package.deleteMany({}));
    await prisma.user.deleteMany({ where: { email: { in: ['admin.pk1@e2e.test', 'admin.pk2@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('POST crea un pacchetto e lo elenca solo al proprietario', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1))
      .send({ name: 'Comfort', equipment: { sunbeds: 2, deckchairs: 1 } })
      .expect(201);
    expect(res.body).toMatchObject({ name: 'Comfort', equipment: { sunbeds: 2, deckchairs: 1 } });
    const id = res.body.id as string;

    const listS2 = await request(app.getHttpServer()).get('/api/packages').set(...bearer(token2)).expect(200);
    expect(listS2.body.some((p: { id: string }) => p.id === id)).toBe(false);
  });

  it('PATCH aggiorna nome/equipment del proprietario, 404 ad altro tenant', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1)).send({ name: 'Base', equipment: { sunbeds: 2 } }).expect(201);
    const id = created.body.id as string;

    const patched = await request(app.getHttpServer())
      .patch(`/api/packages/${id}`).set(...bearer(token1)).send({ name: 'Base Plus', equipment: { sunbeds: 3 } }).expect(200);
    expect(patched.body).toMatchObject({ id, name: 'Base Plus', equipment: { sunbeds: 3 } });

    await request(app.getHttpServer()).patch(`/api/packages/${id}`).set(...bearer(token2)).send({ name: 'X' }).expect(404);
  });

  it('DELETE elimina il pacchetto e lo ritorna; 404 se inesistente', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1)).send({ name: 'Effimero', equipment: {} }).expect(201);
    const id = created.body.id as string;
    const del = await request(app.getHttpServer()).delete(`/api/packages/${id}`).set(...bearer(token1)).expect(200);
    expect(del.body.id).toBe(id);
    await request(app.getHttpServer()).delete(`/api/packages/${id}`).set(...bearer(token1)).expect(404);
  });

  it('POST rifiuta nome vuoto con 400', async () => {
    await request(app.getHttpServer()).post('/api/packages').set(...bearer(token1)).send({ name: '', equipment: {} }).expect(400);
  });
});
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `cd apps/api && corepack pnpm test:e2e -- packages`
Expected: FAIL (`POST/PATCH/DELETE /api/packages` non esistono → 404/500).

- [ ] **Step 3: Estendi `catalog.service.ts` con le scritture pacchetto**

Aggiungi gli import mancanti in testa (`ConflictException`, `NotFoundException`, i tipi input) e i metodi in coda alla classe `CatalogService`:

```ts
// import aggiuntivi:
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { BookingType, CreatePackageInput, PackageDTO, UpdatePackageInput } from '@coralyn/contracts';
import { Prisma } from '@prisma/client';

// ... dentro la classe CatalogService, in coda ai metodi esistenti:

  async createPackage(input: CreatePackageInput): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    const p = await this.prisma.forTenant(tenantId, (tx) =>
      tx.package.create({ data: { establishmentId: tenantId, name: input.name, equipment: input.equipment } }),
    );
    return toPackageDTO(p);
  }

  async updatePackage(id: string, input: UpdatePackageInput): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    const p = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.package.findFirst({ where: { id } });
      if (!existing) return null;
      return tx.package.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.equipment !== undefined ? { equipment: input.equipment } : {}),
        },
      });
    });
    if (!p) throw new NotFoundException('Pacchetto non trovato');
    return toPackageDTO(p);
  }

  async deletePackage(id: string): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    try {
      const p = await this.prisma.forTenant(tenantId, async (tx) => {
        const existing = await tx.package.findFirst({ where: { id } });
        if (!existing) return null;
        await tx.package.delete({ where: { id } });
        return existing;
      });
      if (!p) throw new NotFoundException('Pacchetto non trovato');
      return toPackageDTO(p);
    } catch (e) {
      // FK RESTRICT: un pacchetto referenziato da tariffe/prenotazioni non è cancellabile.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new ConflictException('Pacchetto in uso da tariffe o prenotazioni: non eliminabile.');
      }
      throw e;
    }
  }
```

> Nota: se `CatalogService` importa già `Injectable`/`Logger` da `@nestjs/common`, unifica l'import invece di duplicarlo. `toPackageDTO` è già importato nel file.

- [ ] **Step 4: Estendi `packages.controller.ts`**

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type { PackageDTO } from '@coralyn/contracts';
import { CatalogService } from './catalog.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

@Controller('packages')
export class PackagesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(): Promise<PackageDTO[]> {
    return this.catalog.listPackages();
  }

  @Post()
  create(@Body() body: CreatePackageDto): Promise<PackageDTO> {
    return this.catalog.createPackage(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdatePackageDto): Promise<PackageDTO> {
    return this.catalog.updatePackage(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<PackageDTO> {
    return this.catalog.deletePackage(id);
  }
}
```

- [ ] **Step 5: Esegui lo spec Packages e verifica che passi**

Run: `cd apps/api && corepack pnpm test:e2e -- packages`
Expected: PASS.

---

### Task 6: Rates — service, controller, proiezione + 409 non-ambiguità (e2e test-first)

**Files:**
- Create: `apps/api/src/catalog/rate.projection.ts`, `rates.service.ts`, `rates.controller.ts`
- Modify: `apps/api/src/catalog/catalog.module.ts`
- Test: `apps/api/test/rates.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService.forTenant`, `TenantContext`, `CreateRateDto`/`UpdateRateDto`, `toDbDate`/`formatDbDate`, `seedMapTenant` (helper e2e).
- Produces: `RatesService.list(seasonId)/create(input)/update(id,input)/remove(id)` → `RateDTO`; rotte `GET/POST/PATCH/DELETE /api/rates`. Duplicato di firma → **409**.

- [ ] **Step 1: Scrivi lo spec e2e fallito `apps/api/test/rates.e2e-spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { seedMapTenant, cleanMapTenant, type MapSeedIds } from './helpers/seed-map';

describe('Rates (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let token1: string;
  let token2: string;
  let ids: MapSeedIds;
  let seasonId: string;
  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Rate A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Rate B' } })).id;
    await createUser(prisma, { email: 'admin.ra1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'admin.ra2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    token1 = await login(app, 'admin.ra1@e2e.test', 'pw1');
    token2 = await login(app, 'admin.ra2@e2e.test', 'pw2');
    ids = await seedMapTenant(prisma, s1); // umbrelle + fasce per il quote di chiusura cerchio
    // stagione 2028 creata via API (crea anche il Pricing 1:1)
    seasonId = (await request(app.getHttpServer())
      .post('/api/seasons').set(...bearer(token1))
      .send({ name: 'Estate 2028', startDate: '2028-06-01', endDate: '2028-09-30' })).body.id;
  });

  afterAll(async () => {
    await prisma.forTenant(s1, async (tx) => {
      await tx.rate.deleteMany({});
      await tx.pricing.deleteMany({});
      await tx.season.deleteMany({});
    });
    await cleanMapTenant(prisma, s1);
    await prisma.user.deleteMany({ where: { email: { in: ['admin.ra1@e2e.test', 'admin.ra2@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('POST crea una catch-all e GET la elenca per stagione', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/rates').set(...bearer(token1)).send({ seasonId, price: 25, unit: 'day' }).expect(201);
    expect(res.body).toMatchObject({ seasonId, price: 25, unit: 'day' });
    expect(res.body.type).toBeUndefined();

    const list = await request(app.getHttpServer()).get(`/api/rates?seasonId=${seasonId}`).set(...bearer(token1)).expect(200);
    expect(list.body.some((r: { id: string }) => r.id === res.body.id)).toBe(true);
  });

  it('POST di una firma duplicata → 409', async () => {
    // già esiste la catch-all del test precedente → un secondo catch-all viola Rate_signature_key
    await request(app.getHttpServer())
      .post('/api/rates').set(...bearer(token1)).send({ seasonId, price: 99, unit: 'day' }).expect(409);
  });

  it('PATCH modifica il prezzo di una tariffa', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/rates').set(...bearer(token1)).send({ seasonId, type: 'subscription', price: 700, unit: 'period' }).expect(201);
    const patched = await request(app.getHttpServer())
      .patch(`/api/rates/${created.body.id}`).set(...bearer(token1)).send({ price: 750 }).expect(200);
    expect(patched.body.price).toBe(750);
  });

  it('DELETE elimina la tariffa e la ritorna; 404 se inesistente', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/rates').set(...bearer(token1)).send({ seasonId, timeSlotId: ids.slotMorning, price: 15, unit: 'day' }).expect(201);
    const del = await request(app.getHttpServer()).delete(`/api/rates/${created.body.id}`).set(...bearer(token1)).expect(200);
    expect(del.body.id).toBe(created.body.id);
    await request(app.getHttpServer()).delete(`/api/rates/${created.body.id}`).set(...bearer(token1)).expect(404);
  });

  it('isolamento: s2 non vede né modifica le tariffe di s1', async () => {
    const list = await request(app.getHttpServer()).get(`/api/rates?seasonId=${seasonId}`).set(...bearer(token2)).expect(200);
    expect(list.body).toEqual([]); // il Pricing di quella stagione appartiene a s1
  });

  it('chiude il cerchio: la nuova catch-all pilota il quote del motore prezzo', async () => {
    // c'è già la catch-all a 25/giorno (day) → un daily nel 2028 deve costare 25
    const quote = await request(app.getHttpServer())
      .get(`/api/bookings/quote?umbrellaId=${ids.u1}&timeSlotId=${ids.slotMorning}&type=daily&startDate=2028-07-01`)
      .set(...bearer(token1)).expect(200);
    expect(quote.body.totalPrice).toBe(25);
  });
});
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `cd apps/api && corepack pnpm test:e2e -- rates`
Expected: FAIL (`/api/rates` non esiste → 404).

- [ ] **Step 3: Implementa `rate.projection.ts`**

```ts
import type { Rate } from '@prisma/client';
import type { RateDTO } from '@coralyn/contracts';
import { formatDbDate } from '../common/dates';

/** Proietta una Rate nel DTO: `pricingId` interno → `seasonId` esposto; null → undefined;
 *  Decimal → number; @db.Date → ISO. Il chiamante passa il `seasonId` risolto. */
export function toRateDTO(r: Rate, seasonId: string): RateDTO {
  return {
    id: r.id,
    seasonId,
    type: r.type ?? undefined,
    sectorId: r.sectorId ?? undefined,
    rowId: r.rowId ?? undefined,
    packageId: r.packageId ?? undefined,
    timeSlotId: r.timeSlotId ?? undefined,
    periodStart: r.periodStart ? formatDbDate(r.periodStart) : undefined,
    periodEnd: r.periodEnd ? formatDbDate(r.periodEnd) : undefined,
    price: Number(r.price),
    unit: r.unit,
  };
}
```

- [ ] **Step 4: Implementa `rates.service.ts`**

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateRateInput, RateDTO, UpdateRateInput } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { toDbDate } from '../common/dates';
import { toRateDTO } from './rate.projection';

@Injectable()
export class RatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** Traduce la violazione di Rate_signature_key (23505 → Prisma P2002) in 409; rilancia il resto. */
  private mapConflict(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException('Esiste già una tariffa con queste dimensioni per questa stagione.');
    }
    throw e;
  }

  async list(seasonId: string | undefined): Promise<RateDTO[]> {
    if (!seasonId) return [];
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, async (tx) => {
      const pricing = await tx.pricing.findFirst({ where: { seasonId } });
      if (!pricing) return [];
      return tx.rate.findMany({ where: { pricingId: pricing.id } });
    });
    return rows.map((r) => toRateDTO(r, seasonId));
  }

  async create(input: CreateRateInput): Promise<RateDTO> {
    const tenantId = this.tenant.require();
    try {
      const rate = await this.prisma.forTenant(tenantId, async (tx) => {
        const pricing = await tx.pricing.findFirst({ where: { seasonId: input.seasonId } });
        if (!pricing) throw new NotFoundException('Stagione non trovata');
        return tx.rate.create({
          data: {
            establishmentId: tenantId,
            pricingId: pricing.id,
            type: input.type ?? null,
            sectorId: input.sectorId ?? null,
            rowId: input.rowId ?? null,
            packageId: input.packageId ?? null,
            timeSlotId: input.timeSlotId ?? null,
            periodStart: input.periodStart ? toDbDate(input.periodStart) : null,
            periodEnd: input.periodEnd ? toDbDate(input.periodEnd) : null,
            price: input.price,
            unit: input.unit,
          },
        });
      });
      return toRateDTO(rate, input.seasonId);
    } catch (e) {
      this.mapConflict(e); // rilancia NotFound/altri invariati; P2002 → 409
    }
  }

  async update(id: string, input: UpdateRateInput): Promise<RateDTO> {
    const tenantId = this.tenant.require();
    try {
      const result = await this.prisma.forTenant(tenantId, async (tx) => {
        const existing = await tx.rate.findFirst({ where: { id }, include: { pricing: true } });
        if (!existing) return null;
        const data: Prisma.RateUncheckedUpdateInput = {};
        if ('type' in input) data.type = input.type ?? null;
        if ('sectorId' in input) data.sectorId = input.sectorId ?? null;
        if ('rowId' in input) data.rowId = input.rowId ?? null;
        if ('packageId' in input) data.packageId = input.packageId ?? null;
        if ('timeSlotId' in input) data.timeSlotId = input.timeSlotId ?? null;
        if ('periodStart' in input) data.periodStart = input.periodStart ? toDbDate(input.periodStart) : null;
        if ('periodEnd' in input) data.periodEnd = input.periodEnd ? toDbDate(input.periodEnd) : null;
        if (input.price !== undefined) data.price = input.price;
        if (input.unit !== undefined) data.unit = input.unit;
        const updated = await tx.rate.update({ where: { id }, data });
        return { updated, seasonId: existing.pricing.seasonId };
      });
      if (!result) throw new NotFoundException('Tariffa non trovata');
      return toRateDTO(result.updated, result.seasonId);
    } catch (e) {
      this.mapConflict(e);
    }
  }

  async remove(id: string): Promise<RateDTO> {
    const tenantId = this.tenant.require();
    const result = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.rate.findFirst({ where: { id }, include: { pricing: true } });
      if (!existing) return null;
      await tx.rate.delete({ where: { id } });
      return existing;
    });
    if (!result) throw new NotFoundException('Tariffa non trovata');
    return toRateDTO(result, result.pricing.seasonId);
  }
}
```

> **Gotcha Prisma da verificare in Step 6**: l'indice `Rate_signature_key` è raw (non in `schema.prisma`), ma Prisma mappa comunque il 23505 del driver a `PrismaClientKnownRequestError` con `code === 'P2002'`. Se il test 409 dovesse fallire mostrando un altro codice (es. `P2010`/raw), leggere `e.code`/`e.message` dall'errore reale e adattare la guardia in `mapConflict` (è l'unico punto da toccare). Il test e2e "firma duplicata → 409" è il gate che lo conferma dal vivo.

- [ ] **Step 5: Implementa `rates.controller.ts`**

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { RateDTO } from '@coralyn/contracts';
import { RatesService } from './rates.service';
import { CreateRateDto } from './dto/create-rate.dto';
import { UpdateRateDto } from './dto/update-rate.dto';

@Controller('rates')
export class RatesController {
  constructor(private readonly rates: RatesService) {}

  @Get()
  list(@Query('seasonId') seasonId?: string): Promise<RateDTO[]> {
    return this.rates.list(seasonId);
  }

  @Post()
  create(@Body() body: CreateRateDto): Promise<RateDTO> {
    return this.rates.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateRateDto): Promise<RateDTO> {
    return this.rates.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<RateDTO> {
    return this.rates.remove(id);
  }
}
```

- [ ] **Step 6: Registra Rates in `catalog.module.ts`**

```ts
import { RatesController } from './rates.controller';
import { RatesService } from './rates.service';
// ...
@Module({
  controllers: [PackagesController, SeasonsController, RatesController],
  providers: [CatalogService, SeasonsService, RatesService],
  exports: [CatalogService],
})
export class CatalogModule {}
```

- [ ] **Step 7: Esegui lo spec Rates e verifica che passi** (incluso il 409 e la chiusura del cerchio)

Run: `cd apps/api && corepack pnpm test:e2e -- rates`
Expected: PASS (se il 409 fallisce, applica la nota del Step 4 e ripeti).

---

### Task 7: Regressione backend completa + commit del Layer 2

- [ ] **Step 1: Esegui l'INTERA suite unit + e2e**

Run: `cd apps/api && corepack pnpm test && corepack pnpm test:e2e`
Expected: PASS. Unit ≥ **70** (68 baseline + 2 nuovi spec DTO); e2e ≥ **73 + i nuovi** (seasons/packages/rates); **0 regressioni** sulle 5 suite preesistenti.

- [ ] **Step 2: Lint + build del monorepo**

Run (dalla root): `corepack pnpm eslint . && corepack pnpm -r build`
Expected: PASS.

- [ ] **Step 3: Commit (chiude il Layer 2)**

```bash
git add apps/api/src/common/is-calendar-date.ts apps/api/src/common/uuid.ts apps/api/src/catalog apps/api/src/bookings/dto apps/api/src/app.module.ts apps/api/test/seasons.e2e-spec.ts apps/api/test/packages.e2e-spec.ts apps/api/test/rates.e2e-spec.ts
git rm apps/api/src/bookings/dto/is-calendar-date.ts
git commit -m "feat(api): CRUD listino — seasons/packages/rates con cascade applicativa e 409 non-ambiguità (D-032)"
```

---

## LAYER 3 — FRONTEND

> Riscrive `PricingView.vue` da mock a reale. TDD con Vitest + MSW: prima si estende il mock server, poi si testano composable e vista. **Un solo commit alla fine del layer.**

### Task 8: Query keys + mock handlers MSW

**Files:**
- Modify: `apps/web-staff/src/lib/queryKeys.ts`
- Modify: `apps/web-staff/src/mocks/server.ts`

**Interfaces:**
- Produces: `queryKeys.seasons(tenantId)`, `queryKeys.rates(tenantId, seasonId)`; handler MSW mutabili per `/seasons`, `/rates`, e scritture `/packages`.

- [ ] **Step 1: Aggiungi le query key in `lib/queryKeys.ts`**

```ts
export const queryKeys = {
  customers: (tenantId: string) => ['customers', tenantId] as const,
  customer: (tenantId: string, id: string) => ['customer', tenantId, id] as const,
  dayMap: (tenantId: string, date: string) => ['map', tenantId, date] as const,
  bookings: (tenantId: string, date: string) => ['bookings', tenantId, date] as const,
  packages: (tenantId: string) => ['packages', tenantId] as const,
  subscriptions: (tenantId: string, date: string) => ['subscriptions', tenantId, date] as const,
  seasons: (tenantId: string) => ['seasons', tenantId] as const,
  rates: (tenantId: string, seasonId: string) => ['rates', tenantId, seasonId] as const,
};
```

- [ ] **Step 2: Estendi il mock server `mocks/server.ts` con handler mutabili in-memory**

Sostituisci l'handler statico `http.get('/api/packages', ...)` e aggiungi seasons/rates. Inserisci vicino agli altri seed in-memory (dopo `resetCustomersSeed`):

```ts
import type { PackageDTO, RateDTO, SeasonDTO } from '@coralyn/contracts';

// --- Listino (D-032): stato mutabile in-memory per i test dell'editor ---
const SEASON_1: SeasonDTO = { id: 'se-1', name: 'Estate 2026', startDate: '2026-06-01', endDate: '2026-09-15' };
let seasons: SeasonDTO[] = [SEASON_1];
let packages: PackageDTO[] = [{ id: 'pkg-1', name: 'Standard', equipment: { sunbeds: 2 } }];
let rates: RateDTO[] = [{ id: 'ra-1', seasonId: 'se-1', price: 28, unit: 'day' }];
export function resetPricingSeed() {
  seasons = [SEASON_1];
  packages = [{ id: 'pkg-1', name: 'Standard', equipment: { sunbeds: 2 } }];
  rates = [{ id: 'ra-1', seasonId: 'se-1', price: 28, unit: 'day' }];
}
```

Registra gli handler nell'array `setupServer(...)` (sostituisci il `GET /api/packages` statico):

```ts
  // Seasons
  http.get('/api/seasons', () => HttpResponse.json(seasons)),
  http.post('/api/seasons', async ({ request }) => {
    const b = (await request.json()) as Omit<SeasonDTO, 'id'>;
    const created: SeasonDTO = { id: `se-${seasons.length + 1}`, ...b };
    seasons.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.delete('/api/seasons/:id', ({ params }) => {
    const i = seasons.findIndex((s) => s.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    const [removed] = seasons.splice(i, 1);
    rates = rates.filter((r) => r.seasonId !== removed.id);
    return HttpResponse.json(removed);
  }),
  // Packages (CRUD)
  http.get('/api/packages', () => HttpResponse.json(packages)),
  http.post('/api/packages', async ({ request }) => {
    const b = (await request.json()) as Omit<PackageDTO, 'id'>;
    const created: PackageDTO = { id: `pkg-${packages.length + 1}`, ...b };
    packages.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch('/api/packages/:id', async ({ params, request }) => {
    const patch = (await request.json()) as Partial<PackageDTO>;
    const i = packages.findIndex((p) => p.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    packages[i] = { ...packages[i], ...patch };
    return HttpResponse.json(packages[i]);
  }),
  http.delete('/api/packages/:id', ({ params }) => {
    const i = packages.findIndex((p) => p.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    const [removed] = packages.splice(i, 1);
    return HttpResponse.json(removed);
  }),
  // Rates (CRUD, filtrate per stagione)
  http.get('/api/rates', ({ request }) => {
    const seasonId = new URL(request.url).searchParams.get('seasonId') ?? '';
    return HttpResponse.json(rates.filter((r) => r.seasonId === seasonId));
  }),
  http.post('/api/rates', async ({ request }) => {
    const b = (await request.json()) as Omit<RateDTO, 'id'>;
    const created: RateDTO = { id: `ra-${rates.length + 1}`, ...b };
    rates.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch('/api/rates/:id', async ({ params, request }) => {
    const patch = (await request.json()) as Partial<RateDTO>;
    const i = rates.findIndex((r) => r.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    rates[i] = { ...rates[i], ...patch };
    return HttpResponse.json(rates[i]);
  }),
  http.delete('/api/rates/:id', ({ params }) => {
    const i = rates.findIndex((r) => r.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    const [removed] = rates.splice(i, 1);
    return HttpResponse.json(removed);
  }),
```

- [ ] **Step 3: Resetta il seed listino tra i test in `src/test/setup.ts`**

```ts
import { server, resetCustomersSeed, resetPricingSeed } from '@/mocks/server';
// ...
beforeEach(() => { resetCustomersSeed(); resetPricingSeed(); });
```

- [ ] **Step 4: Verifica che la suite FE esistente resti verde** (nessun test rotto dal cambio handler)

Run (dalla root): `corepack pnpm --filter @coralyn/web-staff test`
Expected: PASS, **83** test (nessuna regressione; non abbiamo ancora aggiunto test nuovi).

---

### Task 9: Composable server-state del listino (test-first)

**Files:**
- Create: `apps/web-staff/src/features/pricing/useSeasons.ts`, `apps/web-staff/src/features/pricing/useRates.ts`
- Modify: `apps/web-staff/src/features/bookings/usePackages.ts`
- Test: `apps/web-staff/src/features/pricing/useSeasons.spec.ts`

**Interfaces:**
- Consumes: `queryResource`/`mutationResource`, `apiFetch`, `queryKeys`, `useSessionStore`.
- Produces: `useSeasons`, `useCreateSeason`, `useDeleteSeason`, `useRates(getSeasonId)`, `useCreateRate(getSeasonId)`, `useUpdateRate(getSeasonId)`, `useDeleteRate(getSeasonId)`, `useCreatePackage`, `useUpdatePackage`, `useDeletePackage`.

- [ ] **Step 1: Scrivi lo spec fallito `features/pricing/useSeasons.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { useSeasons, useCreateSeason } from './useSeasons';

const Probe = defineComponent({
  setup() {
    const q = useSeasons();
    const m = useCreateSeason();
    return () =>
      h('div', [
        h('span', { class: 'names' }, (q.data.value ?? []).map((s) => s.name).join(',')),
        h('button', { onClick: () => m.mutate({ name: 'Estate 2027', startDate: '2027-06-01', endDate: '2027-09-15' }) }, 'add'),
      ]);
  },
});

describe('useSeasons', () => {
  it('legge le stagioni dal mock', async () => {
    const w = mountApp(Probe);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(w.find('.names').text()).toContain('Estate 2026');
  });

  it('crea una stagione e invalida la lista', async () => {
    const w = mountApp(Probe);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await w.find('button').trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(w.find('.names').text()).toContain('Estate 2027');
  });
});
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run (dalla root): `corepack pnpm --filter @coralyn/web-staff test -- useSeasons`
Expected: FAIL ("Cannot find module './useSeasons'").

- [ ] **Step 3: Implementa `features/pricing/useSeasons.ts`**

```ts
import type { CreateSeasonInput, SeasonDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

export function useSeasons() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.seasons(session.establishmentId),
    queryFn: () => apiFetch<SeasonDTO[]>('/seasons'),
  });
}

export function useCreateSeason() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateSeasonInput) =>
      apiFetch<SeasonDTO>('/seasons', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.seasons(session.establishmentId)],
  });
}

export function useDeleteSeason() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<SeasonDTO>(`/seasons/${id}`, { method: 'DELETE' }),
    invalidates: () => [queryKeys.seasons(session.establishmentId)],
  });
}
```

- [ ] **Step 4: Implementa `features/pricing/useRates.ts`**

```ts
import type { CreateRateInput, RateDTO, UpdateRateInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

/** `getSeasonId` è un thunk: la stagione attiva è stato reattivo della vista. */
export function useRates(getSeasonId: () => string) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.rates(session.establishmentId, getSeasonId()),
    queryFn: () => apiFetch<RateDTO[]>(`/rates?seasonId=${getSeasonId()}`),
    enabled: () => !!getSeasonId(),
  });
}

export function useCreateRate(getSeasonId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateRateInput) =>
      apiFetch<RateDTO>('/rates', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.rates(session.establishmentId, getSeasonId())],
  });
}

export function useUpdateRate(getSeasonId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string; input: UpdateRateInput }) =>
      apiFetch<RateDTO>(`/rates/${vars.id}`, { method: 'PATCH', body: JSON.stringify(vars.input) }),
    invalidates: () => [queryKeys.rates(session.establishmentId, getSeasonId())],
  });
}

export function useDeleteRate(getSeasonId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<RateDTO>(`/rates/${id}`, { method: 'DELETE' }),
    invalidates: () => [queryKeys.rates(session.establishmentId, getSeasonId())],
  });
}
```

- [ ] **Step 5: Estendi `features/bookings/usePackages.ts` con le mutation**

```ts
import type { CreatePackageInput, PackageDTO, UpdatePackageInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

/** Lista dei pacchetti del tenant per il selettore del modale. */
export function usePackages() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.packages(session.establishmentId),
    queryFn: () => apiFetch<PackageDTO[]>('/packages'),
  });
}

export function useCreatePackage() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreatePackageInput) =>
      apiFetch<PackageDTO>('/packages', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.packages(session.establishmentId)],
  });
}

export function useUpdatePackage() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string; input: UpdatePackageInput }) =>
      apiFetch<PackageDTO>(`/packages/${vars.id}`, { method: 'PATCH', body: JSON.stringify(vars.input) }),
    invalidates: () => [queryKeys.packages(session.establishmentId)],
  });
}

export function useDeletePackage() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<PackageDTO>(`/packages/${id}`, { method: 'DELETE' }),
    invalidates: () => [queryKeys.packages(session.establishmentId)],
  });
}
```

- [ ] **Step 6: Esegui lo spec composable e verifica che passi**

Run (dalla root): `corepack pnpm --filter @coralyn/web-staff test -- useSeasons`
Expected: PASS.

---

### Task 10: `PricingView.vue` — editor reale (test-first)

**Files:**
- Modify: `apps/web-staff/src/features/pricing/PricingView.vue`
- Test: `apps/web-staff/src/features/pricing/PricingView.spec.ts`

**Interfaces:**
- Consumes: `useSeasons`/`useCreateSeason`/`useDeleteSeason`, `useRates`/`useCreateRate`/`useUpdateRate`/`useDeleteRate`, `usePackages`/`useCreatePackage`/`useUpdatePackage`/`useDeletePackage`, `useDayMap` (per settori/file/fasce), `ui-kit` (`PageToolbar`, `Card`, `DataTable`, `Modal`, `Field`, `Input`, `Select`, `Button`, `Icon`, `formatEuro`).

- [ ] **Step 1: Scrivi lo spec fallito `features/pricing/PricingView.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import PricingView from './PricingView.vue';

const settle = async () => {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
};

describe('PricingView', () => {
  it('mostra la stagione, i pacchetti e le tariffe reali dal mock', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    expect(w.text()).toContain('Estate 2026'); // stagione dal mock
    expect(w.text()).toContain('Standard');    // pacchetto dal mock
    expect(w.text()).toContain('28');          // tariffa catch-all (28/giorno)
  });

  it('crea un pacchetto dal modale e compare tra le card', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="new-package"]').trigger('click');
    await flushPromises();
    const set = (name: string, val: string) => {
      const el = document.querySelector(`[data-test="form-package"] input[name="${name}"]`) as HTMLInputElement;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('name', 'Prestige');
    (document.querySelector('[data-test="form-package"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(w.text()).toContain('Prestige');
  });

  it('crea una tariffa dal modale e compare in tabella', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="new-rate"]').trigger('click');
    await flushPromises();
    const setPrice = (val: string) => {
      const el = document.querySelector('[data-test="form-rate"] input[name="price"]') as HTMLInputElement;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setPrice('42');
    (document.querySelector('[data-test="form-rate"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(w.text()).toContain('42');
  });
});
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run (dalla root): `corepack pnpm --filter @coralyn/web-staff test -- PricingView`
Expected: FAIL (la vista mock non ha `data-test="new-package"`/`new-rate` né dati reali).

- [ ] **Step 3: Riscrivi `PricingView.vue`** (mock → reale, riusando i componenti `ui-kit`)

```vue
<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { Button, Card, DataTable, Modal, Field, Input, Select, Icon, PageToolbar, formatEuro } from '@coralyn/ui-kit';
import type { BookingType, RateUnit } from '@coralyn/contracts';
import { useSeasons, useCreateSeason, useDeleteSeason } from './useSeasons';
import { useRates, useCreateRate, useUpdateRate, useDeleteRate } from './useRates';
import { usePackages, useCreatePackage, useDeletePackage } from '@/features/bookings/usePackages';
import { useDayMap } from '@/features/map/useDayMap';

// --- Stagioni ---
const { data: seasons } = useSeasons();
const createSeason = useCreateSeason();
const deleteSeason = useDeleteSeason();
const activeSeasonId = ref('');
const seasonOptions = computed(() => (seasons.value ?? []).map((s) => ({ value: s.id, label: s.name })));
// Seleziona la prima stagione appena arrivano i dati, se non ce n'è già una attiva.
watchEffect(() => {
  if (!activeSeasonId.value && (seasons.value?.length ?? 0) > 0) activeSeasonId.value = seasons.value![0].id;
});
const getSeasonId = () => activeSeasonId.value;

// --- Pacchetti ---
const { data: packages } = usePackages();
const createPackage = useCreatePackage();
const deletePackage = useDeletePackage();

// --- Tariffe ---
const { data: rates } = useRates(getSeasonId);
const createRate = useCreateRate(getSeasonId);
const updateRate = useUpdateRate(getSeasonId);
const deleteRate = useDeleteRate(getSeasonId);

// --- Dimensioni per il modale tariffa (da mappa + pacchetti) ---
const { data: dayMap } = useDayMap();
const sectorOptions = computed(() => (dayMap.value?.sectors ?? []).map((s) => ({ value: s.id, label: s.name })));
const timeSlotOptions = computed(() => (dayMap.value?.timeSlots ?? []).map((t) => ({ value: t.id, label: t.name })));
const packageOptions = computed(() => (packages.value ?? []).map((p) => ({ value: p.id, label: p.name })));
const TYPE_OPTIONS: { value: BookingType; label: string }[] = [
  { value: 'daily', label: 'Giornaliera' }, { value: 'periodic', label: 'Periodica' }, { value: 'subscription', label: 'Abbonamento' },
];
const UNIT_OPTIONS: { value: RateUnit; label: string }[] = [
  { value: 'day', label: 'Al giorno' }, { value: 'period', label: 'Forfait periodo' },
];

// --- Modale stagione ---
const seasonModal = ref(false);
const sName = ref(''); const sStart = ref(''); const sEnd = ref('');
function submitSeason() {
  if (!sName.value || !sStart.value || !sEnd.value) return;
  createSeason.mutate(
    { name: sName.value, startDate: sStart.value, endDate: sEnd.value },
    { onSuccess: (s) => { activeSeasonId.value = s.id; sName.value = sStart.value = sEnd.value = ''; seasonModal.value = false; } },
  );
}

// --- Modale pacchetto ---
const pkgModal = ref(false);
const pName = ref(''); const pSunbeds = ref('2');
function submitPackage() {
  if (!pName.value) return;
  createPackage.mutate(
    { name: pName.value, equipment: { sunbeds: Number(pSunbeds.value) || 0 } },
    { onSuccess: () => { pName.value = ''; pSunbeds.value = '2'; pkgModal.value = false; } },
  );
}

// --- Modale tariffa ---
const rateModal = ref(false);
const rType = ref(''); const rSector = ref(''); const rPackage = ref(''); const rSlot = ref('');
const rPrice = ref(''); const rUnit = ref<RateUnit>('day');
function submitRate() {
  if (!activeSeasonId.value || rPrice.value === '') return;
  createRate.mutate(
    {
      seasonId: activeSeasonId.value,
      type: (rType.value || undefined) as BookingType | undefined,
      sectorId: rSector.value || undefined,
      packageId: rPackage.value || undefined,
      timeSlotId: rSlot.value || undefined,
      price: Number(rPrice.value),
      unit: rUnit.value,
    },
    { onSuccess: () => { rType.value = rSector.value = rPackage.value = rSlot.value = ''; rPrice.value = ''; rUnit.value = 'day'; rateModal.value = false; } },
  );
}

// --- Etichette per la tabella tariffe ---
function pkgName(id?: string) { return packages.value?.find((p) => p.id === id)?.name ?? '—'; }
function slotName(id?: string) { return dayMap.value?.timeSlots.find((t) => t.id === id)?.name ?? '—'; }
function sectorName(id?: string) { return dayMap.value?.sectors.find((s) => s.id === id)?.name ?? 'Tutti'; }
const rateCols = [
  { key: 'position', label: 'Posizione' },
  { key: 'package', label: 'Pacchetto' },
  { key: 'slot', label: 'Fascia' },
  { key: 'type', label: 'Tipo' },
  { key: 'price', label: 'Prezzo', align: 'right' as const },
  { key: 'actions', label: '' },
];
</script>

<template>
  <section class="px-[26px] pb-[30px] pt-[22px]">
    <PageToolbar>
      <template #left>
        <Field label="Stagione">
          <Select v-model="activeSeasonId" :options="seasonOptions" data-test="season-select" />
        </Field>
        <Button variant="secondary" data-test="new-season" @click="seasonModal = true"><Icon name="plus" :size="16" />Stagione</Button>
        <Button
          v-if="activeSeasonId"
          variant="danger"
          data-test="delete-season"
          @click="deleteSeason.mutate(activeSeasonId, { onSuccess: () => (activeSeasonId = '') })"
        ><Icon name="trash-2" :size="16" />Elimina stagione</Button>
      </template>
      <template #right>
        <Button data-test="new-package" variant="secondary" @click="pkgModal = true"><Icon name="plus" :size="16" />Pacchetto</Button>
        <Button data-test="new-rate" :disabled="!activeSeasonId" @click="rateModal = true"><Icon name="plus" :size="16" />Nuova tariffa</Button>
      </template>
    </PageToolbar>

    <!-- Card pacchetti -->
    <div class="mb-3.5 grid grid-cols-3 gap-3.5">
      <Card v-for="p in packages" :key="p.id">
        <div class="p-[18px]">
          <div class="mb-2.5 flex items-center justify-between">
            <span class="text-[15px] font-bold text-[var(--color-text)]">{{ p.name }}</span>
            <button class="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
              :data-test="`del-pkg-${p.id}`" @click="deletePackage.mutate(p.id)"><Icon name="trash-2" :size="15" /></button>
          </div>
          <div class="min-h-[40px] text-[12.5px] leading-relaxed text-[var(--color-text-2nd)]">
            {{ Object.entries(p.equipment).map(([k, v]) => `${v} ${k}`).join(' · ') || 'Nessuna dotazione' }}
          </div>
        </div>
      </Card>
    </div>

    <!-- Tabella tariffe -->
    <DataTable :columns="rateCols">
      <tr v-for="r in rates" :key="r.id" class="hover:bg-[var(--color-raised)]">
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5 font-semibold text-[var(--color-text)]">{{ sectorName(r.sectorId) }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ pkgName(r.packageId) }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ slotName(r.timeSlotId) }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ r.type ?? 'Tutti' }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-right tabular-nums text-[var(--color-text)]">{{ formatEuro(r.price) }}</td>
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5 text-right">
          <button class="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
            :data-test="`del-rate-${r.id}`" @click="deleteRate.mutate(r.id)"><Icon name="trash-2" :size="15" /></button>
        </td>
      </tr>
    </DataTable>

    <!-- Modale stagione -->
    <Modal v-model:open="seasonModal" title="Nuova stagione">
      <form data-test="form-season" class="flex flex-col gap-4" @submit.prevent="submitSeason">
        <Field label="Nome"><Input name="name" v-model="sName" placeholder="Estate 2027" /></Field>
        <div class="flex gap-3.5">
          <div class="flex-1"><Field label="Inizio"><Input name="startDate" v-model="sStart" type="date" /></Field></div>
          <div class="flex-1"><Field label="Fine"><Input name="endDate" v-model="sEnd" type="date" /></Field></div>
        </div>
        <div class="flex justify-end gap-2.5 pt-1">
          <Button variant="secondary" type="button" @click="seasonModal = false">Annulla</Button>
          <Button type="submit">Crea stagione</Button>
        </div>
      </form>
    </Modal>

    <!-- Modale pacchetto -->
    <Modal v-model:open="pkgModal" title="Nuovo pacchetto">
      <form data-test="form-package" class="flex flex-col gap-4" @submit.prevent="submitPackage">
        <Field label="Nome"><Input name="name" v-model="pName" placeholder="Comfort" /></Field>
        <Field label="Lettini"><Input name="sunbeds" v-model="pSunbeds" type="number" /></Field>
        <div class="flex justify-end gap-2.5 pt-1">
          <Button variant="secondary" type="button" @click="pkgModal = false">Annulla</Button>
          <Button type="submit">Salva pacchetto</Button>
        </div>
      </form>
    </Modal>

    <!-- Modale tariffa -->
    <Modal v-model:open="rateModal" title="Nuova tariffa">
      <form data-test="form-rate" class="flex flex-col gap-4" @submit.prevent="submitRate">
        <div class="flex gap-3.5">
          <div class="flex-1"><Field label="Tipo (opz.)"><Select v-model="rType" :options="TYPE_OPTIONS"><option value="">Tutti</option></Select></Field></div>
          <div class="flex-1"><Field label="Settore (opz.)"><Select v-model="rSector" :options="sectorOptions"><option value="">Tutti</option></Select></Field></div>
        </div>
        <div class="flex gap-3.5">
          <div class="flex-1"><Field label="Pacchetto (opz.)"><Select v-model="rPackage" :options="packageOptions"><option value="">Nessuno</option></Select></Field></div>
          <div class="flex-1"><Field label="Fascia (opz.)"><Select v-model="rSlot" :options="timeSlotOptions"><option value="">Tutte</option></Select></Field></div>
        </div>
        <div class="flex gap-3.5">
          <div class="flex-1"><Field label="Prezzo (€)"><Input name="price" v-model="rPrice" type="number" step="0.01" placeholder="28.00" /></Field></div>
          <div class="flex-1"><Field label="Unità"><Select v-model="rUnit" :options="UNIT_OPTIONS" /></Field></div>
        </div>
        <div class="flex justify-end gap-2.5 pt-1">
          <Button variant="secondary" type="button" @click="rateModal = false">Annulla</Button>
          <Button type="submit">Crea tariffa</Button>
        </div>
      </form>
    </Modal>
  </section>
</template>
```

> **Nota implementativa (Step 3):** verifica i nomi icona (`trash-2`, `plus`) contro `packages/ui-kit/src/icons/registry.ts`; se `trash-2` non è registrata, usa un'icona equivalente già presente o aggiungila al registry (additivo — ADR-0018). Verifica che `Select` accetti sia `:options` sia lo slot `#default` con `<option>` (design-system §10 lo conferma: `v-model` + `props.options` **o** slot). Se il tuo `Select` non supporta un `<option value="">` di default insieme a `:options`, elimina `:options` e passa tutte le `<option>` via slot. Mantieni lo stile dei token/mock (nessuna fedeltà pixel richiesta al mock attuale, solo al linguaggio visivo — spec §6).

- [ ] **Step 4: Esegui lo spec `PricingView` e verifica che passi**

Run (dalla root): `corepack pnpm --filter @coralyn/web-staff test -- PricingView`
Expected: PASS.

- [ ] **Step 5: Verifica visiva dal vivo** (dev server + preview)

Avvia il dev server di `web-staff` e naviga a Listino. Login: `admin@coralyn.dev` / `coralyn-admin-8473` (vedi memoria `coralyn-dev-preview-env`). Controlla: selettore stagione popolato, card pacchetti reali, tabella tariffe reale, i 3 modali (stagione/pacchetto/tariffa) creano e la lista si aggiorna. Se un endpoint risponde 404 su ciò che il codice prevede, **rebuilda il container API prima di sospettare un bug**: `docker compose --profile full up -d --build api` (gotcha noto). Cattura uno screenshot come prova.

---

### Task 11: Regressione FE completa + commit del Layer 3

- [ ] **Step 1: Esegui l'intera suite FE**

Run (dalla root): `corepack pnpm --filter @coralyn/web-staff test`
Expected: PASS. Totale ≥ **85** (83 baseline + `useSeasons` 2 + `PricingView` 3 = **88**), ui-kit invariato a **41**. **0 regressioni.**

- [ ] **Step 2: Lint + build**

Run (dalla root): `corepack pnpm eslint . && corepack pnpm -r build`
Expected: PASS.

- [ ] **Step 3: Commit (chiude il Layer 3)**

```bash
git add apps/web-staff/src/lib/queryKeys.ts apps/web-staff/src/mocks/server.ts apps/web-staff/src/test/setup.ts apps/web-staff/src/features/pricing apps/web-staff/src/features/bookings/usePackages.ts
git commit -m "feat(web-staff): editor listino reale — stagioni, pacchetti, tariffe (D-032)"
```

---

## Verifica finale (prima del handoff)

- [ ] Backend: `cd apps/api && corepack pnpm test && corepack pnpm test:e2e` → verde, conteggi ≥ baseline.
- [ ] Frontend: `corepack pnpm --filter @coralyn/web-staff test` → verde, **88 / 41**.
- [ ] Root: `corepack pnpm -r build && corepack pnpm eslint .` → verde.
- [ ] Tre commit sul branch (contratti · backend · frontend); `git log --oneline -3` coerente.
- [ ] Verifica visiva live dell'editor (screenshot allegato).
- [ ] Aggiorna `docs/architecture/deferred.md`: sposta **D-032** in "Risolte" con riferimento a questa implementazione (e nota "nessun ADR: incremento CRUD"). Aggiorna il glossario se un termine nuovo è emerso (nessuno previsto).

## Self-Review (coverage della spec)

| Requisito spec | Task |
|---|---|
| Contratti `SeasonDTO`/`RateDTO`/input (§4) | Task 1 |
| Nessuna migrazione; 23505 → 409 (§3) | Task 6 (`mapConflict`) |
| `GET/POST/DELETE /seasons` + Pricing 1:1 + cascade applicativa (§5) | Task 4 |
| `POST/PATCH/DELETE /packages` su controller esistente (§5) | Task 5 |
| `GET/POST/PATCH/DELETE /rates`, `seasonId`→`pricingId` (§5) | Task 6 |
| `CatalogModule` esplicito in `AppModule` (§1) | Task 4 Step 6 |
| `Season` senza update (§9.3) | Nessun endpoint PATCH /seasons (per design) |
| FE selettore stagione, card pacchetti CRUD, tabella tariffe CRUD (§6) | Task 10 |
| Riuso `PageToolbar`/`ModalFooter`(→pattern footer)/`Field`/`Input`/`Select`/`formatEuro`/`useQueryResource` (§6) | Task 9–10 |
| E2E "crea stagione → crea tariffa → quote la usa" (§8.7) | Task 6 (chiusura cerchio) |
| Non regredire i test | Task 7, 11 |

> Nota su `ModalFooter`: i modali qui usano la coppia bottoni inline (come `CustomersView`, che pure ha `ModalFooter` disponibile ma usa la coppia inline per il footer del form). Se in review si preferisce `ModalFooter`, è una sostituzione 1:1 additiva senza impatto sui test (che agiscono sul `submit` del form via `data-test`).
