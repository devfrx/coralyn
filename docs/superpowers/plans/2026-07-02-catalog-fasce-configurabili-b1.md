# Fasce configurabili (Slice B1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dare all'operatore il CRUD delle fasce orarie (crea/rinomina/ri-tima/elimina) dalla vista Listino, esponendo gli orari "HH:MM" nel DTO mappa e derivando le due metà della cella mappa dagli orari (robuste al pattern *Giornata intera + Mattina + Pomeriggio*), senza regredire disponibilità/prezzo/mappa.

**Architecture:** quattro layer coesi, **un commit per layer**, da un nuovo branch `catalog-fasce-configurabili` (già creato da `main`). (1) Contratti + backend CRUD `TimeSlots` nel `CatalogModule`, orari round-trip UTC in `common/time.ts`, delete-guard 409. (2) Esposizione orari nella proiezione mappa. (3) FE editor fasce nel Listino (modale add/edit + delete via `ConfirmDialog`). (4) FE mappa: due metà derivate dagli orari con fallback documentato.

**Tech Stack:** NestJS + Prisma (Postgres, RLS `forTenant`), class-validator; Vue 3 `<script setup>` + composable `queryResource`/`mutationResource` + MSW; Jest (api unit + e2e), Vitest (web-staff, globa ui-kit).

## Global Constraints

- **Convenzione:** codice/DB in inglese; UI/documentazione in italiano.
- **Baseline test da NON regredire** (verificata live 2026-07-02): **api unit 84 · api e2e 114 · web-staff 128 (globa ui-kit) · ui-kit standalone 55.** I conteggi devono solo **crescere**; nessun test rimosso.
- **Orari `@db.Time` round-trip UTC (ADR-0031):** SEMPRE `getUTCHours/getUTCMinutes` e `new Date('1970-01-01Thh:mm:00Z')`. **Vietati** i metodi locali (`getHours()`/`getDate()`). Unica sede di conversione: `apps/api/src/common/time.ts`.
- **Intervalli semiaperti `[start,end)`** (ADR-0013/0031): confronto lessicografico su "HH:MM" == cronologico.
- **Overlap fra fasce AMMESSO** (ADR-0013, intenzionale): nessuna validazione anti-overlap in create/update — *Giornata intera* può sovrapporsi a *Mattina*/*Pomeriggio*.
- **Nessuna migrazione, nessun nuovo ADR** (incremento su ADR-0013). `startTime`/`endTime`/`sortOrder` e le FK esistono già (`schema.prisma:95-107`; `Booking_timeSlotId_fkey` RESTRICT, `Rate_timeSlotId_fkey` SET NULL). Verifica `prisma migrate status` pulito in Step 0.
- **Dopo aver toccato `@coralyn/contracts`:** `corepack pnpm --filter @coralyn/contracts build` **e** `rm -rf apps/web-staff/node_modules/.vite` prima dei test web-staff.
- **Comandi test** (dalla root):
  - api unit: `corepack pnpm --filter @coralyn/api test`
  - api e2e: `corepack pnpm --filter @coralyn/api test:e2e` (richiede DB su `localhost:5433`)
  - web-staff: `corepack pnpm --filter @coralyn/web-staff test`
  - ui-kit: `corepack pnpm --filter @coralyn/ui-kit test`
  - typecheck web-staff: `corepack pnpm --filter @coralyn/web-staff typecheck`

**Decisioni risolte in fase di piano (fork minori, documentati):**
1. **`TimeSlotDTO.startTime`/`endTime` sono OPZIONALI** (`startTime?: string`). Ragione: additività (spec §3.1 "i consumatori esistenti continuano a funzionare col solo name") → ogni layer resta un commit verde indipendente (la proiezione mappa li aggiunge solo in Layer 2; i consumatori FE non si rompono a Layer 1). Sono comunque SEMPRE valorizzati a runtime da `GET /time-slots` (Layer 1) e dalla mappa (Layer 2). Layer 4 usa il fallback documentato quando assenti.
2. **`startTime >= endTime` → 400 (`BadRequestException`)**, non 422. Ragione: coerenza col sibling `SeasonsService.create` (`startDate > endDate` → `BadRequestException`, 400) che questo slice deve rispecchiare; il **422 nel dominio è riservato agli errori del pricing** (`NO_RATE`/`NO_SEASON`, ADR-0032). La spec §3.2 è internamente contraddittoria ("400/422"); si sceglie la coerenza col pattern del modulo.

---

## Step 0: Preflight (una volta, prima della Task 1)

- [ ] Verifica branch e migrazioni pulite

Run:
```bash
git branch --show-current            # atteso: catalog-fasce-configurabili
git -C apps/api status --short        # atteso: nessuna modifica pendente allo schema
corepack pnpm --filter @coralyn/api exec prisma migrate status
```
Expected: `Database schema is up to date!` (nessuna migrazione pendente). Se compare uno spurio `DROP INDEX "Rate_signature_key"` in un futuro `migrate dev`, **rimuovilo** dal `migration.sql` (non è drift) — ma B1 **non** deve generare migrazioni.

---

## Task 1: Layer 1 — Contratti + backend CRUD TimeSlots

**Files:**
- Modify: `packages/contracts/src/index.ts` (`TimeSlotDTO` +orari; nuovi `CreateTimeSlotInput`/`UpdateTimeSlotInput`)
- Create: `apps/api/src/common/time.ts`
- Create: `apps/api/src/common/time.spec.ts`
- Create: `apps/api/src/common/is-clock-time.ts`
- Create: `apps/api/src/catalog/time-slot.projection.ts`
- Create: `apps/api/src/catalog/dto/create-time-slot.dto.ts`
- Create: `apps/api/src/catalog/dto/update-time-slot.dto.ts`
- Create: `apps/api/src/catalog/time-slots.service.ts`
- Create: `apps/api/src/catalog/time-slots.controller.ts`
- Modify: `apps/api/src/catalog/catalog.module.ts` (registra controller+service)
- Create: `apps/api/test/time-slots.e2e-spec.ts`

**Interfaces:**
- Produces (contracts):
  - `TimeSlotDTO { id: string; name: string; startTime?: string; endTime?: string; sortOrder: number }`
  - `CreateTimeSlotInput { name: string; startTime: string; endTime: string; sortOrder?: number }`
  - `UpdateTimeSlotInput { name?: string; startTime?: string; endTime?: string; sortOrder?: number }`
- Produces (api):
  - `common/time.ts`: `isValidClockTime(s: string): boolean`, `toDbTime(s: string): Date`, `formatDbTime(d: Date): string`
  - `is-clock-time.ts`: `IsClockTime(options?): PropertyDecorator`
  - `time-slot.projection.ts`: `toTimeSlotDTO(row: TimeSlot): TimeSlotDTO`
  - `TimeSlotsService.list()/create(input)/update(id,input)/remove(id)` (tutti `Promise<TimeSlotDTO | TimeSlotDTO[]>`)
  - Rotte: `GET /api/time-slots`, `POST /api/time-slots`, `PATCH /api/time-slots/:id`, `DELETE /api/time-slots/:id`
- Consumes: pattern `SeasonsController`/`RatesController`/`RatesService`, `deletePackage` (`catalog.service.ts:161-177`), `common/dates.ts`, `common/is-calendar-date.ts`, `common/uuid.ts`.

### 1.1 — Helper orari `common/time.ts` (unit-first)

- [ ] **Step 1: Write the failing test** — `apps/api/src/common/time.spec.ts`

```ts
import { isValidClockTime, toDbTime, formatDbTime } from './time';

describe('isValidClockTime', () => {
  it('accetta un orario 24h reale', () => {
    expect(isValidClockTime('08:00')).toBe(true);
    expect(isValidClockTime('23:59')).toBe(true);
    expect(isValidClockTime('00:00')).toBe(true);
  });
  it('rifiuta forma o valore fuori range', () => {
    expect(isValidClockTime('8:00')).toBe(false);
    expect(isValidClockTime('24:00')).toBe(false);
    expect(isValidClockTime('08:60')).toBe(false);
    expect(isValidClockTime('0800')).toBe(false);
  });
});

describe('round-trip UTC (ADR-0031)', () => {
  it('toDbTime scrive su base 1970-01-01 in UTC', () => {
    expect(toDbTime('08:00').toISOString()).toBe('1970-01-01T08:00:00.000Z');
  });
  it('formatDbTime legge una @db.Time senza slittamento locale', () => {
    expect(formatDbTime(new Date('1970-01-01T13:00:00Z'))).toBe('13:00');
    expect(formatDbTime(new Date('1970-01-01T00:05:00Z'))).toBe('00:05');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @coralyn/api test -- time.spec`
Expected: FAIL — "Cannot find module './time'".

- [ ] **Step 3: Write minimal implementation** — `apps/api/src/common/time.ts`

```ts
/** True se `s` è "HH:MM" 24h reale (00:00–23:59). Gemello di isValidCalendarDate. */
export function isValidClockTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** "HH:MM" → valore da scrivere in @db.Time (round-trip UTC su base 1970, ADR-0031). */
export function toDbTime(s: string): Date {
  return new Date(`1970-01-01T${s}:00Z`);
}

/** Serializza una @db.Time (Date su base 1970) in "HH:MM" via UTC. Mai metodi locali. */
export function formatDbTime(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter @coralyn/api test -- time.spec`
Expected: PASS.

### 1.2 — Contratti + validator + DTO (no dedicated test; coperti dall'e2e)

- [ ] **Step 5: Aggiorna i contratti** — `packages/contracts/src/index.ts`

Modifica `TimeSlotDTO` (attualmente `{ id; name; sortOrder }`) e aggiungi i due Input subito sotto:

```ts
export interface TimeSlotDTO {
  id: string;
  name: string;
  startTime?: string; // "HH:MM" (semiaperto [start,end)); assente per consumatori legacy
  endTime?: string;   // "HH:MM"
  sortOrder: number;
}

/** Input creazione fascia: orari "HH:MM" obbligatori; sortOrder default = append in coda. */
export interface CreateTimeSlotInput {
  name: string;
  startTime: string;
  endTime: string;
  sortOrder?: number;
}

/** Input modifica fascia: tutti opzionali (patch). Orari "HH:MM". */
export interface UpdateTimeSlotInput {
  name?: string;
  startTime?: string;
  endTime?: string;
  sortOrder?: number;
}
```

- [ ] **Step 6: Rebuild contracts**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build OK.

- [ ] **Step 7: Validator `@IsClockTime()`** — `apps/api/src/common/is-clock-time.ts`

```ts
import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidClockTime } from './time';

/** Valida "HH:MM" come orario 24h reale (gemello di IsCalendarDate). */
export function IsClockTime(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isClockTime',
      target: object.constructor,
      propertyName,
      options: { message: 'time must be a real HH:MM 24h clock time', ...options },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidClockTime(value);
        },
      },
    });
  };
}
```

- [ ] **Step 8: DTO create** — `apps/api/src/catalog/dto/create-time-slot.dto.ts`

```ts
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import type { CreateTimeSlotInput } from '@coralyn/contracts';
import { IsClockTime } from '../../common/is-clock-time';

export class CreateTimeSlotDto implements CreateTimeSlotInput {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsClockTime()
  startTime!: string;

  @IsClockTime()
  endTime!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
```

- [ ] **Step 9: DTO update** — `apps/api/src/catalog/dto/update-time-slot.dto.ts`

```ts
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import type { UpdateTimeSlotInput } from '@coralyn/contracts';
import { IsClockTime } from '../../common/is-clock-time';

export class UpdateTimeSlotDto implements UpdateTimeSlotInput {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsClockTime()
  startTime?: string;

  @IsOptional()
  @IsClockTime()
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
```

- [ ] **Step 10: Proiezione** — `apps/api/src/catalog/time-slot.projection.ts`

```ts
import type { TimeSlot } from '@prisma/client';
import type { TimeSlotDTO } from '@coralyn/contracts';
import { formatDbTime } from '../common/time';

export function toTimeSlotDTO(row: TimeSlot): TimeSlotDTO {
  return {
    id: row.id,
    name: row.name,
    startTime: formatDbTime(row.startTime),
    endTime: formatDbTime(row.endTime),
    sortOrder: row.sortOrder,
  };
}
```

### 1.3 — Service + controller + modulo

- [ ] **Step 11: Service** — `apps/api/src/catalog/time-slots.service.ts`

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateTimeSlotInput, TimeSlotDTO, UpdateTimeSlotInput } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { toDbTime, formatDbTime } from '../common/time';
import { toTimeSlotDTO } from './time-slot.projection';

@Injectable()
export class TimeSlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async list(): Promise<TimeSlotDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) =>
      tx.timeSlot.findMany({ orderBy: { sortOrder: 'asc' } }),
    );
    return rows.map(toTimeSlotDTO);
  }

  async create(input: CreateTimeSlotInput): Promise<TimeSlotDTO> {
    // "HH:MM" lessicografico == cronologico; semiaperto [start,end) → start < end.
    if (input.startTime >= input.endTime) {
      throw new BadRequestException("L'orario di inizio deve precedere quello di fine.");
    }
    const tenantId = this.tenant.require();
    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      const sortOrder = input.sortOrder ?? (await this.nextSortOrder(tx, tenantId));
      return tx.timeSlot.create({
        data: {
          establishmentId: tenantId,
          name: input.name,
          startTime: toDbTime(input.startTime),
          endTime: toDbTime(input.endTime),
          sortOrder,
        },
      });
    });
    return toTimeSlotDTO(created);
  }

  async update(id: string, input: UpdateTimeSlotInput): Promise<TimeSlotDTO> {
    const tenantId = this.tenant.require();
    const result = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.timeSlot.findFirst({ where: { id } });
      if (!existing) return null;
      // Orario effettivo dopo il patch (input.* è instanza class-transformer: guardia !== undefined).
      const startStr = input.startTime !== undefined ? input.startTime : formatDbTime(existing.startTime);
      const endStr = input.endTime !== undefined ? input.endTime : formatDbTime(existing.endTime);
      if (startStr >= endStr) {
        throw new BadRequestException("L'orario di inizio deve precedere quello di fine.");
      }
      const data: Prisma.TimeSlotUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.startTime !== undefined) data.startTime = toDbTime(input.startTime);
      if (input.endTime !== undefined) data.endTime = toDbTime(input.endTime);
      if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
      return tx.timeSlot.update({ where: { id }, data });
    });
    if (!result) throw new NotFoundException('Fascia non trovata');
    return toTimeSlotDTO(result);
  }

  /**
   * Elimina una fascia del tenant e la ritorna. 409 se referenziata da tariffe/prenotazioni
   * (Rate_timeSlotId_fkey è SET NULL → senza guardia azzererebbe silenziosamente il timeSlotId
   * di tariffe autoritative; Booking_timeSlotId_fkey è RESTRICT). 409 se è l'ultima fascia del
   * tenant (una prenotazione richiede sempre una fascia). Specchio di deletePackage.
   */
  async remove(id: string): Promise<TimeSlotDTO> {
    const tenantId = this.tenant.require();
    const removed = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.timeSlot.findFirst({ where: { id } });
      if (!existing) return null;
      const [rateCount, bookingCount, total] = await Promise.all([
        tx.rate.count({ where: { timeSlotId: id } }),
        tx.booking.count({ where: { timeSlotId: id } }),
        tx.timeSlot.count({}),
      ]);
      if (rateCount > 0 || bookingCount > 0) {
        throw new ConflictException('Fascia in uso da tariffe o prenotazioni: non eliminabile.');
      }
      if (total <= 1) {
        throw new ConflictException('Deve esistere almeno una fascia.');
      }
      await tx.timeSlot.delete({ where: { id } });
      return existing;
    });
    if (!removed) throw new NotFoundException('Fascia non trovata');
    return toTimeSlotDTO(removed);
  }

  private async nextSortOrder(tx: Prisma.TransactionClient, _tenantId: string): Promise<number> {
    const last = await tx.timeSlot.findFirst({ orderBy: { sortOrder: 'desc' } });
    return (last?.sortOrder ?? 0) + 1;
  }
}
```

- [ ] **Step 12: Controller** — `apps/api/src/catalog/time-slots.controller.ts`

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type { TimeSlotDTO } from '@coralyn/contracts';
import { TimeSlotsService } from './time-slots.service';
import { CreateTimeSlotDto } from './dto/create-time-slot.dto';
import { UpdateTimeSlotDto } from './dto/update-time-slot.dto';

@Controller('time-slots')
export class TimeSlotsController {
  constructor(private readonly timeSlots: TimeSlotsService) {}

  @Get()
  list(): Promise<TimeSlotDTO[]> {
    return this.timeSlots.list();
  }

  @Post()
  create(@Body() body: CreateTimeSlotDto): Promise<TimeSlotDTO> {
    return this.timeSlots.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateTimeSlotDto): Promise<TimeSlotDTO> {
    return this.timeSlots.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<TimeSlotDTO> {
    return this.timeSlots.remove(id);
  }
}
```

- [ ] **Step 13: Registra nel modulo** — `apps/api/src/catalog/catalog.module.ts`

Aggiungi gli import e inseriscili negli array `controllers`/`providers`:

```ts
import { TimeSlotsController } from './time-slots.controller';
import { TimeSlotsService } from './time-slots.service';
// ...
@Module({
  controllers: [PackagesController, SeasonsController, RatesController, TimeSlotsController],
  providers: [CatalogService, SeasonsService, RatesService, TimeSlotsService],
  exports: [CatalogService],
})
export class CatalogModule {}
```

### 1.4 — e2e (contratto completo del CRUD)

- [ ] **Step 14: Write the failing e2e** — `apps/api/test/time-slots.e2e-spec.ts`

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { seedMapTenant, cleanMapTenant, type MapSeedIds } from './helpers/seed-map';

describe('TimeSlots (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let token1: string;
  let token2: string;
  let ids: MapSeedIds;
  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Slot A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Slot B' } })).id;
    await createUser(prisma, { email: 'admin.ts1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'admin.ts2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    token1 = await login(app, 'admin.ts1@e2e.test', 'pw1');
    token2 = await login(app, 'admin.ts2@e2e.test', 'pw2');
    ids = await seedMapTenant(prisma, s1); // crea Mattina + Pomeriggio (2 fasce) + struttura
  });

  afterAll(async () => {
    await prisma.forTenant(s1, async (tx) => {
      await tx.booking.deleteMany({});
      await tx.rate.deleteMany({});
      await tx.pricing.deleteMany({});
      await tx.season.deleteMany({});
    });
    await cleanMapTenant(prisma, s1);
    await prisma.user.deleteMany({ where: { email: { in: ['admin.ts1@e2e.test', 'admin.ts2@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('GET elenca le fasce con orari "HH:MM" ordinate per sortOrder', async () => {
    const res = await request(app.getHttpServer()).get('/api/time-slots').set(...bearer(token1)).expect(200);
    expect(res.body.map((s: { name: string }) => s.name)).toEqual(['Mattina', 'Pomeriggio']);
    expect(res.body[0]).toMatchObject({ name: 'Mattina', startTime: '08:00', endTime: '13:00' });
  });

  it('POST crea una fascia "Giornata intera" sovrapposta (overlap AMMESSO) e appende in coda', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/time-slots').set(...bearer(token1))
      .send({ name: 'Giornata intera', startTime: '08:00', endTime: '19:00' }).expect(201);
    expect(res.body).toMatchObject({ name: 'Giornata intera', startTime: '08:00', endTime: '19:00', sortOrder: 3 });
  });

  it('POST con startTime >= endTime → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/time-slots').set(...bearer(token1))
      .send({ name: 'Invalida', startTime: '13:00', endTime: '08:00' }).expect(400);
  });

  it('POST con orario malformato → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/time-slots').set(...bearer(token1))
      .send({ name: 'Bad', startTime: '8:00', endTime: '19:00' }).expect(400);
  });

  it('PATCH aggiorna nome e orari', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/time-slots').set(...bearer(token1))
      .send({ name: 'Serale', startTime: '17:00', endTime: '19:00' }).expect(201);
    const patched = await request(app.getHttpServer())
      .patch(`/api/time-slots/${created.body.id}`).set(...bearer(token1))
      .send({ name: 'Sera', endTime: '20:00' }).expect(200);
    expect(patched.body).toMatchObject({ name: 'Sera', startTime: '17:00', endTime: '20:00' });
    // pulizia
    await request(app.getHttpServer()).delete(`/api/time-slots/${created.body.id}`).set(...bearer(token1)).expect(200);
  });

  it('PATCH che invaliderebbe l’ordine (start>=end) → 400', async () => {
    await request(app.getHttpServer())
      .patch(`/api/time-slots/${ids.slotMorning}`).set(...bearer(token1))
      .send({ startTime: '14:00' }).expect(400); // Mattina finisce alle 13:00
  });

  it('DELETE di una fascia referenziata da una tariffa → 409', async () => {
    // crea stagione+pricing e una tariffa che usa slotAfternoon
    const seasonId = (await request(app.getHttpServer())
      .post('/api/seasons').set(...bearer(token1))
      .send({ name: 'Estate 2029', startDate: '2029-06-01', endDate: '2029-09-30' })).body.id;
    const rate = await request(app.getHttpServer())
      .post('/api/rates').set(...bearer(token1))
      .send({ seasonId, timeSlotId: ids.slotAfternoon, price: 20, unit: 'day' }).expect(201);
    await request(app.getHttpServer())
      .delete(`/api/time-slots/${ids.slotAfternoon}`).set(...bearer(token1)).expect(409);
    // pulizia tariffa+stagione (lascia le 2 fasce base)
    await request(app.getHttpServer()).delete(`/api/rates/${rate.body.id}`).set(...bearer(token1)).expect(200);
    await request(app.getHttpServer()).delete(`/api/seasons/${seasonId}`).set(...bearer(token1)).expect(200);
  });

  it('DELETE dell’ultima fascia rimasta → 409', async () => {
    // s2 non ha fasce: creane esattamente una e prova a eliminarla
    const only = await request(app.getHttpServer())
      .post('/api/time-slots').set(...bearer(token2))
      .send({ name: 'Unica', startTime: '08:00', endTime: '19:00' }).expect(201);
    await request(app.getHttpServer())
      .delete(`/api/time-slots/${only.body.id}`).set(...bearer(token2)).expect(409);
    // pulizia s2
    await prisma.forTenant(s2, async (tx) => { await tx.timeSlot.deleteMany({}); });
  });

  it('DELETE riuscita quando non referenziata e non è l’ultima', async () => {
    const extra = await request(app.getHttpServer())
      .post('/api/time-slots').set(...bearer(token1))
      .send({ name: 'Temporanea', startTime: '10:00', endTime: '12:00' }).expect(201);
    const del = await request(app.getHttpServer())
      .delete(`/api/time-slots/${extra.body.id}`).set(...bearer(token1)).expect(200);
    expect(del.body.id).toBe(extra.body.id);
  });

  it('DELETE inesistente/cross-tenant → 404', async () => {
    await request(app.getHttpServer())
      .delete(`/api/time-slots/${ids.slotMorning}`).set(...bearer(token2)).expect(404); // di s1, visto da s2
  });

  it('isolamento: s2 non vede le fasce di s1', async () => {
    const list = await request(app.getHttpServer()).get('/api/time-slots').set(...bearer(token2)).expect(200);
    expect(list.body).toEqual([]);
  });
});
```

- [ ] **Step 15: Run the e2e to verify it fails**

Run: `corepack pnpm --filter @coralyn/api test:e2e -- time-slots`
Expected: FAIL (404 sulle rotte / modulo non registrato) — poi PASS dopo Step 11-13. Se già verde perché gli step precedenti sono completi, procedi.

- [ ] **Step 16: Run full api unit + e2e — verde, conteggi cresciuti**

Run:
```bash
corepack pnpm --filter @coralyn/api test
corepack pnpm --filter @coralyn/api test:e2e
```
Expected: api unit **> 84** (aggiunge `time.spec` = +6 circa) · e2e **> 114** (aggiunge la suite time-slots). Nessun test rosso.

- [ ] **Step 17: Commit**

```bash
git add packages/contracts/src/index.ts apps/api/src/common/time.ts apps/api/src/common/time.spec.ts \
  apps/api/src/common/is-clock-time.ts apps/api/src/catalog/time-slot.projection.ts \
  apps/api/src/catalog/dto/create-time-slot.dto.ts apps/api/src/catalog/dto/update-time-slot.dto.ts \
  apps/api/src/catalog/time-slots.service.ts apps/api/src/catalog/time-slots.controller.ts \
  apps/api/src/catalog/catalog.module.ts apps/api/test/time-slots.e2e-spec.ts
git commit -m "feat(catalog): CRUD fasce (TimeSlots) con orari HH:MM UTC e delete-guard 409

- TimeSlotsController/Service nel CatalogModule (pattern Seasons/Rates)
- common/time.ts (toDbTime/formatDbTime/isValidClockTime) round-trip UTC ADR-0031
- @IsClockTime() validator; startTime<endTime → 400; overlap fra fasce ammesso
- delete-guard 409 (rate/booking ref + ultima fascia) specchio di deletePackage
- TimeSlotDTO espone startTime/endTime (opzionali, additivo); Create/UpdateTimeSlotInput
- e2e time-slots (CRUD, 400, 409 ref/ultima, 404 cross-tenant, isolamento)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Layer 2 — Esposizione orari nel DTO mappa

**Files:**
- Modify: `apps/api/src/map/map.projection.ts:37` (aggiunge startTime/endTime)
- Modify: `apps/api/src/map/map.projection.spec.ts` (attesa timeSlots con orari)

**Interfaces:**
- Consumes: `formatDbTime` (`common/time.ts`, Task 1), `TimeSlotDTO` (orari opzionali, Task 1).
- Produces: `GET /api/map` restituisce `timeSlots[i].startTime`/`endTime` ("HH:MM").

- [ ] **Step 1: Aggiorna il test della proiezione** — `apps/api/src/map/map.projection.spec.ts`

Sostituisci l'asserzione su `dto.timeSlots` (attualmente `{ id, name, sortOrder }`) con la forma completa:

```ts
    expect(dto.timeSlots).toEqual([
      { id: 's1', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
      { id: 's2', name: 'Pomeriggio', startTime: '13:00', endTime: '19:00', sortOrder: 2 },
    ]);
```

(Il seed `MAP` dello spec ha già `startTime`/`endTime` come `Date` su base 1970 — righe 6-8 — quindi non serve altro nel fixture.)

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @coralyn/api test -- map.projection`
Expected: FAIL — il DTO attuale non ha `startTime`/`endTime`.

- [ ] **Step 3: Aggiorna la proiezione** — `apps/api/src/map/map.projection.ts`

Importa l'helper e arricchisci il mapping a riga 37:

```ts
import { formatDbTime } from '../catalog/../common/time';
```
(usa il path relativo corretto: `../common/time`)

```ts
  const timeSlots: TimeSlotDTO[] = source.timeSlots.map((s) => ({
    id: s.id,
    name: s.name,
    startTime: formatDbTime(s.startTime),
    endTime: formatDbTime(s.endTime),
    sortOrder: s.sortOrder,
  }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter @coralyn/api test -- map.projection`
Expected: PASS.

- [ ] **Step 5: Run map e2e — nessuna regressione**

Run: `corepack pnpm --filter @coralyn/api test:e2e -- map`
Expected: PASS (se il map e2e asserisce la forma dei `timeSlots`, aggiorna anche lì aggiungendo `startTime`/`endTime`; altrimenti nessun cambiamento).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/map/map.projection.ts apps/api/src/map/map.projection.spec.ts
git commit -m "feat(map): espone startTime/endTime delle fasce nel DTO mappa

- map.projection mappa gli orari HH:MM via formatDbTime (round-trip UTC)
- TimeSlotDTO della mappa == quello di GET /time-slots (stessa forma)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Layer 3 — FE editor fasce (vista Listino)

**Files:**
- Create: `apps/web-staff/src/features/pricing/useTimeSlots.ts`
- Modify: `apps/web-staff/src/lib/queryKeys.ts` (chiave `timeSlots`)
- Modify: `apps/web-staff/src/features/pricing/PricingView.vue` (editor + modale + estende PendingDelete)
- Modify: `apps/web-staff/src/mocks/server.ts` (handler CRUD `/api/time-slots` + reset)
- Modify: `apps/web-staff/src/mocks/data/seed.ts` (fixture lista fasce con orari)
- Create/Modify: `apps/web-staff/src/features/pricing/PricingView.spec.ts` (test editor)

**Interfaces:**
- Consumes: `TimeSlotDTO`, `CreateTimeSlotInput`, `UpdateTimeSlotInput` (Task 1); `queryResource`/`mutationResource`; `ConfirmDialog`/`Modal`/`Field`/`Input` da `@coralyn/ui-kit`; toast automatico su errore mutation (`useQueryResource` pubblica il `message` server).
- Produces: `useTimeSlots()`, `useCreateTimeSlot()`, `useUpdateTimeSlot()`, `useDeleteTimeSlot()` (invalidano `['time-slots']` e `['map']`); `queryKeys.timeSlots(tenantId)`.

- [ ] **Step 1: chiave query** — `apps/web-staff/src/lib/queryKeys.ts`

Aggiungi accanto a `seasons`/`rates`:

```ts
  timeSlots: (tenantId: string) => ['time-slots', tenantId] as const,
```

- [ ] **Step 2: composable** — `apps/web-staff/src/features/pricing/useTimeSlots.ts`

```ts
import type { CreateTimeSlotInput, TimeSlotDTO, UpdateTimeSlotInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

/** Le mutazioni fasce invalidano sia la lista sia la mappa (le fasce cambiano la cella e le opzioni tariffa). */
export function useTimeSlots() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.timeSlots(session.establishmentId),
    queryFn: () => apiFetch<TimeSlotDTO[]>('/time-slots'),
  });
}

function invalidateSlotsAndMap(session: ReturnType<typeof useSessionStore>) {
  return [queryKeys.timeSlots(session.establishmentId), ['map', session.establishmentId]];
}

export function useCreateTimeSlot() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateTimeSlotInput) =>
      apiFetch<TimeSlotDTO>('/time-slots', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => invalidateSlotsAndMap(session),
  });
}

export function useUpdateTimeSlot() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string; input: UpdateTimeSlotInput }) =>
      apiFetch<TimeSlotDTO>(`/time-slots/${vars.id}`, { method: 'PATCH', body: JSON.stringify(vars.input) }),
    invalidates: () => invalidateSlotsAndMap(session),
  });
}

export function useDeleteTimeSlot() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<TimeSlotDTO>(`/time-slots/${id}`, { method: 'DELETE' }),
    invalidates: () => invalidateSlotsAndMap(session),
  });
}
```

Nota: verifica la firma esatta di `queryKeys.dayMap` per l'invalidazione mappa. `queryKeys.dayMap` è `['map', tenantId, date]`; invalidare `['map', tenantId]` come **prefisso** invalida tutte le date (TanStack Query fa match per prefisso). Se `invalidates` richiede chiavi esatte, usa `queryKeys.dayMap(session.establishmentId, session.activeDate)` importando lo store; il prefisso `['map', tenantId]` è preferibile perché copre ogni data in cache.

- [ ] **Step 3: MSW handler + fixture** — `apps/web-staff/src/mocks/data/seed.ts` e `apps/web-staff/src/mocks/server.ts`

In `seed.ts` aggiungi una lista fasce dedicata (con orari) e aggiorna i `timeSlots` del `mapSeed` con gli orari:

```ts
// in mapSeed.timeSlots:
  timeSlots: [
    { id: 'f-mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
    { id: 'f-pom', name: 'Pomeriggio', startTime: '13:00', endTime: '19:00', sortOrder: 2 },
  ],

// nuova fixture esportata per l'endpoint /time-slots:
export const timeSlotsSeed: TimeSlotDTO[] = [
  { id: 'f-mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
  { id: 'f-pom', name: 'Pomeriggio', startTime: '13:00', endTime: '19:00', sortOrder: 2 },
];
```
(aggiungi `import type { TimeSlotDTO } from '@coralyn/contracts';` in testa a `seed.ts`.)

In `server.ts` aggiungi lo stato mutabile + reset (accanto a `rates`/`seasons`) e i 4 handler:

```ts
import { mapSeed, timeSlotsSeed } from './data/seed';
import type { TimeSlotDTO, CreateTimeSlotInput, UpdateTimeSlotInput } from '@coralyn/contracts';

let timeSlots: TimeSlotDTO[] = timeSlotsSeed.map((s) => ({ ...s }));
// in resetMocks()/beforeEach di reset:
timeSlots = timeSlotsSeed.map((s) => ({ ...s }));

// handlers:
http.get('/api/time-slots', () => HttpResponse.json(timeSlots)),
http.post('/api/time-slots', async ({ request }) => {
  const b = (await request.json()) as CreateTimeSlotInput;
  const created: TimeSlotDTO = { id: `ts-${timeSlots.length + 1}`, sortOrder: timeSlots.length + 1, ...b };
  timeSlots.push(created);
  return HttpResponse.json(created, { status: 201 });
}),
http.patch('/api/time-slots/:id', async ({ params, request }) => {
  const patch = (await request.json()) as UpdateTimeSlotInput;
  const i = timeSlots.findIndex((s) => s.id === params.id);
  if (i < 0) return new HttpResponse(null, { status: 404 });
  timeSlots[i] = { ...timeSlots[i], ...patch };
  return HttpResponse.json(timeSlots[i]);
}),
http.delete('/api/time-slots/:id', ({ params }) => {
  const i = timeSlots.findIndex((s) => s.id === params.id);
  if (i < 0) return new HttpResponse(null, { status: 404 });
  // simula la delete-guard: 'f-pom' è "in uso" per testare il 409 → toast
  if (params.id === 'f-pom') {
    return HttpResponse.json({ message: 'Fascia in uso da tariffe o prenotazioni: non eliminabile.' }, { status: 409 });
  }
  const [removed] = timeSlots.splice(i, 1);
  return HttpResponse.json(removed);
}),
```
(Verifica come `server.ts` fa reset dello stato — replica lo stesso meccanismo di `rates`.)

- [ ] **Step 4: editor nel template + script** — `apps/web-staff/src/features/pricing/PricingView.vue`

Nello **script setup**: importa il composable e le mutation; estendi l'union `PendingDelete` con `timeSlot`; aggiungi la modale add/edit.

```ts
import { useTimeSlots, useCreateTimeSlot, useUpdateTimeSlot, useDeleteTimeSlot } from './useTimeSlots';
import type { TimeSlotDTO } from '@coralyn/contracts';
// ...
const { data: slots } = useTimeSlots();
const createSlot = useCreateTimeSlot();
const updateSlot = useUpdateTimeSlot();
const deleteSlot = useDeleteTimeSlot();

// estendi PendingDelete:
type PendingDelete =
  | { kind: 'season'; id: string; name: string }
  | { kind: 'package'; id: string; name: string }
  | { kind: 'rate'; id: string }
  | { kind: 'timeSlot'; id: string; name: string };

function askDeleteTimeSlot(s: { id: string; name: string }) {
  pendingDelete.value = { kind: 'timeSlot', id: s.id, name: s.name };
  confirmOpen.value = true;
}
// in confirmCopy computed, aggiungi:
//   if (p?.kind === 'timeSlot')
//     return { title: 'Eliminare la fascia?', description: `«${p.name}». Se è usata da tariffe o prenotazioni non sarà eliminata.` };
// in onConfirmDelete, aggiungi il ramo:
//   else if (p.kind === 'timeSlot') deleteSlot.mutate(p.id);

// modale add/edit fascia
const slotModal = ref(false);
const editingSlotId = ref<string | null>(null);
const slotName = ref(''); const slotStart = ref(''); const slotEnd = ref('');
function openCreateSlot() {
  editingSlotId.value = null; slotName.value = ''; slotStart.value = '08:00'; slotEnd.value = '19:00';
  slotModal.value = true;
}
function openEditSlot(s: TimeSlotDTO) {
  editingSlotId.value = s.id; slotName.value = s.name;
  slotStart.value = s.startTime ?? ''; slotEnd.value = s.endTime ?? '';
  slotModal.value = true;
}
function submitSlot() {
  const input = { name: slotName.value, startTime: slotStart.value, endTime: slotEnd.value };
  if (editingSlotId.value) {
    updateSlot.mutate({ id: editingSlotId.value, input }, { onSuccess: () => (slotModal.value = false) });
  } else {
    createSlot.mutate(input, { onSuccess: () => (slotModal.value = false) });
  }
}
```

Nel **template**: sostituisci la sezione pill (righe ~296-303) con un editor (lista + azioni + bottone "Nuova fascia") e aggiungi la modale. Rispetta lo stile delle Card pacchetti già presenti:

```vue
<!-- Fasce orarie della giornata (editor) -->
<div class="mb-4">
  <div class="mb-2 flex items-center justify-between">
    <span class="text-[13px] font-semibold text-[var(--color-text-2nd)]">Fasce orarie</span>
    <Button data-test="new-time-slot" @click="openCreateSlot"><Icon name="plus" :size="16" />Nuova fascia</Button>
  </div>
  <EmptyState v-if="(slots?.length ?? 0) === 0" message="Nessuna fascia. Creane una con «Nuova fascia»." />
  <div v-else class="flex flex-wrap gap-2.5">
    <div v-for="f in slots" :key="f.id" :data-test="`slot-${f.id}`"
      class="flex items-center gap-2 rounded-[11px] border border-[var(--color-border)] bg-[var(--color-raised)] px-3.5 py-2">
      <Icon name="clock" :size="15" class="text-[var(--color-accent)]" />
      <span class="text-[12.5px] font-semibold text-[var(--color-text)]">{{ f.name }}</span>
      <span v-if="f.startTime" class="text-[11.5px] text-[var(--color-text-muted)]">{{ f.startTime }}–{{ f.endTime }}</span>
      <button type="button" title="Modifica" class="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
        :data-test="`edit-slot-${f.id}`" @click="openEditSlot(f)"><Icon name="edit" :size="14" /></button>
      <button type="button" title="Elimina" class="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
        :data-test="`del-slot-${f.id}`" @click="askDeleteTimeSlot(f)"><Icon name="trash-2" :size="14" /></button>
    </div>
  </div>
</div>

<!-- Modale add/edit fascia -->
<Modal v-model:open="slotModal" :title="editingSlotId ? 'Modifica fascia' : 'Nuova fascia'">
  <div class="flex flex-col gap-3">
    <Field label="Nome"><Input v-model="slotName" data-test="slot-name" placeholder="Es. Mattina" /></Field>
    <div class="flex gap-3">
      <Field label="Inizio" class="flex-1"><Input v-model="slotStart" type="time" data-test="slot-start" /></Field>
      <Field label="Fine" class="flex-1"><Input v-model="slotEnd" type="time" data-test="slot-end" /></Field>
    </div>
  </div>
  <ModalFooter submit-label="Salva" @submit="submitSlot" @cancel="slotModal = false" />
</Modal>
```
(Importa `ModalFooter` da `@coralyn/ui-kit` se non già importato in PricingView.)

- [ ] **Step 5: Write the failing test** — `apps/web-staff/src/features/pricing/PricingView.spec.ts`

Se il file esiste, aggiungi i casi; altrimenti crealo seguendo il pattern degli altri spec della vista (montaggio con `renderWithProviders` / setup MSW già attivo nei test). Casi minimi:

```ts
// 1) l'editor elenca le fasce con orari
it('elenca le fasce con orari', async () => {
  // monta PricingView; attende il fetch /time-slots
  expect(screen.getByTestId('slot-f-mat')).toHaveTextContent('Mattina');
  expect(screen.getByTestId('slot-f-mat')).toHaveTextContent('08:00–13:00');
});

// 2) crea una fascia → compare
it('crea una nuova fascia', async () => {
  await user.click(screen.getByTestId('new-time-slot'));
  await user.type(screen.getByTestId('slot-name'), 'Serale');
  await user.clear(screen.getByTestId('slot-start')); await user.type(screen.getByTestId('slot-start'), '17:00');
  await user.clear(screen.getByTestId('slot-end')); await user.type(screen.getByTestId('slot-end'), '19:00');
  await user.click(screen.getByRole('button', { name: /salva/i }));
  expect(await screen.findByText('Serale')).toBeInTheDocument();
});

// 3) delete di una fascia in uso (f-pom) → 409 → toast col messaggio server
it('mostra toast quando la fascia è in uso (409)', async () => {
  await user.click(screen.getByTestId('del-slot-f-pom'));
  await user.click(screen.getByRole('button', { name: /elimina|conferma/i }));
  expect(await screen.findByText(/Fascia in uso/i)).toBeInTheDocument();
});
```
Adatta i selettori/helper esatti agli spec vicini (`RatesView`/pacchetti) — replica il loro montaggio e le utility `user`/`screen`.

- [ ] **Step 6: Run test to verify it fails, then implement/adjust until green**

Run: `corepack pnpm --filter @coralyn/contracts build && rm -rf apps/web-staff/node_modules/.vite && corepack pnpm --filter @coralyn/web-staff test -- PricingView`
Expected: prima FAIL, poi PASS dopo gli step 1-4.

- [ ] **Step 7: typecheck + suite web-staff completa**

Run:
```bash
corepack pnpm --filter @coralyn/web-staff typecheck
corepack pnpm --filter @coralyn/web-staff test
```
Expected: typecheck pulito; web-staff **> 128** (nuovi casi editor). Nessun rosso.

- [ ] **Step 8: Commit**

```bash
git add apps/web-staff/src/features/pricing/useTimeSlots.ts apps/web-staff/src/lib/queryKeys.ts \
  apps/web-staff/src/features/pricing/PricingView.vue apps/web-staff/src/features/pricing/PricingView.spec.ts \
  apps/web-staff/src/mocks/server.ts apps/web-staff/src/mocks/data/seed.ts
git commit -m "feat(web-staff): editor fasce nel Listino (add/edit + delete via ConfirmDialog)

- useTimeSlots (list/create/update/delete); invalida ['time-slots'] e ['map']
- PricingView: lista fasce con orari, modale add/edit, delete con conferma
- 409 (fascia in uso / ultima) → toast globale col messaggio server
- MSW handler /time-slots + fixture con orari

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Layer 4 — FE mappa: due metà derivate dagli orari

**Files:**
- Modify: `apps/web-staff/src/features/map/MapView.vue` (deriva morning/afternoon dagli orari, non da `[0]/[1]`)
- Modify: `apps/web-staff/src/features/map/MapView.spec.ts` (seed a 3 fasce: Giornata/Mattina/Pomeriggio)

**Interfaces:**
- Consumes: `TimeSlotDTO.startTime/endTime` (ora sempre valorizzati dalla mappa dopo Task 2); `stateBySlot` (già overlap-aware lato proiezione).
- Produces: `slotState(u, 0|1)` legge lo stato della metà mattutina/pomeridiana derivata dagli orari; fallback all'indice quando gli orari non ci sono.

**Regola di derivazione (spec §6), implementata come computed:**

1. `dayStart = min(startTime)`, `dayEnd = max(endTime)` fra le fasce esposte.
2. La fascia **"piena"** = quella con `startTime == dayStart && endTime == dayEnd` **e** con più di una fascia presente. Non è una metà (riempie entrambe via overlap, già garantito).
3. Le **due metà** = le fasce **non-piene** ordinate per `startTime`: prima → Mattina (idx 0), ultima → Pomeriggio (idx 1). Con una sola fascia → stato uniforme (entrambe le metà = quell'unica fascia). Fallback: se mancano gli orari, usa `timeSlots[idx]` (comportamento attuale).

- [ ] **Step 1: Write the failing test** — `apps/web-staff/src/features/map/MapView.spec.ts`

Aggiungi un blocco con override MSW a 3 fasce (Giornata intera 08–19, Mattina 08–13, Pomeriggio 13–19) e un ombrellone con:
- prenotazione *Giornata intera* → `stateBySlot` occupato su TUTTE e tre le fasce (la proiezione via overlap lo fa già) → **entrambe** le metà occupate;
- un ombrellone con prenotazione *Mattina* → solo Mattina occupato via `stateBySlot['gionata']=free,['mat']=daily,['pom']=free`.

```ts
// fixture mappa a 3 fasce
const map3 = {
  date: '2026-06-27',
  umbrellaTypes: [{ id: 't1', name: 'Palma', sortOrder: 1, icon: 'palmtree' }],
  timeSlots: [
    { id: 'giorno', name: 'Giornata intera', startTime: '08:00', endTime: '19:00', sortOrder: 3 },
    { id: 'mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
    { id: 'pom', name: 'Pomeriggio', startTime: '13:00', endTime: '19:00', sortOrder: 2 },
  ],
  sectors: [{
    id: 'sec', name: 'Centro', sortOrder: 1,
    rows: [{ id: 'r1', label: 'Fila 1', sortOrder: 1, umbrellas: [
      // Giornata intera occupata → overlap segna occupate tutte e 3 le fasce
      { id: 'u-full', label: '1', umbrellaTypeId: 't1', rowId: 'r1',
        stateBySlot: { giorno: 'daily', mat: 'daily', pom: 'daily' } },
      // Solo Mattina occupata
      { id: 'u-mat', label: '2', umbrellaTypeId: 't1', rowId: 'r1',
        stateBySlot: { giorno: 'free', mat: 'daily', pom: 'free' } },
    ] }],
  }],
};

it('deriva le due metà dagli orari: Giornata intera occupa mattina+pomeriggio', async () => {
  server.use(http.get('/api/map', () => HttpResponse.json(map3)));
  // monta MapView, attende la mappa
  const full = screen.getByLabelText(/Ombrellone 1/);
  // entrambe le metà "Giornaliero"
  expect(full).toHaveAccessibleName(/mattina Giornaliero, pomeriggio Giornaliero/);
  const onlyMat = screen.getByLabelText(/Ombrellone 2/);
  expect(onlyMat).toHaveAccessibleName(/mattina Giornaliero, pomeriggio Libero/);
});
```
Adatta selettori/helper al pattern esistente di `MapView.spec.ts` (montaggio, `server.use`, `waitFor`).

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @coralyn/web-staff test -- MapView`
Expected: FAIL — l'attuale `slotState(u, idx)` usa `timeSlots[idx]`: con Giornata a `sortOrder:3` (ma l'array può arrivare non ordinato/ordinato per sortOrder), `[0]`/`[1]` non mappano più Mattina/Pomeriggio in modo affidabile.

- [ ] **Step 3: Implementa la derivazione** — `apps/web-staff/src/features/map/MapView.vue`

Sostituisci l'uso diretto di `timeSlots.value[idx]` con una computed `halfSlots` che restituisce `[mattinaSlot, pomeriggioSlot]` derivati dagli orari:

```ts
// Due metà derivate dagli orari (spec §6). Fallback all'ordine dell'array se mancano gli orari.
const halfSlots = computed<[TimeSlotDTO | undefined, TimeSlotDTO | undefined]>(() => {
  const all = timeSlots.value;
  if (all.length === 0) return [undefined, undefined];
  const withTimes = all.filter((s) => s.startTime && s.endTime);
  if (withTimes.length === 0) return [all[0], all[1] ?? all[0]]; // fallback legacy (nessun orario)
  const dayStart = withTimes.reduce((m, s) => (s.startTime! < m ? s.startTime! : m), withTimes[0].startTime!);
  const dayEnd = withTimes.reduce((m, s) => (s.endTime! > m ? s.endTime! : m), withTimes[0].endTime!);
  const halves = withTimes
    .filter((s) => !(withTimes.length > 1 && s.startTime === dayStart && s.endTime === dayEnd))
    .sort((a, b) => a.startTime!.localeCompare(b.startTime!));
  if (halves.length === 0) return [withTimes[0], withTimes[0]]; // solo la "piena"
  const morning = halves[0];
  const afternoon = halves[halves.length - 1];
  return [morning, afternoon];
});

function slotState(u: UmbrellaDTO, idx: number): SlotState {
  const s = halfSlots.value[idx] ?? halfSlots.value[0];
  return (u.stateBySlot[s?.id ?? ''] ?? 'free') as SlotState;
}
```

Fai lo stesso per `liveSlotState(idx)` (usa `halfSlots.value[idx]`). Importa `TimeSlotDTO` dai contracts se non già importato. La `selectedSlotId`/modale (che elenca TUTTE le fasce libere) resta invariata: continua a usare `timeSlots.value` completo.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter @coralyn/web-staff test -- MapView`
Expected: PASS.

- [ ] **Step 5: typecheck + suite web-staff completa (no regressioni)**

Run:
```bash
corepack pnpm --filter @coralyn/web-staff typecheck
corepack pnpm --filter @coralyn/web-staff test
```
Expected: typecheck pulito; web-staff **> Task 3** (nuovo caso mappa 3 fasce). Nessun rosso. La cella a 2 fasce (fixture standard `mapSeed`) continua a mostrare Mattina/Pomeriggio corrette.

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/map/MapView.vue apps/web-staff/src/features/map/MapView.spec.ts
git commit -m "feat(map): le due metà della cella derivano dagli orari delle fasce

- halfSlots: min(start)/max(end) → fascia piena (overlap) esclusa dalle metà;
  metà = fasce non-piene ordinate per startTime (Mattina/Pomeriggio)
- supporta il pattern Giornata intera + Mattina + Pomeriggio senza saltare gli indici
- fallback all'ordine dell'array quando gli orari sono assenti (N-slot arbitrario → D-015)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Chiusura dello slice (dopo Task 4)

- [ ] **Verifica finale full-suite (riconta dal vivo, non regredire):**

```bash
corepack pnpm --filter @coralyn/api test
corepack pnpm --filter @coralyn/api test:e2e
corepack pnpm --filter @coralyn/contracts build && rm -rf apps/web-staff/node_modules/.vite
corepack pnpm --filter @coralyn/web-staff test
corepack pnpm --filter @coralyn/web-staff typecheck
corepack pnpm --filter @coralyn/ui-kit test
```
Attesi: api unit **> 84** · api e2e **> 114** · web-staff **> 128** · ui-kit **55** (invariato, non toccato). Zero rossi.

- [ ] **Verifica live in dev (gotcha handoff §5 — REBUILD OBBLIGATORIO):**

```bash
docker compose --profile full up -d --build api web
```
Poi: login (web `localhost:8080`), vista Listino → crea/rinomina/elimina una fascia; elimina fascia in uso → 409/toast; mappa mostra le due metà corrette col pattern a 3 fasce. Password admin container `coralyn-admin-8473`.

- [ ] **Presenta lo stato all'utente e attendi conferma** prima di procedere a **B2 "Provenienza prezzo"** (brainstorming+spec dedicati, ADR-0009). NON auto-avviare B2.

## Self-Review (eseguita)

- **Copertura spec:** L1 CRUD+time+validator+delete-guard (§3) ✓; L2 orari nella proiezione (§4) ✓; L3 editor+ConfirmDialog+toast+MSW (§5) ✓; L4 metà derivate dagli orari + fallback (§6) ✓. Fuori scope B2 (§8) non toccato ✓.
- **Placeholder:** i test FE (Task 3 Step 5, Task 4 Step 1) indicano di "adattare selettori/helper al pattern degli spec vicini" perché il framework di montaggio esatto va letto dal file reale; ogni step ha codice concreto e comandi con output atteso.
- **Coerenza tipi:** `TimeSlotDTO.startTime?`/`endTime?` (opzionali) coerente in contracts→projection→FE; `CreateTimeSlotInput.startTime` obbligatorio; `halfSlots` restituisce `TimeSlotDTO | undefined`; nomi service `list/create/update/remove` allineati controller.
